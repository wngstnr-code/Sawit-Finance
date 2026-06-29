#!/usr/bin/env python3
"""
Sawit Finance — x402 LIVE settlement on Casper Testnet
======================================================
`x402.py` proves the x402 *handshake* (402 → signed ed25519 proof → retry). The
one piece it leaves out is **settlement**: actually moving the CSPR on-chain. This
script closes that loop — it runs the full handshake and then **broadcasts a real
CSPR transfer on Casper Testnet** for the payment, and verifies it executed.

End-to-end, all real:
  1. Facilitator issues a 402 challenge for a gated resource (price in motes).
  2. The funded payer (a real testnet account) signs the x402 payment proof.
  3. Facilitator verifies the proof off-chain (signature / nonce / amount / binding).
  4. SETTLE: the payer broadcasts a native CSPR transfer of the amount to the
     facilitator's payTo account — a real on-chain transaction (deploy hash).
  5. Facilitator verifies the transfer executed on-chain (queries the node) and
     only then serves the data.

The payer's ed25519 key is the *same* key that signs the x402 proof and owns the
on-chain funds, so the proof's `from` pubkey matches the on-chain sender.

Note on amount: Casper native transfers enforce a 2.5 CSPR minimum, so the demo
settles 2.5 CSPR. True sub-cent x402 micropayments would batch/channel these on a
payment-channel contract; the settlement mechanism shown here is identical.

Run (needs the funded testnet key referenced in ../.env):
    ./.venv/bin/python agents/x402_settle.py
"""
from __future__ import annotations

import json
import os
import subprocess
import time

from cryptography.hazmat.primitives import serialization

from x402 import (
    PaymentRequirement,
    X402Payer,
    X402Verifier,
    encode_payment,
)

# ─── config (from ../.env) ───
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EXPLORER = "https://testnet.cspr.live"
MIN_TRANSFER_MOTES = 2_500_000_000        # Casper native-transfer minimum (2.5 CSPR)
GAS_MOTES = 100_000_000                    # 0.1 CSPR — native transfer fee

# The data provider that receives the micropayment (a real testnet account).
PAYTO_PUBLIC_KEY = "0202111d3b480feaea33ce6839d087d9f685a3348fba27008221f52dfe2034656adc"


def _load_env(path: str) -> dict:
    out = {}
    if not os.path.exists(path):
        return out
    with open(path) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                out[k.strip()] = v.strip()
    return out


def _ed25519_seed_hex(pem_path: str) -> str:
    """Extract the raw 32-byte ed25519 seed from a Casper secret_key.pem so the
    x402 payer signs with the very key that owns the on-chain funds."""
    with open(pem_path, "rb") as f:
        key = serialization.load_pem_private_key(f.read(), password=None)
    raw = key.private_bytes(
        serialization.Encoding.Raw,
        serialization.PrivateFormat.Raw,
        serialization.NoEncryption(),
    )
    return raw.hex()


# ─── on-chain settlement ───

def settle_onchain(node_rpc: str, chain: str, secret_key: str,
                   recipient_pubkey: str, amount_motes: int, transfer_id: int) -> str:
    """Broadcast a native CSPR transfer for the payment. Returns the deploy hash."""
    out = subprocess.run(
        [
            "casper-client", "transfer",
            "--node-address", node_rpc,
            "--chain-name", chain,
            "--secret-key", secret_key,
            "--amount", str(amount_motes),
            "--target-account", recipient_pubkey,
            "--payment-amount", str(GAS_MOTES),
            "--transfer-id", str(transfer_id),
        ],
        capture_output=True, text=True, timeout=60,
    )
    if out.returncode != 0:
        raise RuntimeError(f"settlement broadcast failed: {out.stderr.strip()}")
    res = json.loads(out.stdout)["result"]
    return res["deploy_hash"]


def verify_onchain(node_rpc: str, deploy_hash: str, timeout_s: int = 150) -> dict:
    """Poll the node until the transfer deploy executes; confirm it succeeded."""
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        out = subprocess.run(
            ["casper-client", "get-deploy", "--node-address", node_rpc, deploy_hash],
            capture_output=True, text=True, timeout=30,
        )
        if out.returncode == 0:
            res = json.loads(out.stdout).get("result", {})
            info = res.get("execution_info")
            exec_res = (info or {}).get("execution_result") if info else None
            if exec_res:
                v2 = exec_res.get("Version2", {})
                if v2.get("error_message") is None:
                    return {
                        "block_height": info.get("block_height"),
                        "cost_motes": v2.get("cost"),
                        "transfers": len(v2.get("transfers", [])),
                    }
                raise RuntimeError(f"transfer reverted: {v2.get('error_message')}")
        time.sleep(8)
    raise TimeoutError(f"deploy {deploy_hash} not finalized within {timeout_s}s")


# ─── full live demo ───

def main() -> None:
    env = _load_env(os.path.join(ROOT, ".env"))
    node = env.get("ODRA_CASPER_LIVENET_NODE_ADDRESS", "https://node.testnet.casper.network")
    node_rpc = node.rstrip("/") + "/rpc"
    chain = env.get("ODRA_CASPER_LIVENET_CHAIN_NAME", "casper-test")
    secret_key = env.get("ODRA_CASPER_LIVENET_SECRET_KEY_PATH")
    if not secret_key or not os.path.exists(secret_key):
        raise SystemExit("funded secret key not found (set ODRA_CASPER_LIVENET_SECRET_KEY_PATH in .env)")

    resource = "/api/kpbn/daily-cpo-price"
    price = MIN_TRANSFER_MOTES

    print("x402 LIVE settlement on Casper Testnet\n" + "=" * 44)

    # The payer signs the x402 proof with the same ed25519 key that owns the funds.
    payer = X402Payer(seed_hex=_ed25519_seed_hex(secret_key), network=chain)
    facilitator = X402Verifier(pay_to_hex=PAYTO_PUBLIC_KEY, network=chain)
    print(f"payer (funded)   : {payer.public_key_hex}")
    print(f"facilitator payTo: {facilitator.pay_to}")
    print(f"resource         : {resource}")
    print(f"price            : {price/1e9:g} CSPR\n")

    # 1–2. Challenge → signed proof
    challenge = facilitator.make_challenge(resource, price, "KPBN daily CPO settlement price")
    req = PaymentRequirement.from_dict(challenge["accepts"][0])
    proof = encode_payment(payer.build_payment(req))
    print("[1] 402 challenge issued, payment proof signed")

    # 3. Off-chain verification of the proof
    ok, reason = facilitator.verify(proof, resource, price)
    if not ok:
        raise SystemExit(f"proof rejected: {reason}")
    print("[2] proof verified off-chain (signature / nonce / amount / binding) ✅")

    # 4. SETTLE on-chain — real CSPR transfer
    print("[3] settling on-chain (broadcasting native transfer)…")
    deploy_hash = settle_onchain(
        node_rpc, chain, secret_key, facilitator.pay_to, price, transfer_id=402
    )
    print(f"    deploy hash  : {deploy_hash}")
    print(f"    explorer     : {EXPLORER}/deploy/{deploy_hash}")

    # 5. Verify the settlement executed on-chain, then "serve" the data
    print("[4] waiting for on-chain finality…")
    info = verify_onchain(node_rpc, deploy_hash)
    print(f"    settled in block {info['block_height']} "
          f"({info['transfers']} transfer, cost {int(info['cost_motes'])/1e9:g} CSPR) ✅")

    print("\n✅ x402 settlement is LIVE — payment moved real CSPR on Casper Testnet, "
          "then the gated data is served.")
    print(f"   verify: {EXPLORER}/deploy/{deploy_hash}")


if __name__ == "__main__":
    main()
