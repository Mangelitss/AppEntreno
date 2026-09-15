// Grafica SVG propia. Recharts traia 40 dependencias para dibujar una linea;
// esto son 60 lineas, pesa nada y se ve mejor en movil.

export interface Point { x: number; y: number; label?: string }

export default function LineChart({
  points, height = 180, unit = '', accent = 'var(--color-accent)', xLabel, yLabel
}: { points: Point[]; height?: number; unit?: string; accent?: string; xLabel?: string; yLabel?: string }) {
  if (points.length === 0) {
    return <div className="flex h-[180px] items-center justify-center text-sm text-ink-500">Sin datos todavia</div>
  }
  if (points.length === 1) {
    return (
      <div className="flex h-[180px] flex-col items-center justify-center gap-1">
        <span className="text-3xl font-semibold">{points[0].y}{unit}</span>
        <span className="text-sm text-ink-500">Un solo registro, la grafica aparece con el segundo</span>
      </div>
    )
  }

  const W = 320, H = height, PAD_X = 8, PAD_TOP = 14, PAD_BOTTOM = 22
  const xs = points.map(p => p.x)
  const ys = points.map(p => p.y)
  const minX = Math.min(...xs), maxX = Math.max(...xs)
  const minY = Math.min(...ys), maxY = Math.max(...ys)
  const spanY = maxY - minY || 1
  const padY = spanY * 0.15

  const sx = (x: number) => PAD_X + ((x - minX) / (maxX - minX || 1)) * (W - PAD_X * 2)
  const sy = (y: number) =>
    PAD_TOP + (1 - (y - (minY - padY)) / (spanY + padY * 2)) * (H - PAD_TOP - PAD_BOTTOM)

  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join(' ')
  const area = `${line} L${sx(maxX).toFixed(1)},${H - PAD_BOTTOM} L${sx(minX).toFixed(1)},${H - PAD_BOTTOM} Z`

  const last = points[points.length - 1]
  const first = points[0]
  const delta = last.y - first.y

  const chart = (
    <div className="min-w-0 flex-1">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="none" style={{ height }}>
        <defs>
          <linearGradient id="fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={accent} stopOpacity="0.22" />
            <stop offset="100%" stopColor={accent} stopOpacity="0" />
          </linearGradient>
        </defs>
        <line x1={PAD_X} y1={H - PAD_BOTTOM} x2={W - PAD_X} y2={H - PAD_BOTTOM} stroke="var(--color-ink-800)" strokeWidth="1" />
        <path d={area} fill="url(#fill)" />
        <path d={line} fill="none" stroke={accent} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        {points.map((p, i) => (
          <circle key={i} cx={sx(p.x)} cy={sy(p.y)} r={i === points.length - 1 ? 3.5 : 2} fill={accent} />
        ))}
      </svg>
      <div className="flex items-baseline justify-between px-1 pt-1 text-xs text-ink-500">
        <span>{first.label ?? ''}</span>
        <span className={delta > 0 ? 'text-emerald-400' : delta < 0 ? 'text-amber-400' : ''}>
          {delta > 0 ? '+' : ''}{Number(delta.toFixed(1))}{unit}
        </span>
        <span>{last.label ?? ''}</span>
      </div>
    </div>
  )

  return (
    <div>
      <div className="flex items-stretch gap-1.5">
        {yLabel && (
          <span
            className="flex items-center text-[10px] uppercase tracking-wide text-ink-500"
            style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
          >
            {yLabel}
          </span>
        )}
        {chart}
      </div>
      {xLabel && (
        <p className="mt-1 text-center text-[10px] uppercase tracking-wide text-ink-500">{xLabel}</p>
      )}
    </div>
  )
}
