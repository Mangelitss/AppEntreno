import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/db'
import { formatDuration } from '../../lib/stats'
import { weekKeyOf } from '../../lib/ranks'
import { muscleContributions } from '../../lib/muscle-work'
import { MUSCLE_GROUPS, groupOf, isRankable } from '../../lib/muscle-groups'
import LineChart, { type Point } from '../../components/LineChart'
import RadarChart from '../../components/RadarChart'
import StatTile from '../../components/StatTile'
import { MonthGrid, atNoon, addMonths, monthName } from '../../components/WorkoutCalendar'
import { PageHeader } from '../../components/Layout'
import { Card, Empty, cx } from '../../components/ui'

const INITIAL = ['E', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D']
const SHORT: Record<string, string> = {
  pecho: 'Pecho', espalda: 'Espalda', hombros: 'Hombros',
  brazos: 'Brazos', abdominales: 'Core', piernas: 'Piernas'
}

interface MonthAgg {
  workouts: number
  durationMs: number
  volume: number
  sets: number
  groups: Map<string, number>
}

const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`

function weeklyStreak(trainedWeeks: Set<string>, today: Date): number {
  const d = new Date(today)
  let wk = weekKeyOf(d)
  if (!trainedWeeks.has(wk)) {
    d.setDate(d.getDate() - 7)
    wk = weekKeyOf(d)
    if (!trainedWeeks.has(wk)) return 0
  }
  let count = 0
  while (trainedWeeks.has(wk)) {
    count++
    d.setDate(d.getDate() - 7)
    wk = weekKeyOf(d)
  }
  return count
}

type Metric = 'workouts' | 'duration' | 'volume'
const METRICS: { key: Metric; label: string }[] = [
  { key: 'workouts', label: 'Entrenamientos' },
  { key: 'duration', label: 'Duracion' },
  { key: 'volume', label: 'Volumen' }
]

export default function MonthlyReport() {
  const navigate = useNavigate()
  const today = useMemo(() => new Date(), [])
  const [cursor, setCursor] = useState(() => atNoon(today.getFullYear(), today.getMonth(), 1))
  const [metric, setMetric] = useState<Metric>('workouts')

  const report = useLiveQuery(async () => {
    const workouts = (await db.workouts.toArray()).filter(w => !w.deletedAt && w.finishedAt)
    const exercises = new Map((await db.exercises.toArray()).map(e => [e.id, e]))
    const sets = (await db.sets.toArray()).filter(s => !s.deletedAt && s.done === 1 && s.type !== 'warmup')
    const wById = new Map(workouts.map(w => [w.id, w]))

    const months = new Map<string, MonthAgg>()
    const ensure = (k: string) => {
      let m = months.get(k)
      if (!m) { m = { workouts: 0, durationMs: 0, volume: 0, sets: 0, groups: new Map() }; months.set(k, m) }
      return m
    }

    for (const w of workouts) {
      const m = ensure(w.dateKey.slice(0, 7))
      m.workouts++
      m.durationMs += (w.finishedAt ?? 0) - w.startedAt
    }
    for (const s of sets) {
      const w = wById.get(s.workoutId)
      if (!w) continue
      const m = ensure(w.dateKey.slice(0, 7))
      m.sets++
      m.volume += s.weight * s.reps
      const ex = exercises.get(s.exerciseId)
      if (!ex || ex.tracking === 'cardio') continue
      for (const c of muscleContributions(ex)) {
        if (!isRankable(c.muscle)) continue
        const g = groupOf(c.muscle)
        if (!g) continue
        m.groups.set(g.id, (m.groups.get(g.id) ?? 0) + c.share)
      }
    }

    const countByDay = new Map<string, number>()
    for (const w of workouts) countByDay.set(w.dateKey, (countByDay.get(w.dateKey) ?? 0) + 1)

    const trainedWeeks = new Set<string>()
    for (const w of workouts) {
      const [y, mo, da] = w.dateKey.split('-').map(Number)
      trainedWeeks.add(weekKeyOf(new Date(y, mo - 1, da)))
    }

    return { months, countByDay, trainedWeeks, total: workouts.length }
  }, [], undefined)

  const curKey = monthKey(cursor)
  const prevKey = monthKey(addMonths(cursor, -1))
  const cur = report?.months.get(curKey)
  const prev = report?.months.get(prevKey)

  // Serie de los ultimos 12 meses hasta el mes en curso.
  const trend: Point[] = useMemo(() => {
    if (!report) return []
    return Array.from({ length: 12 }, (_, i) => {
      const d = addMonths(cursor, -(11 - i))
      const m = report.months.get(monthKey(d))
      const y = metric === 'workouts' ? (m?.workouts ?? 0)
        : metric === 'duration' ? Math.round((m?.durationMs ?? 0) / 60000)
        : Math.round(m?.volume ?? 0)
      return { x: i, y, label: INITIAL[d.getMonth()] }
    })
  }, [report, cursor, metric])

  const trendUnit = metric === 'duration' ? ' min' : metric === 'volume' ? ' kg' : ''
  const atPresent = curKey >= monthKey(today)
  const streak = report ? weeklyStreak(report.trainedWeeks, today) : 0

  const groupValues = (m: MonthAgg | undefined) =>
    MUSCLE_GROUPS.map(g => Math.round((m?.groups.get(g.id) ?? 0) * 10) / 10)

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title={`Informe de ${monthName(cursor)}`} onBack={() => navigate('/estadisticas')} />

      <div className="space-y-4 px-4 pb-8 md:px-8">
        <Card className="p-4">
          <div className="flex items-center justify-between gap-2">
            <button
              onClick={() => setCursor(c => addMonths(c, -1))}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-300 hover:bg-ink-800"
              aria-label="Mes anterior"
            >‹</button>
            <p className="text-center text-sm font-medium">{monthName(cursor)} {cursor.getFullYear()}</p>
            <button
              onClick={() => setCursor(c => addMonths(c, 1))}
              disabled={atPresent}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-300 enabled:hover:bg-ink-800 disabled:opacity-30"
              aria-label="Mes siguiente"
            >›</button>
          </div>
        </Card>

        {!report || report.total === 0 ? (
          <Empty title="Todavia no hay entrenos" hint="Cuando registres entrenos veras aqui tu informe mensual." />
        ) : (
          <div className="space-y-4 lg:grid lg:grid-cols-2 lg:items-start lg:gap-4 lg:space-y-0">
            <div className="space-y-4">
            <Card className="p-4">
              <div className="mb-3 flex gap-1.5">
                {METRICS.map(m => (
                  <button
                    key={m.key}
                    onClick={() => setMetric(m.key)}
                    className={cx(
                      'rounded-full px-3 py-1 text-xs transition-colors',
                      metric === m.key ? 'bg-accent font-medium text-ink-950' : 'bg-ink-800 text-ink-300'
                    )}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
              <LineChart
                points={trend}
                unit={trendUnit}
                yLabel={metric === 'workouts' ? 'Entrenos' : metric === 'duration' ? 'Minutos' : 'kg'}
                xLabel="Ultimos 12 meses"
              />
            </Card>

            <div className="grid grid-cols-2 gap-2">
              <StatTile label="Entrenamientos" value={String(cur?.workouts ?? 0)} prev={String(prev?.workouts ?? 0)} />
              <StatTile label="Duracion" value={formatDuration(cur?.durationMs ?? 0)} prev={formatDuration(prev?.durationMs ?? 0)} />
              <StatTile label="Volumen" value={`${Math.round(cur?.volume ?? 0).toLocaleString('es-ES')} kg`} prev={`${Math.round(prev?.volume ?? 0).toLocaleString('es-ES')} kg`} />
              <StatTile label="Series" value={String(cur?.sets ?? 0)} prev={String(prev?.sets ?? 0)} />
            </div>
            </div>

            <div className="space-y-4">
            <Card className="p-4">
              <p className="mb-3 text-sm text-ink-500">Dias de entrenamiento</p>
              <div className="mb-4 flex flex-col items-center gap-1">
                <span className="text-3xl">🔥</span>
                <span className="text-lg font-semibold">Racha de {streak} {streak === 1 ? 'semana' : 'semanas'}</span>
              </div>
              <MonthGrid cursor={cursor} countByDay={report.countByDay} today={today} />
            </Card>

            <Card className="p-4">
              <p className="mb-2 text-sm text-ink-500">Distribucion de los musculos</p>
              <RadarChart
                axes={MUSCLE_GROUPS.map(g => SHORT[g.id] ?? g.label)}
                series={[
                  { label: `${monthName(cursor)}`, color: 'var(--color-accent)', values: groupValues(cur) },
                  { label: monthName(addMonths(cursor, -1)), color: '#a1a1aa', values: groupValues(prev) }
                ]}
              />
            </Card>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
