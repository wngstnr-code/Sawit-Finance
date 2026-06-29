'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { geoMercator, geoPath } from 'd3-geo';
import { feature } from 'topojson-client';
import { Section } from '@/components/ui/primitives';
import { Reveal } from '@/components/motion/Reveal';

const W = 760;
const H = 440;

const estates = [
  { label: 'Aceh', lon: 96.9, lat: 4.7 },
  { label: 'North Sumatra', lon: 98.7, lat: 3.6 },
  { label: 'Riau', lon: 101.4, lat: 0.5 },
  { label: 'South Sumatra', lon: 104.7, lat: -3.0 },
  { label: 'Lampung', lon: 105.3, lat: -5.0 },
  { label: 'W. Kalimantan', lon: 109.3, lat: 0.0 },
  { label: 'C. Kalimantan', lon: 113.9, lat: -2.0 },
  { label: 'E. Kalimantan', lon: 117.1, lat: 0.5 },
  { label: 'Sulawesi', lon: 119.2, lat: -2.7 },
  { label: 'Papua', lon: 140.7, lat: -2.5 },
];

type Pt = { x: number; y: number; label: string };

export default function BeliefSection() {
  const [path, setPath] = useState('');
  const [pts, setPts] = useState<Pt[]>([]);

  useEffect(() => {
    fetch('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json')
      .then((r) => r.json())
      .then((world: any) => {
        const fc: any = feature(world, world.objects.countries);
        const idn = fc.features.find((f: any) => String(f.id) === '360');
        if (!idn) return;
        const pad = 8;
        const proj = geoMercator().fitExtent(
          [
            [pad, pad],
            [W - pad, H - pad],
          ],
          idn
        );
        const d = geoPath(proj)(idn) || '';
        setPath(d);
        setPts(
          estates
            .map((e) => {
              const p = proj([e.lon, e.lat]);
              return p ? { x: p[0], y: p[1], label: e.label } : null;
            })
            .filter(Boolean) as Pt[]
        );
      })
      .catch(() => {});
  }, []);

  return (
    <Section className="py-24 sm:py-32">
      <div className="grid items-center gap-14 lg:grid-cols-2">
        <Reveal>
          <div className="inline-flex items-center gap-2 text-[12px] font-medium uppercase tracking-[0.14em] text-brand">
            <span className="h-px w-5 bg-brand/40" />
            What we believe
          </div>
          <h2 className="mt-4 font-display text-4xl font-semibold tracking-tighter2 text-ink text-balance sm:text-5xl">
            We believe in{' '}
            <span className="text-brand">verifiable yield</span>.
          </h2>
          <p className="mt-5 max-w-md font-serif text-lg leading-relaxed text-muted sm:text-xl">
            Every token traces back to a real harvest, a real price, and a real
            payout — across estates from Sumatra to Papua. No synthetics, no
            black boxes. Just production you can audit on-chain.
          </p>
        </Reveal>

        <Reveal delay={0.1}>
          <div className="relative w-full overflow-hidden rounded-2xl border border-line bg-bg-2/50 p-4">
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
              {path && (
                <path
                  d={path}
                  fill="#E7F2EC"
                  stroke="#2E9E68"
                  strokeWidth={0.8}
                  strokeOpacity={0.5}
                />
              )}
              {pts.map((p, i) => (
                <g key={p.label}>
                  <motion.circle
                    cx={p.x}
                    cy={p.y}
                    r={12}
                    fill="rgba(30,122,79,0.25)"
                    animate={{ r: [8, 22, 8], opacity: [0.5, 0, 0.5] }}
                    transition={{
                      duration: 2.6,
                      repeat: Infinity,
                      delay: i * 0.25,
                      ease: 'easeInOut',
                    }}
                  />
                  <circle cx={p.x} cy={p.y} r={4.4} fill="#1E7A4F" />
                  <text
                    x={p.x > W - 150 ? p.x - 9 : p.x + 9}
                    y={p.y + 4}
                    textAnchor={p.x > W - 150 ? 'end' : 'start'}
                    className="fill-muted font-mono"
                    fontSize="12"
                  >
                    {p.label}
                  </text>
                </g>
              ))}
            </svg>
            {!path && (
              <div className="flex h-[300px] items-center justify-center text-sm text-faint">
                Loading map…
              </div>
            )}
          </div>
        </Reveal>
      </div>
    </Section>
  );
}
