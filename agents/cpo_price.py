"""Sawit Finance — live CPO price feed from FRED PPOILUSDM (IMF global palm oil price, USD/ton); the authoritative price the oracle anchors on."""

import csv
import io
import logging
from typing import Optional, Tuple

import aiohttp

FRED_CSV_URL = "https://fred.stlouisfed.org/graph/fredgraph.csv?id=PPOILUSDM"
FRED_SERIES = "PPOILUSDM"
FEED_LABEL = "FRED PPOILUSDM (IMF Global price of Palm Oil, USD/ton)"

log = logging.getLogger("cpo-price")

async def fetch_palm_oil_price(
    session: aiohttp.ClientSession, timeout: float = 20.0
) -> Optional[Tuple[int, str]]:
    """Fetch the latest global palm oil price; returns (price_cents_per_ton, observation_date) or None if the feed is unavailable."""
    try:
        async with session.get(
            FRED_CSV_URL, timeout=aiohttp.ClientTimeout(total=timeout)
        ) as resp:
            if resp.status != 200:
                log.warning(f"[FEED] FRED returned HTTP {resp.status}")
                return None
            text = await resp.text()
    except Exception as e:
        log.warning(f"[FEED] FRED fetch failed: {e}")
        return None

    latest_date: Optional[str] = None
    latest_val: Optional[float] = None
    reader = csv.reader(io.StringIO(text))
    next(reader, None)
    for row in reader:
        if len(row) < 2:
            continue
        date, raw = row[0], row[1].strip()
        if raw in ("", "."):
            continue
        try:
            latest_val = float(raw)
            latest_date = date
        except ValueError:
            continue

    if latest_val is None or latest_date is None:
        log.warning("[FEED] No valid observation found in FRED response")
        return None

    return int(round(latest_val * 100)), latest_date
