import { NETWORK, CONTRACTS, ISSUER_ACCOUNT_HASH, TREASURY } from './config';
import type { ContractStateWithEpochs, EpochEntry } from './stateSnapshot';

/**
 * Pure-RPC reader for the four Odra contracts — no Rust binary required, so it
 * runs on serverless (Vercel). Mirrors deploy/src/read_state.rs field by field.
 *
 * Odra 2.x storage model (verified against the live testnet deployment):
 * every module field i (1-based, declaration order) stores its value in the
 * contract's `state` dictionary under item key
 *   hex( blake2b256( index_bytes ++ mapping_key_bytes ) )
 * where index_bytes for a top-level field is the u32 big-endian nibble-packed
 * path (field <= 15 → [0,0,0,i]) and mapping_key_bytes is the bytesrepr
 * serialization of the mapping key (empty for Var). The stored CLValue is a
 * List<U8>: 4-byte LE length + bytesrepr payload of the typed value.
 */

const RPC = NETWORK.nodeRpc;

// ── bytesrepr readers ────────────────────────────────────────────────────────
class R {
  constructor(private b: Buffer, private o = 0) {}
  u8() { return this.b[this.o++]; }
  bool() { return this.u8() === 1; }
  u32() { const v = this.b.readUInt32LE(this.o); this.o += 4; return v; }
  u64() { const v = this.b.readBigUInt64LE(this.o); this.o += 8; return v; }
  // U256/U512: 1-byte length + little-endian magnitude
  big() {
    const n = this.u8();
    let v = 0n;
    for (let i = n - 1; i >= 0; i--) v = (v << 8n) | BigInt(this.b[this.o + i]);
    this.o += n;
    return v;
  }
  str() { const n = this.u32(); const s = this.b.subarray(this.o, this.o + n).toString('utf8'); this.o += n; return s; }
  addr() { const tag = this.u8(); const h = this.b.subarray(this.o, this.o + 32); this.o += 32; return `${tag === 0 ? 'account' : 'contract'}-${h.toString('hex')}`; }
}

// node:crypto has no blake2b-256 (only blake2b512, wrong digest length for
// Casper's dictionary keys), so a small pure-JS RFC 7693 implementation
// (unkeyed, 32-byte digest) lives here.
const B2B_IV = [
  0x6a09e667f3bcc908n, 0xbb67ae8584caa73bn, 0x3c6ef372fe94f82bn, 0xa54ff53a5f1d36f1n,
  0x510e527fade682d1n, 0x9b05688c2b3e6c1fn, 0x1f83d9abfb41bd6bn, 0x5be0cd19137e2179n,
];
const B2B_SIGMA = [
  [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15],[14,10,4,8,9,15,13,6,1,12,0,2,11,7,5,3],
  [11,8,12,0,5,2,15,13,10,14,3,6,7,1,9,4],[7,9,3,1,13,12,11,14,2,6,5,10,4,0,15,8],
  [9,0,5,7,2,4,10,15,14,1,11,12,6,8,3,13],[2,12,6,10,0,11,8,3,4,13,7,5,15,14,1,9],
  [12,5,1,15,14,13,4,10,0,7,6,3,9,2,8,11],[13,11,7,14,12,1,3,9,5,0,15,4,8,6,2,10],
  [6,15,14,9,11,3,0,8,12,2,13,7,1,4,10,5],[10,2,8,4,7,6,1,5,15,11,9,14,3,12,13,0],
  [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15],[14,10,4,8,9,15,13,6,1,12,0,2,11,7,5,3],
];
const M64 = (1n << 64n) - 1n;
const rotr = (x: bigint, n: bigint) => ((x >> n) | (x << (64n - n))) & M64;

export function blake2b256(input: Buffer): Buffer {
  const h = [...B2B_IV];
  h[0] ^= 0x01010000n ^ 32n; // digest length 32, no key
  const blocks: Buffer[] = [];
  if (input.length === 0) blocks.push(Buffer.alloc(128));
  for (let i = 0; i < input.length; i += 128) {
    const b = Buffer.alloc(128);
    input.subarray(i, i + 128).copy(b);
    blocks.push(b);
  }
  let t = 0n;
  blocks.forEach((block, bi) => {
    const last = bi === blocks.length - 1;
    t += BigInt(last ? input.length - bi * 128 : 128);
    const m: bigint[] = [];
    for (let i = 0; i < 16; i++) m.push(block.readBigUInt64LE(i * 8));
    const v = [...h, ...B2B_IV];
    v[12] ^= t & M64;
    v[13] ^= 0n;
    if (last) v[14] = ~v[14] & M64;
    const G = (a: number, b: number, c: number, d: number, x: bigint, y: bigint) => {
      v[a] = (v[a] + v[b] + x) & M64; v[d] = rotr(v[d] ^ v[a], 32n);
      v[c] = (v[c] + v[d]) & M64; v[b] = rotr(v[b] ^ v[c], 24n);
      v[a] = (v[a] + v[b] + y) & M64; v[d] = rotr(v[d] ^ v[a], 16n);
      v[c] = (v[c] + v[d]) & M64; v[b] = rotr(v[b] ^ v[c], 63n);
    };
    for (let r = 0; r < 12; r++) {
      const s = B2B_SIGMA[r];
      G(0, 4, 8, 12, m[s[0]], m[s[1]]); G(1, 5, 9, 13, m[s[2]], m[s[3]]);
      G(2, 6, 10, 14, m[s[4]], m[s[5]]); G(3, 7, 11, 15, m[s[6]], m[s[7]]);
      G(0, 5, 10, 15, m[s[8]], m[s[9]]); G(1, 6, 11, 12, m[s[10]], m[s[11]]);
      G(2, 7, 8, 13, m[s[12]], m[s[13]]); G(3, 4, 9, 14, m[s[14]], m[s[15]]);
    }
    for (let i = 0; i < 8; i++) h[i] = h[i] ^ v[i] ^ v[i + 8];
  });
  const out = Buffer.alloc(32);
  for (let i = 0; i < 4; i++) out.writeBigUInt64LE(h[i], i * 8);
  return out;
}

// ── RPC plumbing ─────────────────────────────────────────────────────────────
let rpcId = 0;
async function rpc<T = unknown>(method: string, params: unknown): Promise<T> {
  const r = await fetch(RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++rpcId, method, params }),
    cache: 'no-store',
    signal: AbortSignal.timeout(15_000),
  });
  if (!r.ok) throw new Error(`rpc ${method} http ${r.status}`);
  const j = (await r.json()) as { result?: T; error?: { message?: string } };
  if (!j.result) throw new Error(`rpc ${method}: ${j.error?.message ?? 'no result'}`);
  return j.result;
}

type PkgVersion = { contract_version: number; contract_hash: string };
const contractHashCache = new Map<string, string>();

async function contractHash(pkg: string): Promise<string> {
  const cached = contractHashCache.get(pkg);
  if (cached) return cached;
  const res = await rpc<{ stored_value: { ContractPackage?: { versions: PkgVersion[]; disabled_versions: unknown[] } } }>(
    'query_global_state',
    { state_identifier: null, key: `hash-${pkg}`, path: [] }
  );
  const versions = res.stored_value.ContractPackage?.versions ?? [];
  if (versions.length === 0) throw new Error(`no versions for package ${pkg}`);
  const latest = versions.reduce((a, b) => (b.contract_version > a.contract_version ? b : a));
  const hash = latest.contract_hash.replace('contract-', '');
  contractHashCache.set(pkg, hash);
  return hash;
}

async function stateRootHash(): Promise<string> {
  const r = await rpc<{ state_root_hash: string }>('chain_get_state_root_hash', []);
  return r.state_root_hash;
}

async function readRaw(srh: string, contract: string, field: number, mappingKey: Buffer = Buffer.alloc(0)): Promise<Buffer | null> {
  const ib = Buffer.alloc(4);
  ib.writeUInt32BE(field);
  const key = blake2b256(Buffer.concat([ib, mappingKey])).toString('hex');
  try {
    const r = await rpc<{ stored_value: { CLValue?: { bytes: string } } }>('state_get_dictionary_item', {
      state_root_hash: srh,
      dictionary_identifier: {
        ContractNamedKey: { key: `hash-${contract}`, dictionary_name: 'state', dictionary_item_key: key },
      },
    });
    const hex = r.stored_value.CLValue?.bytes;
    if (!hex) return null;
    // CLValue List<U8>: 4-byte LE length prefix, then the bytesrepr payload.
    const buf = Buffer.from(hex, 'hex');
    return buf.subarray(4, 4 + buf.readUInt32LE(0));
  } catch {
    return null; // missing dictionary item = value never set
  }
}

const u64Key = (n: bigint | number) => {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(BigInt(n));
  return b;
};

// ── field maps (1-based declaration order; must mirror the contract structs) ─
const VAULT = { epoch_count: 3, total_tons: 5, epochs: 8, kyc: 9, oracle_total_score: 10, oracle_submissions: 11 };
const TOKEN = { total_supply: 4, balances: 5 };
const MINTER = { token_rate: 4, gorr_bps: 5, total_minted: 6, epoch_mints: 10 };
const DIST = { current_epoch: 4, total_distributed: 6, epochs: 9, claimable: 10, claimed: 11 };

export async function readChainState(): Promise<ContractStateWithEpochs> {
  const srh = await stateRootHash();
  const [vault, token, minter, dist] = await Promise.all([
    contractHash(CONTRACTS.productionVault),
    contractHash(CONTRACTS.sawitToken),
    contractHash(CONTRACTS.tokenMinter),
    contractHash(CONTRACTS.yieldDistributor),
  ]);

  const u64 = async (c: string, f: number) => {
    const b = await readRaw(srh, c, f);
    return b ? new R(b).u64() : 0n;
  };
  const u32f = async (c: string, f: number) => {
    const b = await readRaw(srh, c, f);
    return b ? new R(b).u32() : 0;
  };
  const big = async (c: string, f: number) => {
    const b = await readRaw(srh, c, f);
    return b ? new R(b).big() : 0n;
  };

  const [epochCount, totalTons, oracleScore, oracleSubs, totalSupply, tokenRate, gorrBps, totalMinted, curEpoch, totalDistributed] =
    await Promise.all([
      u64(vault, VAULT.epoch_count),
      u64(vault, VAULT.total_tons),
      u64(vault, VAULT.oracle_total_score),
      u64(vault, VAULT.oracle_submissions),
      big(token, TOKEN.total_supply),
      u64(minter, MINTER.token_rate),
      u32f(minter, MINTER.gorr_bps),
      big(minter, MINTER.total_minted),
      u64(dist, DIST.current_epoch),
      big(dist, DIST.total_distributed),
    ]);

  // Iterate distribution epochs (vault record optional) — same policy as
  // deploy/src/read_state.rs after the epoch-3 fix.
  const newest = curEpoch > epochCount ? curEpoch : epochCount;
  const oldest = newest > 5n ? newest - 5n : 1n;
  const epochs: EpochEntry[] = [];
  let latestVault: { label: string; price: bigint; score: number; tons: bigint } | null = null;

  for (let n = newest; n >= oldest && n >= 1n; n--) {
    const [vb, mb, db] = await Promise.all([
      readRaw(srh, vault, VAULT.epochs, u64Key(n)),
      readRaw(srh, minter, MINTER.epoch_mints, u64Key(n)),
      readRaw(srh, dist, DIST.epochs, u64Key(n)),
    ]);
    if (!vb && !db) continue;

    let tons = 0n, revenue = 0n, ts = 0n;
    if (vb) {
      const r = new R(vb);
      r.u64(); // epoch_number
      const label = r.str();
      tons = r.u64();
      revenue = r.u64();
      r.u32(); // daily_output_ton
      r.u8(); // oer_pct
      const price = r.u64();
      r.u8(); r.u8(); // estate_count, active_mills
      const score = r.u8();
      r.str(); // data_source
      ts = r.u64();
      if (n === epochCount) latestVault = { label, price, score, tons };
    }
    let tokensMinted: string | null = null;
    if (mb) {
      const r = new R(mb);
      r.u64(); r.u64(); r.u64(); // epoch_number, tons, revenue
      tokensMinted = r.big().toString();
    }
    let funded = false, pool = '0', claimed = '0', deadline = 0n;
    if (db) {
      const r = new R(db);
      r.u64(); // epoch_number
      r.str(); // label
      pool = r.big().toString();
      claimed = r.big().toString();
      r.u64(); r.u64(); r.u64(); // eligible, claims_count, created_at
      deadline = r.u64();
      funded = r.bool();
    }
    epochs.push({
      epoch_number: Number(n),
      tons_cpo: Number(tons),
      revenue_usd: Number(revenue),
      epoch_timestamp: Number(ts),
      tokens_minted: tokensMinted,
      funded,
      total_distribution_cspr: pool,
      total_claimed_cspr: claimed,
      claim_deadline_ms: Number(deadline),
    });
  }

  // Circulating supply = total minus the issuer float and the sale treasury —
  // the honest denominator for distribution-yield math.
  const [issuerBalB, treasuryBalB] = await Promise.all([
    readRaw(srh, token, TOKEN.balances, accountKey(ISSUER_ACCOUNT_HASH)),
    readRaw(srh, token, TOKEN.balances, accountKey(TREASURY.accountHash)),
  ]);
  const issuerBal = issuerBalB ? new R(issuerBalB).big() : 0n;
  const treasuryBal = treasuryBalB ? new R(treasuryBalB).big() : 0n;
  const nonCirculating = issuerBal + treasuryBal;
  const circulating = totalSupply > nonCirculating ? totalSupply - nonCirculating : 0n;

  const cur = epochs.find((e) => e.epoch_number === Number(curEpoch));
  return {
    epoch_count: Number(epochCount),
    oracle_reputation: oracleSubs > 0n ? Number(oracleScore / oracleSubs) : 0,
    oracle_submission_count: Number(oracleSubs),
    total_tons_cpo: Number(totalTons),
    latest_epoch_label: latestVault?.label ?? '',
    latest_cpo_price_cents: Number(latestVault?.price ?? 0n),
    latest_validation_score: latestVault?.score ?? 0,
    latest_tons_cpo: Number(latestVault?.tons ?? 0n),
    current_distribution_epoch: Number(curEpoch),
    latest_epoch_funded: cur?.funded ?? false,
    latest_epoch_claim_deadline_ms: cur?.claim_deadline_ms ?? 0,
    total_distributed_cspr: totalDistributed.toString(),
    total_tokens_minted: totalMinted.toString(),
    gorr_bps: gorrBps,
    token_rate: Number(tokenRate),
    total_sawit_supply: totalSupply.toString(),
    circulating_sawit: circulating.toString(),
    epochs,
  };
}

// bytesrepr of an Address (tag 0 = account) — mapping key for balances/kyc/claimable.
const accountKey = (accountHashHex: string) => Buffer.concat([Buffer.from([0]), Buffer.from(accountHashHex, 'hex')]);

export async function readAccountState(accountHashHex: string): Promise<{ balance: number; claimable_motes: string; kyc_verified: boolean }> {
  const srh = await stateRootHash();
  const [vault, token, dist] = await Promise.all([
    contractHash(CONTRACTS.productionVault),
    contractHash(CONTRACTS.sawitToken),
    contractHash(CONTRACTS.yieldDistributor),
  ]);
  const ck = accountKey(accountHashHex);
  const curB = await readRaw(srh, dist, DIST.current_epoch);
  const cur = curB ? new R(curB).u64() : 0n;
  const [balB, kycB, clB, cdB] = await Promise.all([
    readRaw(srh, token, TOKEN.balances, ck),
    readRaw(srh, vault, VAULT.kyc, ck),
    readRaw(srh, dist, DIST.claimable, Buffer.concat([u64Key(cur), ck])),
    readRaw(srh, dist, DIST.claimed, Buffer.concat([u64Key(cur), ck])),
  ]);
  // The contract keeps `claimable` as a historical record and marks `claimed`
  // separately — a claimed epoch must read as nothing-left-to-claim here.
  const alreadyClaimed = cdB ? new R(cdB).bool() : false;
  return {
    balance: balB ? Number(new R(balB).big()) : 0,
    claimable_motes: alreadyClaimed || !clB ? '0' : new R(clB).big().toString(),
    kyc_verified: kycB ? new R(kycB).bool() : false,
  };
}
