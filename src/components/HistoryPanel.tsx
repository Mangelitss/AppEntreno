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
import {
  MESES, atNoon, addDays, addMonths, startOfWeek, monthName,
  WeekGrid, MonthGrid, Heatmap
} from './WorkoutCalendar'
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
    <div className="lg:grid lg:grid-cols-5 lg:items-start lg:gap-6">
      {/* Columna izquierda: calendario / mapa de calor (mas ancha para que quepa el ano) */}
      <div className="mb-4 space-y-4 lg:col-span-3 lg:mb-0 lg:sticky lg:top-4">
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
      <div className="lg:col-span-2">
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
