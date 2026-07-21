"""Sawit Finance — Market Analyst Agent: reads all 4 contract states via CSPR.cloud, uses Gemini AI to interpret trends and recommend GORR adjustments."""

import asyncio
import json
import logging
import os
import re
import subprocess
import sys
import time
from dataclasses import dataclass, fields
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import aiohttp
import google.generativeai as genai
from dotenv import load_dotenv, dotenv_values

load_dotenv()
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("sawit-analyst")

CSPR_CLOUD_API = "https://api.testnet.cspr.cloud"

REPO_ROOT = Path(__file__).resolve().parent.parent
READ_STATE_BIN = os.getenv(
    "READ_STATE_BIN", str(REPO_ROOT / "target" / "release" / "read_state")
)
SET_GORR_BIN = os.getenv(
    "SET_GORR_BIN", str(REPO_ROOT / "target" / "release" / "set_gorr")
)
LIVENET_ENV_FILE = os.getenv("LIVENET_ENV_FILE", str(REPO_ROOT / ".env"))
MARKET_STATE_FILE = REPO_ROOT / "agents" / ".market_state.json"

PRODUCTION_VAULT_CONTRACT = os.getenv("PRODUCTION_VAULT_CONTRACT", "")
YIELD_DISTRIBUTOR_CONTRACT = os.getenv("YIELD_DISTRIBUTOR_CONTRACT", "")
SAWIT_TOKEN_CONTRACT = os.getenv("SAWIT_TOKEN_CONTRACT", "")
TOKEN_MINTER_CONTRACT = os.getenv("TOKEN_MINTER_CONTRACT", "")
CSPR_CLOUD_API_KEY = os.getenv("CSPR_CLOUD_API_KEY", "")

MARKET_ANALYST_SECRET_KEY = os.getenv("MARKET_ANALYST_SECRET_KEY", "")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")

ANALYSIS_INTERVAL_SECONDS = int(os.getenv("ANALYSIS_INTERVAL_SECONDS", "21600"))

AUTONOMY_MODE = os.getenv("AUTONOMY_MODE", "off").lower() == "on"
MAX_GORR_CHANGE_BPS = int(os.getenv("MAX_GORR_CHANGE_BPS", "100"))
MIN_GORR_BPS = int(os.getenv("MIN_GORR_BPS", "100"))
MAX_GORR_BPS = int(os.getenv("MAX_GORR_BPS", "1000"))
# Safety rail: minimum wall-clock time between two on-chain GORR changes, regardless of
# how often the analysis cycle runs — protects against Gemini flip-flopping the rate on
# back-to-back cycles.
GORR_CHANGE_COOLDOWN_SECONDS = int(os.getenv("GORR_CHANGE_COOLDOWN_SECONDS", "86400"))

if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)

def load_market_state() -> dict:
    """Small local state file for this agent (currently: cooldown timestamp of the last
    on-chain GORR change). Separate from the on-chain state read via read_state."""
    if MARKET_STATE_FILE.exists():
        try:
            with open(MARKET_STATE_FILE) as f:
                return json.load(f)
        except (OSError, json.JSONDecodeError) as e:
            log.warning(f"[STATE] failed to load {MARKET_STATE_FILE}: {e} — starting fresh")
    return {}


def save_market_state(state: dict) -> None:
    """Atomic write (tmp file + os.replace) so a crash mid-write never leaves a corrupt file."""
    tmp_path = MARKET_STATE_FILE.with_suffix(MARKET_STATE_FILE.suffix + ".tmp")
    try:
        with open(tmp_path, "w") as f:
            json.dump(state, f, indent=2, sort_keys=True)
        os.replace(tmp_path, MARKET_STATE_FILE)
    except OSError as e:
        log.error(f"[STATE] failed to write {MARKET_STATE_FILE}: {e}")


@dataclass
class ContractState:
    epoch_count: int
    oracle_reputation: int
    oracle_submission_count: int
    total_tons_cpo: int
    latest_epoch_label: str
    latest_cpo_price_cents: int
    latest_validation_score: int
    latest_tons_cpo: int

    current_distribution_epoch: int
    latest_epoch_funded: bool
    latest_epoch_claim_deadline_ms: int
    total_distributed_cspr: str

    total_tokens_minted: str
    gorr_bps: int
    token_rate: int

    total_sawit_supply: str

def _demo_state() -> ContractState:
    """Fallback state (clearly labelled) if the on-chain read is unavailable."""
    now_ms = int(datetime.now(timezone.utc).timestamp() * 1000)
    return ContractState(
        epoch_count=3,
        oracle_reputation=85,
        oracle_submission_count=3,
        total_tons_cpo=135_000,
        latest_epoch_label="Jun-26 (demo)",
        latest_cpo_price_cents=82_500,
        latest_validation_score=88,
        latest_tons_cpo=45_200,
        current_distribution_epoch=2,
        latest_epoch_funded=True,
        latest_epoch_claim_deadline_ms=now_ms + (7 * 24 * 3600 * 1000),
        total_distributed_cspr="15000000000000",
        # Whole SAWIT tokens, matching read_state: 135,000 t x 1,000 x 500 bps.
        total_tokens_minted="6750000",
        gorr_bps=500,
        token_rate=1000,
        total_sawit_supply="6750000",
    )

def _read_state_blocking() -> Optional[ContractState]:
    """Invoke the read_state Rust bridge and parse its JSON; returns None on failure."""
    if not Path(READ_STATE_BIN).exists():
        log.warning(f"[ANALYST] read bin not found at {READ_STATE_BIN} — "
                    "build it: cargo build -p sawit-deploy --bin read_state "
                    "--features livenet --release")
        return None

    env = {**os.environ, **dotenv_values(LIVENET_ENV_FILE)}
    try:
        proc = subprocess.run(
            [READ_STATE_BIN], capture_output=True, text=True, env=env, timeout=120
        )
    except subprocess.TimeoutExpired:
        log.warning("[ANALYST] read_state timed out — using demo state")
        return None

    for line in proc.stdout.splitlines():
        if line.startswith("SAWIT_STATE_JSON "):
            d = json.loads(line[len("SAWIT_STATE_JSON "):])
            # read_state may emit fields this agent doesn't model (e.g. `epochs`,
            # `max_tons_per_epoch` added by later contract upgrades). Keep only the
            # keys ContractState declares so a superset schema never crashes the read.
            known = {f.name for f in fields(ContractState)}
            filtered = {k: v for k, v in d.items() if k in known}
            try:
                return ContractState(**filtered)
            except TypeError as e:
                log.warning(f"[ANALYST] read_state JSON schema mismatch ({e}) — using demo state")
                return None

    log.warning(f"[ANALYST] read_state produced no JSON (exit {proc.returncode}): "
                f"{proc.stderr.strip()[:200]} — using demo state")
    return None

async def read_contract_state(session: aiohttp.ClientSession) -> ContractState:
    """Read live state from all 4 contracts via the read_state bridge; falls back to labelled demo state."""
    log.info("[ANALYST] Reading live on-chain state via read_state bridge...")
    state = await asyncio.to_thread(_read_state_blocking)
    if state is None:
        log.warning("[ANALYST] Falling back to DEMO state (not on-chain)")
        return _demo_state()
    log.info("[ANALYST] Live state read from chain ✅")
    return state

async def run_gemini_analysis(state: ContractState) -> dict:
    """Feed contract state to Gemini AI for strategic market analysis."""
    if not GEMINI_API_KEY:
        log.warning("[GEMINI] No API key — returning mock analysis")
        return _mock_analysis(state)

    now = datetime.now(timezone.utc)
    # read_state reports SAWIT supply in whole tokens (SAWIT_DECIMALS = 0 across the
    # stack), so it must NOT be scaled. CSPR does arrive in motes, hence the /1e9 below.
    total_sawit = int(state.total_sawit_supply)
    total_distributed = int(state.total_distributed_cspr) / 1e9

    has_distribution = (
        state.current_distribution_epoch > 0
        and state.latest_epoch_claim_deadline_ms > 0
    )
    if has_distribution:
        claim_deadline_dt = datetime.fromtimestamp(
            state.latest_epoch_claim_deadline_ms / 1000, tz=timezone.utc
        )
        days_until_deadline = (claim_deadline_dt - now).days
        yield_lines = (
            f"  - Current distribution epoch: {state.current_distribution_epoch}\n"
            f"  - Latest epoch funded: {state.latest_epoch_funded}\n"
            f"  - Claim deadline: {days_until_deadline} days remaining\n"
            f"  - Total CSPR distributed all-time: {total_distributed:,.0f} CSPR"
        )
    else:
        yield_lines = (
            "  - No yield distribution epoch has been created yet "
            "(none funded, no claim window open, 0 CSPR distributed)."
        )

    is_bootstrapping = total_sawit == 0 and total_distributed == 0
    if is_bootstrapping:
        phase_note = (
            "PLATFORM PHASE: Bootstrapping / early launch. Production epochs are "
            "being recorded, but SAWIT minting and yield distribution have not "
            "started yet. This is the expected initial sequence "
            "(record production -> mint -> distribute), NOT a malfunction or bug. "
            "Do NOT flag the absence of minting/distribution or the lack of a claim "
            "deadline as a critical error; instead, recommend the next bootstrapping "
            "step (e.g. trigger the TokenMinter for the recorded epoch)."
        )
    else:
        phase_note = "PLATFORM PHASE: Operational (minting and/or distribution active)."

    prompt = f"""You are the Market Analyst Agent for Sawit Finance — a DeFi platform that tokenizes Indonesian palm oil (CPO) production revenue on Casper blockchain.

Your role: analyze current on-chain state and provide actionable intelligence to the human operator.

{phase_note}

CURRENT ON-CHAIN STATE (read live from Casper Testnet):

[ProductionVault Contract]
  - Total epochs recorded: {state.epoch_count}
  - Oracle reputation score: {state.oracle_reputation}/100
  - Oracle total submissions: {state.oracle_submission_count}
  - Total CPO recorded: {state.total_tons_cpo:,} tons
  - Latest epoch: {state.latest_epoch_label}
  - Latest CPO price: ${state.latest_cpo_price_cents/100:.2f}/ton
  - Latest validation score: {state.latest_validation_score}/100
  - Latest production: {state.latest_tons_cpo:,} tons

[YieldDistributor Contract]
{yield_lines}

[TokenMinter Contract]
  - Total SAWIT minted: {total_sawit:,.0f} SAWIT tokens
  - Current GORR: {state.gorr_bps} bps ({state.gorr_bps/100:.1f}%)
  - Token rate: {state.token_rate} SAWIT/ton CPO

[SawitToken Contract]
  - Total supply: {total_sawit:,.0f} SAWIT

MARKET CONTEXT:
  - Indonesia CPO: ~60% of global supply, $25-30B annual exports
  - Normal CPO price range: $700-$950/ton
  - Production peaks: Jul-Sep, dips: Feb-Mar
  - Current month: {now.strftime('%B %Y')}

ANALYZE AND PROVIDE:
1. Oracle health assessment (is reputation score trending correctly?)
2. CPO market commentary (is current price normal? any concerns?)
3. Yield distribution health (any urgency around claim deadline?)
4. GORR recommendation (should we adjust from current {state.gorr_bps} bps?)
5. Risk alerts (anything the operator should act on immediately?)

Respond in this exact JSON format:
{{
  "oracle_health": "GOOD" or "WARNING" or "CRITICAL",
  "market_sentiment": "BULLISH" or "NEUTRAL" or "BEARISH",
  "gorr_recommendation_bps": {state.gorr_bps},
  "alerts": [],
  "analysis": "3-4 sentence overall assessment",
  "operator_actions": []
}}

alerts: list of urgent action items (empty if none)
operator_actions: list of recommended steps for the operator (in priority order)
gorr_recommendation_bps: your recommended GORR (can be same as current if no change needed)"""

    try:
        log.info("[GEMINI] Running market analysis...")
        model = genai.GenerativeModel(GEMINI_MODEL)
        response = model.generate_content(prompt)
        raw = response.text.strip()

        if "```json" in raw:
            raw = raw.split("```json")[1].split("```")[0].strip()
        elif "```" in raw:
            raw = raw.split("```")[1].split("```")[0].strip()

        result = json.loads(raw)
        return result

    except Exception as e:
        log.error(f"[GEMINI] Analysis failed: {e}")
        return _mock_analysis(state)

def _mock_analysis(state: ContractState) -> dict:
    """Fallback analysis when Gemini is unavailable."""
    has_distribution = (
        state.current_distribution_epoch > 0
        and state.latest_epoch_claim_deadline_ms > 0
    )
    is_bootstrapping = int(state.total_sawit_supply) == 0 and int(state.total_distributed_cspr) == 0

    alerts = []
    if has_distribution:
        days_left = (state.latest_epoch_claim_deadline_ms - int(datetime.now(timezone.utc).timestamp() * 1000)) // 86400000
        if days_left < 14:
            alerts.append(f"Claim window closing in {days_left} days — notify holders")
        yield_note = f"Claim window {days_left} days remaining."
    else:
        yield_note = "No distribution epoch yet (bootstrapping)." if is_bootstrapping else "No active claim window."
    if state.oracle_reputation < 75:
        alerts.append(f"Oracle reputation low ({state.oracle_reputation}/100) — review data sources")

    if is_bootstrapping:
        actions = ["Trigger TokenMinter to mint SAWIT for the recorded epoch"]
    else:
        actions = alerts if alerts else ["No immediate action required"]

    return {
        "oracle_health": "GOOD" if state.oracle_reputation >= 80 else "WARNING",
        "market_sentiment": "BULLISH" if state.latest_cpo_price_cents > 80000 else "NEUTRAL",
        "gorr_recommendation_bps": state.gorr_bps,
        "alerts": alerts,
        "analysis": f"Oracle at {state.oracle_reputation}/100 reputation across {state.oracle_submission_count} submissions. "
                    f"CPO price ${state.latest_cpo_price_cents/100:.2f}/ton. {yield_note}",
        "operator_actions": actions,
    }

def clamp_gorr(recommended: int, current: int) -> tuple[int, Optional[str]]:
    """Apply safety rails to the AI's GORR recommendation; returns (safe_gorr, reason_if_clamped)."""
    reason = None
    safe = recommended

    delta = recommended - current
    if abs(delta) > MAX_GORR_CHANGE_BPS:
        safe = current + (MAX_GORR_CHANGE_BPS if delta > 0 else -MAX_GORR_CHANGE_BPS)
        reason = f"change capped to ±{MAX_GORR_CHANGE_BPS} bps (AI wanted {delta:+d})"

    if safe < MIN_GORR_BPS:
        safe = MIN_GORR_BPS
        reason = f"clamped up to floor {MIN_GORR_BPS} bps"
    elif safe > MAX_GORR_BPS:
        safe = MAX_GORR_BPS
        reason = f"clamped down to ceiling {MAX_GORR_BPS} bps"

    return safe, reason

def demo_gorr_target(current_gorr: int) -> int:
    """Pick a guaranteed-different, in-band GORR for demo/recording runs, so a manual
    trigger always produces a real on-chain change (one clamp step, oscillating within
    [MIN_GORR_BPS, MAX_GORR_BPS])."""
    step = MAX_GORR_CHANGE_BPS
    up = min(current_gorr + step, MAX_GORR_BPS)
    if up != current_gorr:
        return up
    return max(current_gorr - step, MIN_GORR_BPS)

async def apply_gorr_onchain(
    session: aiohttp.ClientSession,
    current_gorr: int,
    recommended_gorr: int,
    demo_force: bool = False,
) -> Optional[str]:
    """Closed-loop step: apply the GORR recommendation on-chain via TokenMinter.update_config(); returns the deploy hash or None."""
    if recommended_gorr == current_gorr:
        log.info(f"[AUTONOMY] GORR unchanged at {current_gorr} bps — no action")
        return None

    safe_gorr, clamp_reason = clamp_gorr(recommended_gorr, current_gorr)
    if clamp_reason:
        log.warning(f"[AUTONOMY] Safety rail: {clamp_reason}")

    if safe_gorr == current_gorr:
        log.info("[AUTONOMY] After safety rails, no effective change — no action")
        return None

    if not AUTONOMY_MODE and not demo_force:
        log.info(
            f"[AUTONOMY] (report-only) Would update GORR {current_gorr} → {safe_gorr} bps. "
            f"Set AUTONOMY_MODE=on to let the agent act."
        )
        return None

    market_state = load_market_state()
    last_change_ts = market_state.get("last_gorr_change_ts")
    if last_change_ts is not None and not demo_force:
        elapsed = time.time() - float(last_change_ts)
        if elapsed < GORR_CHANGE_COOLDOWN_SECONDS:
            remaining = GORR_CHANGE_COOLDOWN_SECONDS - elapsed
            log.warning(
                f"[AUTONOMY] GORR change cooldown active — last on-chain change was "
                f"{elapsed/3600:.1f}h ago (cooldown {GORR_CHANGE_COOLDOWN_SECONDS/3600:.0f}h). "
                f"SKIPPING on-chain write; would need {remaining/3600:.1f}h more. "
                f"Recommendation was {current_gorr} → {safe_gorr} bps."
            )
            return None

    log.info(f"[AUTONOMY] 🤖 Autonomously updating GORR {current_gorr} → {safe_gorr} bps on-chain...")

    if not os.path.exists(SET_GORR_BIN):
        log.error(
            f"[AUTONOMY] set_gorr bin not found at {SET_GORR_BIN} — build it: "
            "cargo build -p sawit-deploy --bin set_gorr --features livenet --release"
        )
        return None

    env = {**os.environ, **dotenv_values(LIVENET_ENV_FILE), "SET_GORR_BPS": str(safe_gorr)}
    try:
        proc = subprocess.run(
            [SET_GORR_BIN], capture_output=True, text=True, env=env, timeout=180
        )
    except subprocess.TimeoutExpired:
        log.error("[AUTONOMY] set_gorr timed out before confirmation")
        return None

    if "GORR_UPDATE_OK" not in proc.stdout:
        log.error(f"[AUTONOMY] on-chain GORR update failed (exit {proc.returncode}): "
                  f"{(proc.stderr or proc.stdout)[-400:]}")
        return None

    m = re.search(r'Transaction "([0-9a-f]{64})"', proc.stdout)
    deploy_hash = m.group(1) if m else None
    if deploy_hash:
        log.info(f"[AUTONOMY] ✅ GORR updated on-chain — tx {deploy_hash}")
        log.info(f"[AUTONOMY]    https://testnet.cspr.live/transaction/{deploy_hash}")
    else:
        log.info("[AUTONOMY] ✅ GORR updated on-chain (tx hash not parsed from output)")

    market_state["last_gorr_change_ts"] = time.time()
    market_state["last_gorr_change_deploy"] = deploy_hash
    save_market_state(market_state)

    return deploy_hash

def format_report(state: ContractState, analysis: dict, timestamp: str) -> str:
    """Format the analysis into a human-readable report."""

    oracle_icon = {"GOOD": "✅", "WARNING": "⚠️", "CRITICAL": "🚨"}.get(
        analysis.get("oracle_health", "GOOD"), "✅"
    )
    sentiment_icon = {"BULLISH": "📈", "NEUTRAL": "➡️", "BEARISH": "📉"}.get(
        analysis.get("market_sentiment", "NEUTRAL"), "➡️"
    )

    gorr_current = state.gorr_bps
    gorr_rec = analysis.get("gorr_recommendation_bps", gorr_current)
    gorr_change = gorr_rec - gorr_current

    report = f"""
╔══════════════════════════════════════════════════════════════╗
║          Sawit Finance — Market Analyst Agent Report              ║
║          {timestamp:<50}║
╠══════════════════════════════════════════════════════════════╣
║  Oracle Health : {oracle_icon} {analysis.get('oracle_health','GOOD'):<42}  ║
║  Market Mood   : {sentiment_icon} {analysis.get('market_sentiment','NEUTRAL'):<42}  ║
╠══════════════════════════════════════════════════════════════╣
║  ON-CHAIN SNAPSHOT                                           ║
║  Oracle Reputation : {state.oracle_reputation}/100 ({state.oracle_submission_count} submissions)              ║
║  Latest Epoch      : {state.latest_epoch_label} — {state.latest_tons_cpo:,} tons @ ${state.latest_cpo_price_cents/100:.0f}/ton  ║
║  Total CPO Recorded: {state.total_tons_cpo:,} tons                          ║
║  GORR              : {gorr_current} bps → Recommended: {gorr_rec} bps ({gorr_change:+d})    ║
╠══════════════════════════════════════════════════════════════╣
║  AI ANALYSIS                                                 ║"""

    analysis_text = analysis.get("analysis", "")
    words = analysis_text.split()
    lines = []
    current_line = ""
    for word in words:
        if len(current_line) + len(word) + 1 <= 56:
            current_line = f"{current_line} {word}".strip()
        else:
            lines.append(current_line)
            current_line = word
    if current_line:
        lines.append(current_line)

    for line in lines:
        report += f"\n║  {line:<58}║"

    alerts = analysis.get("alerts", [])
    if alerts:
        report += "\n╠══════════════════════════════════════════════════════════════╣"
        report += "\n║  ⚠️  ALERTS                                                   ║"
        for alert in alerts:
            report += f"\n║  • {alert[:56]:<56}  ║"

    actions = analysis.get("operator_actions", [])
    if actions:
        report += "\n╠══════════════════════════════════════════════════════════════╣"
        report += "\n║  OPERATOR ACTIONS                                            ║"
        for i, action in enumerate(actions, 1):
            report += f"\n║  {i}. {action[:55]:<55}  ║"

    report += "\n╚══════════════════════════════════════════════════════════════╝"
    return report

async def run_analysis_cycle(demo_force: bool = False):
    """Run one analysis cycle: read state → Gemini analysis → report."""
    now = datetime.now(timezone.utc)
    timestamp = now.strftime("%Y-%m-%d %H:%M UTC")

    log.info(f"=== Sawit Finance Market Analyst — {timestamp} ===")

    async with aiohttp.ClientSession() as session:
        state = await read_contract_state(session)
        log.info(f"[ANALYST] Oracle reputation: {state.oracle_reputation}/100")
        log.info(f"[ANALYST] Epochs recorded: {state.epoch_count}")
        log.info(f"[ANALYST] Latest CPO price: ${state.latest_cpo_price_cents/100:.2f}/ton")

        analysis = await run_gemini_analysis(state)

        report = format_report(state, analysis, timestamp)
        print(report)

        recommended_gorr = int(analysis.get("gorr_recommendation_bps", state.gorr_bps))
        if demo_force:
            recommended_gorr = demo_gorr_target(state.gorr_bps)
            log.info(
                f"[DEMO] Forcing a fresh on-chain GORR change for recording: "
                f"{state.gorr_bps} → {recommended_gorr} bps (cooldown + report-only gate bypassed)"
            )
        gorr_deploy = await apply_gorr_onchain(
            session, state.gorr_bps, recommended_gorr, demo_force=demo_force
        )

        return {
            "timestamp": timestamp,
            "state": state.__dict__,
            "analysis": analysis,
            "gorr_action_deploy": gorr_deploy,
        }

async def main():
    """Run market analyst agent on a regular interval."""
    log.info("Sawit Finance Market Analyst Agent starting...")
    log.info(f"Gemini model  : {GEMINI_MODEL}")
    log.info(f"Analysis every: {ANALYSIS_INTERVAL_SECONDS // 3600}h")
    log.info(f"Autonomy mode : {'ON — agent acts on-chain' if AUTONOMY_MODE else 'OFF — report only'}")
    log.info(f"Contracts     : vault={PRODUCTION_VAULT_CONTRACT or 'NOT SET'}")

    while True:
        try:
            await run_analysis_cycle()
        except Exception as e:
            log.error(f"[ANALYST] Cycle failed: {e}", exc_info=True)

        log.info(f"[ANALYST] Next analysis in {ANALYSIS_INTERVAL_SECONDS // 3600} hours...")
        await asyncio.sleep(ANALYSIS_INTERVAL_SECONDS)

if __name__ == "__main__":
    # `--once` runs a single cycle and exits (used by CI / the GitHub Actions
    # workflow); `--demo` (or DEMO_FORCE_GORR=1) forces one guaranteed on-chain GORR
    # change on that run so a manual trigger always yields a fresh, clickable tx for
    # recording. Default (no flags) is the long-running loop with all safety rails.
    if "--once" in sys.argv:
        demo = "--demo" in sys.argv or os.getenv("DEMO_FORCE_GORR", "").lower() in ("1", "on", "true")
        asyncio.run(run_analysis_cycle(demo_force=demo))
    else:
        asyncio.run(main())
