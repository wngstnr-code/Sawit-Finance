#!/usr/bin/env python3
"""
Sawit Finance — Casper MCP Server.

Exposes the protocol's live on-chain state (read from the four Odra contracts on
Casper Testnet) to any MCP-compatible AI agent as standardized *tools*. This is
the Casper AI Toolkit pattern: instead of bespoke API glue, an LLM (Claude, etc.)
can query SAWIT chain state, oracle reputation, holder positions and the live
palm-oil price through MCP tool calls.

The on-chain reads go through the same `read_state` / `read_balance` bridges the
frontend uses (CSPR.cloud can't see Odra's internal state, so we read it directly
via Odra's livenet client). Reads are served from the bridge's cache for snappy
tool calls; `refresh_protocol_state` forces a fresh live read.

Run (stdio transport):
    ./.venv/bin/python agents/mcp_server.py

Connect from Claude Desktop — add to claude_desktop_config.json:
    {
      "mcpServers": {
        "sawit-finance": {
          "command": "/ABSOLUTE/PATH/.venv/bin/python",
          "args": ["/ABSOLUTE/PATH/agents/mcp_server.py"]
        }
      }
    }
"""
from __future__ import annotations

import csv
import hashlib
import io
import json
import os
import subprocess
import threading
import time
import urllib.request

from mcp.server.fastmcp import FastMCP

# ─── paths / config ───
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ENV_FILE = os.path.join(ROOT, ".env")
STATE_CACHE = os.path.join(ROOT, "frontend", ".state-cache.json")
READ_STATE_BIN = os.path.join(ROOT, "target", "release", "read_state")
READ_BALANCE_BIN = os.path.join(ROOT, "target", "release", "read_balance")
EXPLORER = "https://testnet.cspr.live"
FRED_CSV = "https://fred.stlouisfed.org/graph/fredgraph.csv?id=PPOILUSDM"

CONTRACTS = {
    "ProductionVault": "0b860c574e7b7cd6969a33dd57992fc6efedd503473b44e1c9309f1c8455e365",
    "SawitToken": "579f3197493048529a56ea3887721c4bd027e3fad6755644f19446b4c9205a47",
    "TokenMinter": "cb3b96b8cdb987178db0353ef6a713a7d888a4256f59702243187982358d8e06",
    "YieldDistributor": "1a04935782cbd60b7a4cfddea6ab18a6efd0348b862171c6a4fe25c111ccf1e9",
}

ECONOMIC_LOOP = [
    {"step": "record_production", "what": "Oracle records a verified CPO epoch (45,200 t @ $825, reputation 92/100)", "tx": "4d83e1a4b9c12ee2f386e0e14fd325a14ae81abb9446508650a20471b54a7bdb"},
    {"step": "mint_epoch", "what": "TokenMinter reads the vault (CPI) and mints 2,260,000 SAWIT", "tx": "b257a68867b5253b1d5f05c6e362759091f91ec223cd650b6f555335351afb93"},
    {"step": "fund_epoch", "what": "Distribution epoch funded with 100 CSPR (90-day claim window)", "tx": "6fb1893145d969bad32e0f6ba26810a81f532be5b5b288af3977a142e489772f"},
    {"step": "claim_yield", "what": "KYC-verified holder claims yield — CSPR transferred, gated by CPI to the vault", "tx": "23e6e9d7d665a3a94e58170ee2c70434cf6dc71f8c18a2998f97f8497f80f8f6"},
]

mcp = FastMCP("Sawit Finance")

# ─── helpers ───
_mem: dict = {}


def _load_env(path: str) -> dict:
    out = {}
    if not os.path.exists(path):
        return out
    with open(path) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            out[k.strip()] = v.strip()
    return out


def _run_bridge(bin_path: str, extra_env: dict, marker: str) -> dict:
    """Run a read bridge binary and parse its `<MARKER> {json}` line."""
    env = {**os.environ, **_load_env(ENV_FILE), **extra_env}
    proc = subprocess.run([bin_path], env=env, capture_output=True, text=True, timeout=130)
    for line in proc.stdout.splitlines():
        if line.startswith(marker + " "):
            return json.loads(line[len(marker) + 1:])
    raise RuntimeError(f"{marker} not found in bridge output")


_REFRESH_TTL = 90          # seconds — serve cache instantly, refresh in background when older
_refresh_lock = threading.Lock()
_refreshing = False


def _live_read() -> dict:
    """Read all four contracts live, update the in-memory cache, and persist to the
    shared `.state-cache.json` file (same format the frontend /api/state uses)."""
    v = _run_bridge(READ_STATE_BIN, {}, "SAWIT_STATE_JSON")
    _mem["state"] = {"v": v, "at": time.time()}
    try:
        with open(STATE_CACHE, "w") as f:
            json.dump({"state": v, "at": int(time.time() * 1000)}, f)
    except OSError:
        pass
    return v


def _refresh_in_background() -> None:
    """Kick off one live read in a daemon thread (no-op if one is already running)."""
    global _refreshing
    with _refresh_lock:
        if _refreshing:
            return
        _refreshing = True

    def _worker() -> None:
        global _refreshing
        try:
            _live_read()
        except Exception:
            pass
        finally:
            with _refresh_lock:
                _refreshing = False

    threading.Thread(target=_worker, daemon=True).start()


def _state(refresh: bool = False) -> dict:
    """Protocol state. Serves the cached on-chain read instantly for snappy tool
    calls and self-refreshes in the background once the cache passes _REFRESH_TTL;
    refresh=True forces a fresh ~60–90s live read via the bridge."""
    if refresh:
        return _live_read()

    # In-memory cache (fast path) — serve now, refresh in the background if stale.
    cached = _mem.get("state")
    if cached:
        if time.time() - cached["at"] > _REFRESH_TTL:
            _refresh_in_background()
        return cached["v"]

    # Fall back to the shared cache file; refresh in the background if stale.
    if os.path.exists(STATE_CACHE):
        try:
            with open(STATE_CACHE) as f:
                blob = json.load(f)
            v = blob.get("state", {})
            at = blob.get("at", 0) / 1000  # file stores ms
            _mem["state"] = {"v": v, "at": at}
            if time.time() - at > _REFRESH_TTL:
                _refresh_in_background()
            return v
        except (OSError, json.JSONDecodeError):
            pass

    # No cache at all — do the (slow) first live read synchronously.
    return _live_read()


def _account_hash(public_key_hex: str) -> str:
    """Casper account-hash = blake2b256( algo_name + 0x00 + key_bytes )."""
    pk = public_key_hex.lower()
    tag, key = pk[:2], bytes.fromhex(pk[2:])
    algo = {"01": b"ed25519", "02": b"secp256k1"}.get(tag)
    if not algo:
        raise ValueError("unsupported public key algorithm")
    h = hashlib.blake2b(algo + b"\x00" + key, digest_size=32)
    return h.hexdigest()


# ─── tools ───
@mcp.tool()
def get_protocol_state() -> dict:
    """Live on-chain state of the Sawit Finance protocol on Casper Testnet:
    SAWIT supply, verified CPO tonnage + price, GORR, oracle reputation, epochs,
    and the funded distribution / claim window. Read from the four Odra contracts."""
    s = _state()
    price = s.get("latest_cpo_price_cents", 0) / 100
    return {
        "network": "casper-test",
        "sawit_total_supply": int(s.get("total_sawit_supply", "0")),
        "verified_cpo_value_usd": round(s.get("total_tons_cpo", 0) * price, 2),
        "total_cpo_tons": s.get("total_tons_cpo"),
        "cpo_price_usd_per_ton": price,
        "gorr_percent": s.get("gorr_bps", 0) / 100,
        "token_rate_sawit_per_ton": s.get("token_rate"),
        "oracle_reputation": f"{s.get('oracle_reputation')}/100",
        "epochs_recorded": s.get("epoch_count"),
        "current_distribution_epoch": s.get("current_distribution_epoch"),
        "claim_window_open": s.get("latest_epoch_funded"),
        "yield_distributed_cspr": int(s.get("total_distributed_cspr", "0")) / 1e9,
    }


@mcp.tool()
def get_oracle_reputation() -> dict:
    """The AI oracle's on-chain reputation — a rolling accuracy score (0–100) over
    all verified submissions, publicly readable via get_oracle_reputation(). This
    is the trust-minimized oracle reputation the buildathon judging asks for."""
    s = _state()
    score = s.get("oracle_reputation", 0)
    if score >= 90:
        band = "Excellent — GAPKI + KPBN + MPOB all agree"
    elif score >= 75:
        band = "Good — minor divergence between sources"
    elif score >= 60:
        band = "Acceptable — flagged for review"
    else:
        band = "Rejected — contract reverts"
    return {
        "reputation_score": f"{score}/100",
        "interpretation": band,
        "submissions": s.get("oracle_submission_count"),
        "latest_validation_score": f"{s.get('latest_validation_score')}/100",
    }


@mcp.tool()
def get_palm_oil_price() -> dict:
    """Live real-world palm-oil price the oracle anchors on — FRED series
    PPOILUSDM (IMF Global price of Palm Oil, USD/metric ton, monthly). Free, no key."""
    with urllib.request.urlopen(FRED_CSV, timeout=20) as r:
        text = r.read().decode()
    rows = list(csv.reader(io.StringIO(text)))[1:]
    obs = [(d, float(v)) for d, v in rows if v not in ("", ".")]
    date, price = obs[-1]
    return {
        "source": "FRED PPOILUSDM (IMF Global price of Palm Oil)",
        "date": date,
        "price_usd_per_ton": round(price, 2),
        "observations": len(obs),
    }


@mcp.tool()
def get_account_position(public_key: str) -> dict:
    """A holder's live position: SAWIT balance and claimable CSPR for the current
    distribution epoch, read on-chain for the given Casper public key (01.. ed25519
    or 02.. secp256k1)."""
    acct = _account_hash(public_key)
    v = _run_bridge(
        READ_BALANCE_BIN, {"BALANCE_ACCOUNT": f"account-hash-{acct}"}, "SAWIT_BALANCE_JSON"
    )
    return {
        "public_key": public_key,
        "account_hash": acct,
        "sawit_balance": int(v.get("balance", "0")),
        "claimable_cspr": int(v.get("claimable_motes", "0")) / 1e9,
        "epoch": v.get("epoch"),
    }


@mcp.tool()
def get_contracts() -> dict:
    """The four deployed Sawit Finance contracts on Casper Testnet (upgradable Odra
    packages) with cspr.live explorer links."""
    return {
        name: {"package_hash": h, "explorer": f"{EXPLORER}/contract-package/{h}"}
        for name, h in CONTRACTS.items()
    }


@mcp.tool()
def get_economic_loop() -> list:
    """The full economic loop already executed live on Casper Testnet —
    record production → mint SAWIT → fund yield → KYC-gated claim — with the real
    transaction hashes and explorer links for verification."""
    return [
        {**step, "explorer": f"{EXPLORER}/transaction/{step['tx']}"}
        for step in ECONOMIC_LOOP
    ]


@mcp.tool()
def refresh_protocol_state() -> dict:
    """Force a fresh live read of all four contracts from the chain (~60–90s) and
    update the cache. Use when you need the very latest on-chain state."""
    _state(refresh=True)
    return get_protocol_state()


if __name__ == "__main__":
    mcp.run()
