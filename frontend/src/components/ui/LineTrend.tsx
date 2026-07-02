
function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return '';
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i];
    const p1 = pts[i + 1];
    const cx = (p0.x + p1.x) / 2;
    d += ` C ${cx} ${p0.y}, ${cx} ${p1.y}, ${p1.x} ${p1.y}`;
  }
  return d;
}

export function LineTrend({
  id = 'trend',
  data,
  className = '',
}: {
  id?: string;
  data?: number[];
  className?: string;
}) {
  const W = 100;
  const H = 80;

  if (!data || data.length < 2) {
    return (
      <svg viewBox={`0 0 ${W} ${H}`} className={`h-full w-full ${className}`} preserveAspectRatio="none">
        {[20, 40, 60].map((y) => (
          <line key={y} x1="0" y1={y} x2={W} y2={y} stroke="#ECEAE6" strokeWidth="0.5" />
        ))}
        <line x1="0" y1={H - 12} x2={W} y2={H - 12} stroke="#E7F2EC" strokeWidth="1.4" className="animate-pulse" />
      </svg>
    );
  }

  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const pad = 8;
  const pts = data.map((v, i) => ({
    x: 3 + (i / (data.length - 1)) * (W - 6),
    y: pad + (1 - (v - min) / span) * (H - pad * 2),
  }));
  const last = pts[pts.length - 1];
  const line = smoothPath(pts);
  const area = `${line} L ${last.x} ${H} L ${pts[0].x} ${H} Z`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={`h-full w-full ${className}`} preserveAspectRatio="none">
      <defs>
        <linearGradient id={`${id}-fill`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1E7A4F" stopOpacity="0.14" />
          <stop offset="100%" stopColor="#1E7A4F" stopOpacity="0" />
        </linearGradient>
      </defs>

      {[20, 40, 60].map((y) => (
        <line key={y} x1="0" y1={y} x2={W} y2={y} stroke="#ECEAE6" strokeWidth="0.5" />
      ))}

      <path d={area} fill={`url(#${id}-fill)`} />
      <path
        d={line}
        fill="none"
        stroke="#1E7A4F"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />

      <circle cx={last.x} cy={last.y} r="3.4" fill="#1E7A4F" opacity="0.16" />
      <circle cx={last.x} cy={last.y} r="1.7" fill="#1E7A4F" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
