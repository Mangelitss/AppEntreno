// ---------------------------------------------------------------------------
// Historial con calendario.
//
// A la izquierda un calendario que cambia de forma segun lo que mires: una
// semana, un mes con su rejilla, o un mapa de calor estilo GitHub para el ano
// o todo el historial. Se puede navegar hacia atras periodo a periodo. A la
// derecha, la lista de entrenos de ese mismo periodo, con su propio scroll.
// ---------------------------------------------------------------------------

import { useMemo, useState } from 'react'
import type { Workout, WorkoutExercise, WorkoutSet } from '../db/types'
import { dateKey } from '../db/repo'
import { formatDateEs, formatDuration, totalVolume } from '../lib/stats'
import { Card, Empty, cx } from './ui'

export interface HistoryItem {
  workout: Workout
  sets: WorkoutSet[]
  exercises: WorkoutExercise[]
}

type View = 'semana' | 'mes' | 'año' | 'completo'

const VIEWS: { key: View; label: string }[] = [
  { key: 'semana', label: 'Semana' },
  { key: 'mes', label: 'Mes' },
  { key: 'año', label: 'Año' },
  { key: 'completo', label: 'Completo' }
]

const DIAS = ['L', 'M', 'X', 'J', 'V', 'S', 'D']
const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

// --- fechas, siempre en hora local y a mediodia para no bailar con el horario de verano ---
const atNoon = (y: number, m: number, d: number) => new Date(y, m, d, 12)
const addDays = (date: Date, n: number) => { const d = new Date(date); d.setDate(d.getDate() + n); return d }
const addMonths = (date: Date, n: number) => { const d = new Date(date); d.setMonth(d.getMonth() + n); return d }
/** Lunes de la semana de esa fecha. */
const startOfWeek = (date: Date) => addDays(date, -((date.getDay() + 6) % 7))
const sameYMD = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
const monthName = (date: Date) => {
  const s = date.toLocaleDateString('es-ES', { month: 'long' })
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** Color de una casilla del calendario/heatmap segun cuantas sesiones ese dia. */
function level(count: number): { className: string; style?: { opacity: number } } {
  if (count <= 0) return { className: 'bg-ink-850' }
  if (count === 1) return { className: 'bg-accent', style: { opacity: 0.4 } }
  if (count === 2) return { className: 'bg-accent', style: { opacity: 0.65 } }
  if (count === 3) return { className: 'bg-accent', style: { opacity: 0.85 } }
  return { className: 'bg-accent', style: { opacity: 1 } }
}

export default function HistoryPanel({ items }: { items: HistoryItem[] }) {
  const [view, setView] = useState<View>('semana')
  const [cursor, setCursor] = useState(() => new Date())
  const today = new Date()
  const todayKey = dateKey(today)

  /** Cuantas sesiones hay cada dia (puede haber varias). */
  const countByDay = useMemo(() => {
    const map = new Map<string, number>()
    for (const it of items) map.set(it.workout.dateKey, (map.get(it.workout.dateKey) ?? 0) + 1)
    return map
  }, [items])

  /** El primer dia con datos, para saber donde empieza "Completo". */
  const firstKey = useMemo(
    () => items.reduce<string | null>((min, it) => (min && min < it.workout.dateKey ? min : it.workout.dateKey), null),
    [items]
  )

  /** Rango [inicio, fin] del periodo actual; null en "Completo". */
  const range = useMemo(() => {
    if (view === 'completo') return null
    if (view === 'semana') {
      const start = startOfWeek(cursor)
      return { start, end: addDays(start, 6) }
    }
    if (view === 'mes') {
      return {
        start: atNoon(cursor.getFullYear(), cursor.getMonth(), 1),
        end: atNoon(cursor.getFullYear(), cursor.getMonth() + 1, 0)
      }
    }
    return { start: atNoon(cursor.getFullYear(), 0, 1), end: atNoon(cursor.getFullYear(), 11, 31) }
  }, [view, cursor])

  /** Entrenos del periodo, ya ordenados de mas nuevo a mas viejo por como llegan. */
  const listItems = useMemo(() => {
    if (!range) return items
    const s = dateKey(range.start)
    const e = dateKey(range.end)
    return items.filter(it => it.workout.dateKey >= s && it.workout.dateKey <= e)
  }, [items, range])

  /** Resumen del periodo para no dejar hueco muerto bajo el calendario. */
  const summary = useMemo(() => {
    let volume = 0
    let series = 0
    for (const it of listItems) {
      volume += totalVolume(it.sets)
      series += it.sets.filter(s => s.done).length
    }
    return { sessions: listItems.length, volume: Math.round(volume), series }
  }, [listItems])

  const move = (dir: -1 | 1) => setCursor(c =>
    view === 'semana' ? addDays(c, dir * 7) : view === 'mes' ? addMonths(c, dir) : addMonths(c, dir * 12)
  )

  // No se viaja al futuro: el "siguiente" se apaga cuando el periodo ya llega a hoy.
  const atPresent = !range || dateKey(range.end) >= todayKey

  const label = view === 'completo' ? 'Todo tu historial'
    : view === 'semana' ? `${range!.start.getDate()} ${MESES[range!.start.getMonth()]} – ${range!.end.getDate()} ${MESES[range!.end.getMonth()]} ${range!.end.getFullYear()}`
    : view === 'mes' ? `${monthName(cursor)} ${cursor.getFullYear()}`
    : `${cursor.getFullYear()}`

  return (
    <div className="lg:grid lg:grid-cols-2 lg:items-start lg:gap-6">
      {/* Columna izquierda: calendario / mapa de calor */}
      <div className="mb-4 space-y-4 lg:mb-0 lg:sticky lg:top-4">
        <Card className="p-4">
          <div className="mb-4 flex items-center justify-between gap-2">
            <button
              onClick={() => move(-1)}
              disabled={view === 'completo'}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-300 transition-colors enabled:hover:bg-ink-800 disabled:opacity-30"
              aria-label="Periodo anterior"
            >‹</button>
            <p className="text-center text-sm font-medium">{label}</p>
            <button
              onClick={() => move(1)}
              disabled={atPresent}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-300 transition-colors enabled:hover:bg-ink-800 disabled:opacity-30"
              aria-label="Periodo siguiente"
            >›</button>
          </div>

          {view === 'semana' && <WeekGrid start={range!.start} countByDay={countByDay} today={today} />}
          {view === 'mes' && <MonthGrid cursor={cursor} countByDay={countByDay} today={today} />}
          {view === 'año' && (
            <Heatmap
              start={atNoon(cursor.getFullYear(), 0, 1)}
              end={atNoon(cursor.getFullYear(), 11, 31)}
              countByDay={countByDay}
              todayKey={todayKey}
            />
          )}
          {view === 'completo' && (
            <Heatmap
              start={firstKey ? new Date(`${firstKey}T12:00:00`) : today}
              end={today}
              countByDay={countByDay}
              todayKey={todayKey}
            />
          )}
        </Card>

        <div className="grid grid-cols-3 gap-2">
          <Card className="p-3 text-center">
            <p className="text-xl font-semibold">{summary.sessions}</p>
            <p className="text-xs text-ink-500">entrenos</p>
          </Card>
          <Card className="p-3 text-center">
            <p className="text-xl font-semibold">{summary.volume.toLocaleString('es-ES')}</p>
            <p className="text-xs text-ink-500">kg movidos</p>
          </Card>
          <Card className="p-3 text-center">
            <p className="text-xl font-semibold">{summary.series}</p>
            <p className="text-xs text-ink-500">series</p>
          </Card>
        </div>
      </div>

      {/* Columna derecha: selector + lista */}
      <div>
        <div className="mb-3 flex gap-1 rounded-xl bg-ink-900 p-1">
          {VIEWS.map(v => (
            <button
              key={v.key}
              onClick={() => { setView(v.key); setCursor(new Date()) }}
              className={cx(
                'flex-1 rounded-lg py-2 text-sm transition-colors',
                view === v.key ? 'bg-ink-800 text-ink-100' : 'text-ink-500'
              )}
            >
              {v.label}
            </button>
          ))}
        </div>

        <div className="space-y-2 lg:max-h-[calc(100vh-13rem)] lg:overflow-y-auto lg:pr-1">
          {listItems.length === 0 ? (
            <Empty
              title="Sin entrenos aqui"
              hint={view === 'completo'
                ? 'Cuando termines tu primer entreno aparecera en esta lista.'
                : 'Prueba a moverte a otro periodo con las flechas, o cambia la vista.'}
            />
          ) : listItems.map(({ workout, sets, exercises }) => (
            <Card key={workout.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">{workout.routineName}</p>
                  <p className="text-sm text-ink-500">{formatDateEs(workout.dateKey)}</p>
                  <p className="mt-1 truncate text-xs capitalize text-ink-500">
                    {exercises.map(e => e.exerciseName).join(' · ')}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-mono text-sm">{Math.round(totalVolume(sets)).toLocaleString('es-ES')} kg</p>
                  <p className="text-xs text-ink-500">
                    {sets.filter(s => s.done).length} series
                    {workout.finishedAt && ` · ${formatDuration(workout.finishedAt - workout.startedAt)}`}
                  </p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  )
}

/** Una fila con los siete dias de la semana. */
function WeekGrid({ start, countByDay, today }: { start: Date; countByDay: Map<string, number>; today: Date }) {
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
function MonthGrid({ cursor, countByDay, today }: { cursor: Date; countByDay: Map<string, number>; today: Date }) {
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
function Heatmap({ start, end, countByDay, todayKey }: {
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

  return (
    <div className="overflow-x-auto pb-1">
      <div className="inline-flex flex-col gap-1">
        {/* Etiquetas de mes, alineadas con la columna donde empieza cada uno */}
        <div className="flex pl-[18px]">
          <div className="flex gap-[3px]">
            {weeks.map((col, i) => {
              const prev = weeks[i - 1]?.[0]
              const showLabel = i === 0 || (prev && col[0].getMonth() !== prev.getMonth())
              return (
                <div key={i} className="relative h-3 w-3">
                  {showLabel && (
                    <span className="absolute left-0 top-0 whitespace-nowrap text-[9px] leading-3 text-ink-500">
                      {MESES[col[0].getMonth()]}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        <div className="flex gap-1">
          {/* Etiquetas L / X / V a la izquierda */}
          <div className="flex w-[14px] flex-col gap-[3px]">
            {DIAS.map((d, i) => (
              <span key={d} className="h-3 text-[9px] leading-3 text-ink-500">{i % 2 === 0 ? d : ''}</span>
            ))}
          </div>

          <div className="flex gap-[3px]">
            {weeks.map((col, i) => (
              <div key={i} className="flex flex-col gap-[3px]">
                {col.map(d => {
                  const key = dateKey(d)
                  const future = key > todayKey
                  const count = countByDay.get(key) ?? 0
                  const lv = level(count)
                  return (
                    <div
                      key={key}
                      title={future ? undefined : `${formatDateEs(key)}: ${count} ${count === 1 ? 'entreno' : 'entrenos'}`}
                      className={cx('h-3 w-3 rounded-sm', future ? 'bg-ink-900' : lv.className)}
                      style={future ? undefined : lv.style}
                    />
                  )
                })}
              </div>
            ))}
          </div>
        </div>

        {/* Leyenda */}
        <div className="mt-1 flex items-center justify-end gap-1 text-[9px] text-ink-500">
          <span>Menos</span>
          <span className="h-3 w-3 rounded-sm bg-ink-850" />
          <span className="h-3 w-3 rounded-sm bg-accent" style={{ opacity: 0.4 }} />
          <span className="h-3 w-3 rounded-sm bg-accent" style={{ opacity: 0.65 }} />
          <span className="h-3 w-3 rounded-sm bg-accent" style={{ opacity: 0.85 }} />
          <span className="h-3 w-3 rounded-sm bg-accent" />
          <span>Más</span>
        </div>
      </div>
    </div>
  )
}
