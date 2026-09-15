// Radar SVG propio para comparar el reparto por grupo muscular. Sin librerias:
// unos cuantos poligonos y etiquetas. Admite una o dos series (p. ej. periodo
// actual vs anterior) y se dibuja dentro de su viewBox, con hueco para las
// etiquetas de cada eje.

export interface RadarSeries {
  label: string
  color: string
  /** un valor por eje, en el mismo orden que `axes` */
  values: number[]
}

export default function RadarChart({
  axes, series, max: maxProp
}: {
  axes: string[]
  series: RadarSeries[]
  /** tope del eje; si no se pasa, se toma el mayor valor (minimo 1) */
  max?: number
}) {
  const n = axes.length
  const W = 300, H = 250
  const cx = W / 2, cy = H / 2 - 6
  const R = 84
  const rings = 4

  const max = maxProp ?? Math.max(1, ...series.flatMap(s => s.values))

  // Angulo de cada eje: el primero arriba, luego en el sentido de las agujas.
  const angleOf = (i: number) => (-90 + (360 / n) * i) * (Math.PI / 180)
  const point = (i: number, r: number) => [cx + r * Math.cos(angleOf(i)), cy + r * Math.sin(angleOf(i))] as const

  const ringPath = (r: number) =>
    axes.map((_, i) => { const [x, y] = point(i, r); return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}` }).join(' ') + ' Z'

  const seriesPath = (values: number[]) =>
    values.map((v, i) => {
      const [x, y] = point(i, R * Math.max(0, Math.min(1, v / max)))
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
    }).join(' ') + ' Z'

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Distribucion por grupo muscular">
        {/* Anillos de fondo */}
        {Array.from({ length: rings }, (_, k) => (
          <path key={k} d={ringPath((R * (k + 1)) / rings)} fill="none" stroke="var(--color-ink-800)" strokeWidth="1" />
        ))}
        {/* Radios */}
        {axes.map((_, i) => {
          const [x, y] = point(i, R)
          return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="var(--color-ink-800)" strokeWidth="1" />
        })}

        {/* Series */}
        {series.map((s, si) => (
          <path
            key={si}
            d={seriesPath(s.values)}
            fill={s.color}
            fillOpacity={series.length > 1 && si === 0 ? 0.12 : 0.22}
            stroke={s.color}
            strokeWidth="2"
            strokeLinejoin="round"
          />
        ))}

        {/* Etiquetas de los ejes */}
        {axes.map((label, i) => {
          const [x, y] = point(i, R + 16)
          const cos = Math.cos(angleOf(i))
          const anchor = cos > 0.3 ? 'start' : cos < -0.3 ? 'end' : 'middle'
          return (
            <text
              key={i}
              x={x} y={y}
              textAnchor={anchor}
              dominantBaseline="middle"
              className="fill-ink-500"
              style={{ fontSize: 11 }}
            >
              {label}
            </text>
          )
        })}
      </svg>

      {series.length > 0 && (
        <div className="mt-1 flex items-center justify-center gap-4 text-xs text-ink-500">
          {series.map((s, i) => (
            <span key={i} className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.color }} />
              {s.label}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
