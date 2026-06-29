import { NextResponse } from 'next/server';

// Real palm-oil price history from FRED series PPOILUSDM ("Global price of Palm
// Oil", IMF data, USD/metric ton, monthly). Free, keyless CSV — the same
// authoritative series the Sawit Finance oracle anchors on (agents/cpo_price.py).
const FRED_CSV_URL =
  'https://fred.stlouisfed.org/graph/fredgraph.csv?id=PPOILUSDM';

const MONTHS = 60; // ~5 years of monthly observations

type Point = { date: string; price: number };
let cache: { at: number; data: Point[] } | null = null;
const TTL_MS = 6 * 60 * 60 * 1000; // 6h

async function fetchSeries(): Promise<Point[]> {
  const res = await fetch(FRED_CSV_URL, {
    headers: { Accept: 'text/csv' },
    next: { revalidate: 21600 },
  });
  if (!res.ok) throw new Error(`FRED HTTP ${res.status}`);
  const text = await res.text();
  const rows = text.trim().split('\n').slice(1); // drop header
  const pts: Point[] = [];
  for (const row of rows) {
    const [date, raw] = row.split(',');
    if (!raw || raw === '.' || raw === '') continue; // FRED missing marker
    const price = Number(raw);
    if (Number.isFinite(price)) pts.push({ date, price });
  }
  return pts.slice(-MONTHS);
}

export async function GET() {
  try {
    if (!cache || Date.now() - cache.at > TTL_MS) {
      cache = { at: Date.now(), data: await fetchSeries() };
    }
    const data = cache.data;
    if (!data.length) throw new Error('empty series');
    const first = data[0].price;
    const last = data[data.length - 1].price;
    const changePct = first ? ((last - first) / first) * 100 : 0;
    return NextResponse.json({
      series: data,
      latest: last,
      change_pct: Number(changePct.toFixed(1)),
      source: 'FRED PPOILUSDM (IMF Global price of Palm Oil)',
    });
  } catch (e) {
    return NextResponse.json(
      { error: String(e instanceof Error ? e.message : e) },
      { status: 502 }
    );
  }
}
