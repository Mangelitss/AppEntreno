// ---------------------------------------------------------------------------
// Calendario de entrenos, en tres formas: fila de una semana, rejilla de un mes
// y mapa de calor estilo GitHub. Lo comparten el Historial (Progreso) y el
// Informe mensual (Estadisticas) para no duplicar ni el dibujo ni las fechas.
// ---------------------------------------------------------------------------

import { useMemo } from 'react'
import { dateKey } from '../db/repo'
import { formatDateEs } from '../lib/stats'
import { cx } from './ui'

export const DIAS = ['L', 'M', 'X', 'J', 'V', 'S', 'D']
export const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

// --- fechas, siempre en hora local y a mediodia para no bailar con el horario de verano ---
export const atNoon = (y: number, m: number, d: number) => new Date(y, m, d, 12)
export const addDays = (date: Date, n: number) => { const d = new Date(date); d.setDate(d.getDate() + n); return d }
export const addMonths = (date: Date, n: number) => { const d = new Date(date); d.setMonth(d.getMonth() + n); return d }
/** Lunes de la semana de esa fecha. */
export const startOfWeek = (date: Date) => addDays(date, -((date.getDay() + 6) % 7))
export const sameYMD = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
export const monthName = (date: Date) => {
  const s = date.toLocaleDateString('es-ES', { month: 'long' })
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** Color de una casilla del calendario/heatmap segun cuantas sesiones ese dia. */
export function level(count: number): { className: string; style?: { opacity: number } } {
  if (count <= 0) return { className: 'bg-ink-850' }
  if (count === 1) return { className: 'bg-accent', style: { opacity: 0.4 } }
  if (count === 2) return { className: 'bg-accent', style: { opacity: 0.65 } }
  if (count === 3) return { className: 'bg-accent', style: { opacity: 0.85 } }
  return { className: 'bg-accent', style: { opacity: 1 } }
}

/** Una fila con los siete dias de la semana. */
export function WeekGrid({ start, countByDay, today }: { start: Date; countByDay: Map<string, number>; today: Date }) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i))
  return (
    <div className="grid grid-cols-7 gap-2">
      {days.map((d, i) => {
        const key = dateKey(d)
        const count = countByDay.get(key) ?? 0
        const isToday = sameYMD(d, today)
        const lv = level(count)
        return (
          <div
            key={key}
            className={cx(
              'flex min-h-[4.5rem] flex-col items-center justify-between rounded-xl border p-2',
              count > 0 ? 'border-transparent' : 'border-ink-800',
              isToday && 'ring-1 ring-accent'
            )}
            style={count > 0 ? { backgroundColor: 'color-mix(in srgb, var(--color-accent) 14%, transparent)' } : undefined}
          >
            <span className="text-[10px] text-ink-500">{DIAS[i]}</span>
            <span className="text-lg font-semibold leading-none">{d.getDate()}</span>
            <span className={cx('h-2 w-2 rounded-full', lv.className)} style={lv.style} />
          </div>
        )
      })}
    </div>
  )
}

/** Rejilla del mes completo, con los huecos del principio para cuadrar el lunes. */
export function MonthGrid({ cursor, countByDay, today }: { cursor: Date; countByDay: Map<string, number>; today: Date }) {
  const year = cursor.getFullYear()
  const month = cursor.getMonth()
  const first = atNoon(year, month, 1)
  const lead = (first.getDay() + 6) % 7
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells: (number | null)[] = [
    ...Array<null>(lead).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1)
  ]
  return (
    <div>
      <div className="mb-1.5 grid grid-cols-7 gap-1.5">
        {DIAS.map(d => <span key={d} className="text-center text-[10px] text-ink-500">{d}</span>)}
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {cells.map((day, idx) => {
          if (day === null) return <div key={`x${idx}`} />
          const d = atNoon(year, month, day)
          const key = dateKey(d)
          const count = countByDay.get(key) ?? 0
          const isToday = sameYMD(d, today)
          return (
            <div
              key={key}
              className={cx(
                'flex aspect-square flex-col items-center justify-center rounded-lg text-sm',
                count > 0 ? 'font-semibold text-ink-100' : 'text-ink-500',
                isToday && 'ring-1 ring-accent'
              )}
              style={count > 0
                ? { backgroundColor: `color-mix(in srgb, var(--color-accent) ${18 + Math.min(count, 4) * 18}%, transparent)` }
                : { backgroundColor: 'var(--color-ink-850)' }}
              title={count > 0 ? `${count} ${count === 1 ? 'entreno' : 'entrenos'}` : undefined}
            >
              {day}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** Mapa de calor estilo GitHub: columnas = semanas, filas = L..D. */
export function Heatmap({ start, end, countByDay, todayKey }: {
  start: Date; end: Date; countByDay: Map<string, number>; todayKey: string
}) {
  const weeks = useMemo(() => {
    const cols: Date[][] = []
    let cur = startOfWeek(start)
    const last = addDays(end, 1)
    while (cur < last) {
      cols.push(Array.from({ length: 7 }, (_, i) => addDays(cur, i)))
      cur = addDays(cur, 7)
    }
    return cols
  }, [start, end])

  // Las columnas se reparten el ancho disponible (minmax(0,1fr)), asi que el ano
  // entero cabe sin scroll horizontal por estrecha que sea la tarjeta.
  const cols = { gridTemplateColumns: `repeat(${weeks.length}, minmax(0, 1fr))` }

  return (
    <div>
      {/* Etiquetas de mes, alineadas con la columna donde empieza cada uno */}
      <div className="mb-1 grid gap-[2px] pl-[18px]" style={cols}>
        {weeks.map((col, i) => {
          const prev = weeks[i - 1]?.[0]
          const showLabel = i === 0 || (prev && col[0].getMonth() !== prev.getMonth())
          return (
            <div key={i} className="relative h-3">
              {showLabel && (
                <span className="absolute left-0 top-0 whitespace-nowrap text-[9px] leading-3 text-ink-500">
                  {MESES[col[0].getMonth()]}
                </span>
              )}
            </div>
          )
        })}
      </div>

      <div className="flex gap-1">
        {/* Etiquetas L / X / V, repartidas a lo alto para cuadrar con las 7 filas */}
        <div className="flex w-3.5 shrink-0 flex-col gap-[2px]">
          {DIAS.map((d, i) => (
            <span key={d} className="flex flex-1 items-center text-[8px] leading-none text-ink-500">
              {i % 2 === 0 ? d : ''}
            </span>
          ))}
        </div>

        <div className="grid flex-1 gap-[2px]" style={cols}>
          {weeks.map((col, i) => (
            <div key={i} className="flex flex-col gap-[2px]">
              {col.map(d => {
                const key = dateKey(d)
                const future = key > todayKey
                const count = countByDay.get(key) ?? 0
                const lv = level(count)
                return (
                  <div
                    key={key}
                    title={future ? undefined : `${formatDateEs(key)}: ${count} ${count === 1 ? 'entreno' : 'entrenos'}`}
                    className={cx('aspect-square w-full rounded-[2px]', future ? 'bg-ink-900' : lv.className)}
                    style={future ? undefined : lv.style}
                  />
                )
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Leyenda */}
      <div className="mt-2 flex items-center justify-end gap-1 text-[9px] text-ink-500">
        <span>Menos</span>
        <span className="h-2.5 w-2.5 rounded-sm bg-ink-850" />
        <span className="h-2.5 w-2.5 rounded-sm bg-accent" style={{ opacity: 0.4 }} />
        <span className="h-2.5 w-2.5 rounded-sm bg-accent" style={{ opacity: 0.65 }} />
        <span className="h-2.5 w-2.5 rounded-sm bg-accent" style={{ opacity: 0.85 }} />
        <span className="h-2.5 w-2.5 rounded-sm bg-accent" />
        <span>Más</span>
      </div>
    </div>
  )
}
