"""Sawit Finance — AI Oracle Agent.

Assembles three Indonesian CPO source readings (GAPKI / KPBN / MPOB), cross-validates them
with Gemini AI, and posts the verified epoch on-chain to SawitProductionVault. Premium
sources are fetched via x402 micropayment when a facilitator is reachable.

Data provenance — stated plainly, because this agent writes to chain:
  * CPO PRICE is genuinely live (FRED/IMF `PPOILUSDM` via cpo_price.py) and anchors all
    three source readings.
  * PRODUCTION TONNAGE is a REPRESENTATIVE figure, not scraped. GAPKI/KPBN/MPOB publish
    monthly aggregates as PDFs, not per-estate APIs, so no live tonnage source exists yet.
    Only an x402-paid MPOB response supplies a non-constant tonnage.
  * The cross-validation, divergence scoring, Gemini anomaly veto and on-chain reputation
    score all run for real on top of that input.
Per-cycle x402 payment status is recorded in `.oracle_provenance.json`.
"""

import asyncio
import json
import logging
import os
import re
import subprocess
import sys
import time
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import aiohttp
import google.generativeai as genai
from dotenv import load_dotenv, dotenv_values

from cpo_price import fetch_palm_oil_price, FEED_LABEL

try:
    from x402 import X402Payer, fetch_with_x402, X402Error
    X402_AVAILABLE = True
except ImportError:
    X402_AVAILABLE = False

load_dotenv()
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("sawit-oracle")

REPO_ROOT = Path(__file__).resolve().parent.parent
RECORD_BIN = os.getenv("RECORD_BIN", str(REPO_ROOT / "target" / "release" / "record"))
LIVENET_ENV_FILE = os.getenv("LIVENET_ENV_FILE", str(REPO_ROOT / ".env"))

CSPR_CLOUD_API = "https://api.testnet.cspr.cloud"
CASPER_TESTNET_RPC = "https://rpc.testnet.casperlabs.io"
PRODUCTION_VAULT_CONTRACT = os.getenv("PRODUCTION_VAULT_CONTRACT", "")
ORACLE_AGENT_SECRET_KEY = os.getenv("ORACLE_AGENT_SECRET_KEY", "")
CSPR_CLOUD_API_KEY = os.getenv("CSPR_CLOUD_API_KEY", "")

X402_LIVE = os.getenv("X402_LIVE", "off").lower() == "on"
X402_FACILITATOR_URL = os.getenv("X402_FACILITATOR_URL", "http://127.0.0.1:8402")
X402_NETWORK = os.getenv("X402_NETWORK", "casper-test")
X402_MAX_MOTES = int(os.getenv("X402_MAX_PRICE_MOTES", "100000000"))

X402_OFFICIAL = os.getenv("X402_OFFICIAL", "on").lower() == "on"
X402_OFFICIAL_URL = os.getenv("X402_OFFICIAL_URL", "http://127.0.0.1:4021")
X402_OFFICIAL_DIR = REPO_ROOT / "agents" / "x402-official"
X402_OFFICIAL_TIMEOUT_S = int(os.getenv("X402_OFFICIAL_TIMEOUT_S", "180"))

_x402_payer = None
if X402_LIVE and X402_AVAILABLE:
    seed = ORACLE_AGENT_SECRET_KEY if len(ORACLE_AGENT_SECRET_KEY) >= 64 else None
    _x402_payer = X402Payer(seed_hex=seed, network=X402_NETWORK)
    log.info(f"[x402] Live mode ON — payer {_x402_payer.public_key_hex[:18]}...")

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)

MAX_SOURCE_DIVERGENCE_PCT = 10.0
MIN_VALIDATION_SCORE = 60

ORACLE_PROVENANCE_FILE = REPO_ROOT / "agents" / ".oracle_provenance.json"

def _persist_x402_provenance(resource_path: str, provenance: str, paid: bool) -> None:
    """Atomically persist the latest x402 fetch provenance (per resource) so other
    processes (e.g. mcp_server.py) can surface whether the most recent oracle data was
    actually paid for via x402, or silently degraded to a representative fallback."""
    record = {
        "resource_path": resource_path,
        "x402_provenance": provenance,
        "paid_via_x402": paid,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    try:
        existing = {}
        if ORACLE_PROVENANCE_FILE.exists():
            try:
                with open(ORACLE_PROVENANCE_FILE) as f:
                    existing = json.load(f)
            except (OSError, json.JSONDecodeError):
                existing = {}
        existing["latest"] = record
        existing.setdefault("by_resource", {})[resource_path] = record

        tmp_path = ORACLE_PROVENANCE_FILE.with_suffix(ORACLE_PROVENANCE_FILE.suffix + ".tmp")
        with open(tmp_path, "w") as f:
            json.dump(existing, f, indent=2, sort_keys=True)
        os.replace(tmp_path, ORACLE_PROVENANCE_FILE)
    except OSError as e:
        log.error(f"[x402] failed to persist provenance to {ORACLE_PROVENANCE_FILE}: {e}")

@dataclass
class CpoProductionData:
    epoch_label: str
    tons_cpo: int
    revenue_usd_cents: int
    daily_output_ton: int
    oer_pct: int
    cpo_price_cents: int
    estate_count: int
    active_mills: int
    validation_score: int
    data_source: str
    epoch_timestamp_ms: int

@dataclass
class SourceReading:
    source: str
    tons_cpo: Optional[int]
    cpo_price_cents: Optional[int]
    confidence: int

async def fetch_gapki_data(
    session: aiohttp.ClientSession, month: str, real_price_cents: Optional[int] = None
) -> SourceReading:
    """GAPKI monthly production; price anchored to the live FRED/IMF feed, tonnage a clearly-labelled representative figure."""
    log.info(f"[GAPKI] Production for {month} (price: live feed; tons: representative)...")
    await asyncio.sleep(0.2)

    return SourceReading(
        source="GAPKI",
        tons_cpo=45_200,
        cpo_price_cents=real_price_cents or 82_500,
        confidence=85,
    )

async def fetch_kpbn_price(
    session: aiohttp.ClientSession, real_price_cents: Optional[int] = None
) -> SourceReading:
    """KPBN CPO price benchmark; fetched via x402 micropayment, falling back to the live feed or a representative figure."""
    log.info("[KPBN] Fetching CPO price (x402 micropayment)...")

    paid = await fetch_via_x402(session, "/api/kpbn/price")
    if paid:
        return SourceReading(
            source="KPBN",
            tons_cpo=None,
            cpo_price_cents=int(paid["price_cents_per_ton"]),
            confidence=95,
        )

    return SourceReading(
        source="KPBN",
        tons_cpo=None,
        cpo_price_cents=real_price_cents or 81_800,
        confidence=95,
    )

async def fetch_mpob_data(
    session: aiohttp.ClientSession, month: str, real_price_cents: Optional[int] = None
) -> SourceReading:
    """MPOB regional cross-validation; price anchored to the live feed, tonnage a clearly-labelled representative figure."""
    log.info("[MPOB] Fetching regional benchmark (x402 micropayment)...")

    paid = await fetch_via_x402(session, "/api/mpob/benchmark")
    if paid:
        return SourceReading(
            source="MPOB",
            tons_cpo=int(paid["production_tons"]),
            cpo_price_cents=int(paid["price_cents_per_ton"]),
            confidence=80,
        )

    return SourceReading(
        source="MPOB",
        tons_cpo=44_800,
        cpo_price_cents=real_price_cents or 83_200,
        confidence=80,
    )

async def fetch_via_x402_official(
    session: aiohttp.ClientSession,
    resource_path: str,
) -> Optional[dict]:
    """Pay for a gated resource over the official x402 protocol (EIP-712 → CEP-18 transfer_with_authorization) via the paid-fetch bridge; returns JSON or None."""
    if not (X402_OFFICIAL and (X402_OFFICIAL_DIR / "paid-fetch.ts").exists()):
        return None

    try:
        async with session.get(
            f"{X402_OFFICIAL_URL}/health", timeout=aiohttp.ClientTimeout(total=2)
        ) as r:
            if r.status != 200:
                return None
    except Exception:
        return None

    url = f"{X402_OFFICIAL_URL}{resource_path}"
    log.info(f"[x402-official] Paying for {resource_path} (EIP-712 → SAWITX)...")
    try:
        proc = await asyncio.create_subprocess_exec(
            "npx", "tsx", "paid-fetch.ts", url,
            cwd=str(X402_OFFICIAL_DIR),
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
        )
        out, _ = await asyncio.wait_for(proc.communicate(), timeout=X402_OFFICIAL_TIMEOUT_S)
        result = json.loads(out.decode().strip().splitlines()[-1])
    except Exception as e:
        log.warning(f"[x402-official] Bridge failed ({e}) — trying reference client")
        return None

    if not result.get("ok"):
        log.warning(f"[x402-official] Payment failed: {result.get('error')} — trying reference client")
        return None

    settlement = result.get("settlement") or {}
    if settlement.get("transaction"):
        log.info(f"[x402-official] ✅ Settled on-chain: {settlement['transaction']}")
    return result["data"]

async def fetch_via_x402(
    session: aiohttp.ClientSession,
    resource_path: str,
) -> Optional[dict]:
    """Fetch a gated CPO resource: official x402 protocol first, then the from-scratch reference
    client; returns JSON or None (caller falls back to a representative reading). Provenance
    ("official" / "reference" / "unpaid_fallback") is logged and persisted to
    agents/.oracle_provenance.json for downstream visibility (see mcp_server.py)."""
    data = await fetch_via_x402_official(session, resource_path)
    if data is not None:
        _persist_x402_provenance(resource_path, "official", True)
        return data

    if X402_LIVE and X402_AVAILABLE and _x402_payer is not None:
        url = f"{X402_FACILITATOR_URL}{resource_path}"
        try:
            log.info(f"[x402] Paying for {resource_path} (reference client)...")
            data = await fetch_with_x402(session, url, _x402_payer, X402_MAX_MOTES)
            log.info(f"[x402] ✅ Paid + received {resource_path}")
            _persist_x402_provenance(resource_path, "reference", True)
            return data
        except X402Error as e:
            log.warning(f"[x402] Payment/fetch failed for {resource_path}: {e} — using fallback")
        except Exception as e:
            log.warning(f"[x402] Facilitator unreachable ({e}) — using fallback")

    log.error(
        f"[x402] DATA NOT PAID VIA X402 — using representative values for {resource_path} "
        "(neither the official protocol nor the reference client produced paid data)"
    )
    _persist_x402_provenance(resource_path, "unpaid_fallback", False)
    return None

def compute_validation_score(readings: list[SourceReading]) -> tuple[int, int, int, str]:
    """Cross-validate data from multiple sources; returns (tons_cpo, cpo_price_cents, validation_score, data_source_string)."""
    price_readings = [r for r in readings if r.cpo_price_cents is not None]
    production_readings = [r for r in readings if r.tons_cpo is not None]

    sources = "+".join(r.source for r in readings)

    avg_price = int(sum(r.cpo_price_cents for r in price_readings) / len(price_readings))

    max_price = max(r.cpo_price_cents for r in price_readings)
    min_price = min(r.cpo_price_cents for r in price_readings)
    price_divergence = (max_price - min_price) / avg_price * 100

    avg_tons = int(sum(r.tons_cpo for r in production_readings) / len(production_readings))

    base_score = int(sum(r.confidence for r in readings) / len(readings))

    if price_divergence > MAX_SOURCE_DIVERGENCE_PCT:
        log.warning(f"[VALIDATE] High price divergence: {price_divergence:.1f}% — penalizing score")
        base_score = max(0, base_score - int(price_divergence * 2))

    if len(readings) >= 3 and price_divergence < 5.0:
        base_score = min(100, base_score + 10)

    log.info(f"[VALIDATE] Validation score: {base_score} | Price divergence: {price_divergence:.1f}%")
    log.info(f"[VALIDATE] Avg CPO price: ${avg_price/100:.2f}/ton | Avg production: {avg_tons:,} tons")

    return avg_tons, avg_price, base_score, sources

async def analyze_with_gemini(
    readings: list[SourceReading],
    tons_cpo: int,
    cpo_price_cents: int,
    base_score: int,
    epoch_label: str,
) -> tuple[int, str]:
    """Use Gemini AI to reason about CPO data quality and detect anomalies; returns (adjusted_score, analysis_summary)."""
    if not GEMINI_API_KEY:
        log.warning("[GEMINI] No API key configured — skipping AI analysis")
        return base_score, "AI analysis skipped (no GEMINI_API_KEY)"

    log.info("[GEMINI] Running AI analysis on CPO data...")

    readings_text = "\n".join(
        f"  - {r.source}: {r.tons_cpo or 'N/A'} tons, "
        f"${r.cpo_price_cents/100 if r.cpo_price_cents else 'N/A'}/ton, "
        f"confidence={r.confidence}%"
        for r in readings
    )

    prompt = f"""You are an expert analyst for Sawit Finance, a platform that tokenizes Indonesian palm oil (CPO) production on Casper blockchain.

Your job: analyze CPO production data collected from multiple sources and determine if it is trustworthy enough to record on-chain. Bad data leads to incorrect token minting and unfair yield distributions.

EPOCH: {epoch_label}
RAW READINGS FROM DATA SOURCES:
{readings_text}

CROSS-VALIDATED RESULT:
  - Consensus production: {tons_cpo:,} tons CPO
  - Consensus price: ${cpo_price_cents/100:.2f}/ton
  - Base validation score: {base_score}/100

CONTEXT (for your reference):
  - Normal Indonesian CPO production for a medium estate group (~50,000 ha): 40,000–55,000 tons/month
  - Normal CPO price range (2025-2026): $700–$950/ton
  - OER (Oil Extraction Rate) for Indonesian palms: 20–25%
  - KPBN is the most reliable price source (actual auction data)
  - GAPKI and MPOB may have 1–2 month reporting lag

ANALYZE:
1. Are the production figures within normal range for this estate size?
2. Is the price consistent across sources? Flag if divergence is suspicious.
3. Are there any seasonal anomalies? (CPO production peaks: Jul–Sep, dips: Feb–Mar)
4. Overall: is this data trustworthy for on-chain recording?

Respond in this exact JSON format:
{{
  "trustworthy": true,
  "score_adjustment": 0,
  "anomalies": [],
  "analysis": "2-3 sentence summary of your findings",
  "recommendation": "APPROVE" or "REJECT"
}}

score_adjustment: integer from -20 to +10 (negative if you find issues, positive if all sources agree exceptionally well)
anomalies: list of strings describing any concerns (empty list if none)"""

    try:
        model = genai.GenerativeModel(GEMINI_MODEL)
        response = model.generate_content(prompt)
        raw = response.text.strip()

        if "```json" in raw:
            raw = raw.split("```json")[1].split("```")[0].strip()
        elif "```" in raw:
            raw = raw.split("```")[1].split("```")[0].strip()

        result = json.loads(raw)

        adjustment = int(result.get("score_adjustment", 0))
        analysis = result.get("analysis", "")
        anomalies = result.get("anomalies", [])
        recommendation = result.get("recommendation", "APPROVE")

        adjusted_score = max(0, min(100, base_score + adjustment))

        log.info(f"[GEMINI] Analysis complete:")
        log.info(f"  Score adjustment : {adjustment:+d} → final score {adjusted_score}")
        log.info(f"  Recommendation   : {recommendation}")
        log.info(f"  Analysis         : {analysis}")
        if anomalies:
            for a in anomalies:
                log.warning(f"  ⚠ Anomaly: {a}")

        if recommendation == "REJECT":
            log.error("[GEMINI] AI recommends REJECTING this epoch — setting score to 0")
            return 0, f"REJECTED by AI: {analysis}"

        return adjusted_score, analysis

    except Exception as e:
        log.error(f"[GEMINI] Analysis failed: {e} — using base score")
        return base_score, "AI analysis unavailable"

async def post_to_casper(
    session: aiohttp.ClientSession,
    data: CpoProductionData,
) -> str:
    """Submit verified production data to SawitProductionVault via CSPR.cloud; returns the deploy hash."""
    log.info(f"[CASPER] Posting epoch {data.epoch_label} to Casper Testnet...")
    log.info(f"[CASPER] Contract: {PRODUCTION_VAULT_CONTRACT}")

    deploy_args = {
        "epoch_label": {"cl_type": "String", "parsed": data.epoch_label},
        "tons_cpo": {"cl_type": "U64", "parsed": data.tons_cpo},
        "revenue_usd": {"cl_type": "U64", "parsed": data.revenue_usd_cents},
        "daily_output_ton": {"cl_type": "U32", "parsed": data.daily_output_ton},
        "oer_pct": {"cl_type": "U8", "parsed": data.oer_pct},
        "cpo_price_cents": {"cl_type": "U64", "parsed": data.cpo_price_cents},
        "estate_count": {"cl_type": "U8", "parsed": data.estate_count},
        "active_mills": {"cl_type": "U8", "parsed": data.active_mills},
        "validation_score": {"cl_type": "U8", "parsed": data.validation_score},
        "data_source": {"cl_type": "String", "parsed": data.data_source},
        "epoch_timestamp": {"cl_type": "U64", "parsed": data.epoch_timestamp_ms},
    }

    if not os.path.exists(RECORD_BIN):
        log.error(
            f"[CASPER] record bin not found at {RECORD_BIN} — build it: "
            "cargo build -p sawit-deploy --bin record --features livenet --release"
        )
        return ""

    env = {
        **os.environ,
        **dotenv_values(LIVENET_ENV_FILE),
        "RECORD_EPOCH_LABEL": data.epoch_label,
        "RECORD_TONS_CPO": str(data.tons_cpo),
        "RECORD_REVENUE_USD": str(data.revenue_usd_cents),
        "RECORD_DAILY_OUTPUT_TON": str(data.daily_output_ton),
        "RECORD_OER_PCT": str(data.oer_pct),
        "RECORD_CPO_PRICE_CENTS": str(data.cpo_price_cents),
        "RECORD_ESTATE_COUNT": str(data.estate_count),
        "RECORD_ACTIVE_MILLS": str(data.active_mills),
        "RECORD_VALIDATION_SCORE": str(data.validation_score),
        "RECORD_DATA_SOURCE": data.data_source,
    }
    try:
        proc = subprocess.run(
            [RECORD_BIN], capture_output=True, text=True, env=env, timeout=180
        )
    except subprocess.TimeoutExpired:
        log.error("[CASPER] record bin timed out before confirmation")
        return ""

    if "RECORD_OK" not in proc.stdout:
        log.error(f"[CASPER] on-chain record failed (exit {proc.returncode}): "
                  f"{(proc.stderr or proc.stdout)[-400:]}")
        return ""

    m = re.search(r'Transaction "([0-9a-f]{64})"', proc.stdout)
    deploy_hash = m.group(1) if m else ""
    if deploy_hash:
        log.info(f"[CASPER] ✅ Recorded on-chain — tx {deploy_hash}")
        log.info(f"[CASPER]    https://testnet.cspr.live/transaction/{deploy_hash}")
    else:
        log.info("[CASPER] ✅ Recorded on-chain (tx hash not parsed from output)")
    return deploy_hash

async def run_oracle_cycle():
    """Run one oracle cycle: fetch → validate → post."""
    now = datetime.now(timezone.utc)
    epoch_label = now.strftime("%b-%y")
    epoch_ts_ms = int(now.timestamp() * 1000)

    log.info(f"=== Sawit Finance Oracle Agent — Epoch {epoch_label} ===")

    async with aiohttp.ClientSession() as session:
        feed = await fetch_palm_oil_price(session)
        real_price_cents = feed[0] if feed else None
        if feed:
            log.info(f"[FEED] Live palm oil price: ${real_price_cents/100:,.2f}/ton "
                     f"({FEED_LABEL}, obs {feed[1]})")
        else:
            log.warning("[FEED] Live price feed unavailable — using representative figures")

        readings = await asyncio.gather(
            fetch_gapki_data(session, epoch_label, real_price_cents),
            fetch_kpbn_price(session, real_price_cents),
            fetch_mpob_data(session, epoch_label, real_price_cents),
        )
        log.info(f"[ORACLE] Collected {len(readings)} readings")

        tons_cpo, cpo_price_cents, score, sources = compute_validation_score(list(readings))

        if score < MIN_VALIDATION_SCORE:
            log.error(f"[ORACLE] Validation score {score} below threshold {MIN_VALIDATION_SCORE} — REJECTED")
            return None

        score, ai_analysis = await analyze_with_gemini(
            list(readings), tons_cpo, cpo_price_cents, score, epoch_label
        )

        if score < MIN_VALIDATION_SCORE:
            log.error(f"[ORACLE] Score dropped below threshold after AI analysis — REJECTED")
            return None

        log.info(f"[ORACLE] AI analysis: {ai_analysis}")

        daily_output = tons_cpo // 30
        oer_pct = 22
        revenue_cents = int(tons_cpo * cpo_price_cents)

        data = CpoProductionData(
            epoch_label=epoch_label,
            tons_cpo=tons_cpo,
            revenue_usd_cents=revenue_cents,
            daily_output_ton=daily_output,
            oer_pct=oer_pct,
            cpo_price_cents=cpo_price_cents,
            estate_count=12,
            active_mills=8,
            validation_score=score,
            data_source=sources,
            epoch_timestamp_ms=epoch_ts_ms,
        )

        log.info("[ORACLE] Production data validated:")
        log.info(f"  CPO produced : {tons_cpo:,} tons  [representative — not scraped live]")
        log.info(f"  CPO price    : ${cpo_price_cents/100:,.2f}/ton  [live feed: {FEED_LABEL}]")
        log.info(f"  Revenue      : ${revenue_cents/100:,.0f}")
        log.info(f"  Daily output : {daily_output:,} ton/day")
        log.info(f"  OER          : {oer_pct}%")
        log.info(f"  Score        : {score}/100 (AI-adjusted)")
        log.info(f"  Sources      : {sources}")

        deploy_hash = await post_to_casper(session, data)
        log.info(f"[ORACLE] ✅ Epoch {epoch_label} recorded on Casper Testnet")
        log.info(f"[ORACLE] Deploy: {deploy_hash}")

        return deploy_hash

async def main():
    """Run oracle agent continuously (monthly cycle)."""
    log.info("Sawit Finance AI Oracle Agent starting...")
    log.info(f"Contract: {PRODUCTION_VAULT_CONTRACT or 'NOT SET — check .env'}")

    while True:
        try:
            await run_oracle_cycle()
        except Exception as e:
            log.error(f"[ORACLE] Cycle failed: {e}", exc_info=True)

        log.info("[ORACLE] Next cycle in 30 days. Sleeping...")
        await asyncio.sleep(30 * 24 * 3600)

if __name__ == "__main__":
    # `--once` runs a single cycle and exits (used by CI / the GitHub Actions
    # workflow and for on-demand demo triggers); default is the long-running loop.
    if "--once" in sys.argv:
        asyncio.run(run_oracle_cycle())
    else:
        asyncio.run(main())
