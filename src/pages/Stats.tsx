import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { dateKey } from '../db/repo'
import { muscleWorkInRange, heatColor } from '../lib/muscle-work'
import { formatDateEs } from '../lib/stats'
import BodyMap from '../components/BodyMap'
import WorkoutSummaryCard, { type WorkoutSummary } from '../components/WorkoutSummaryCard'
import { PageHeader } from '../components/Layout'
import { Card, cx } from '../components/ui'

/** Inicial del dia de la semana por getDay() (0 = domingo). */
const WD = ['D', 'L', 'M', 'X', 'J', 'V', 'S']

interface Advanced {
  to: string
  icon: string
  title: string
  desc: string
}

const ADVANCED: Advanced[] = [
  { to: '/estadisticas/recuento', icon: '📈', title: 'Recuento de series por grupo', desc: 'Como evolucionan tus series de cada grupo semana a semana.' },
  { to: '/estadisticas/distribucion', icon: '🕸', title: 'Distribucion de los musculos (grafico)', desc: 'Compara tu reparto actual con el periodo anterior.' },
  { to: '/estadisticas/distribucion-cuerpo', icon: '🧍', title: 'Distribucion de los musculos (cuerpo)', desc: 'Mapa semanal de musculos trabajados.' },
  { to: '/estadisticas/informe', icon: '📋', title: 'Informe mensual', desc: 'Resumen de tus entrenos y estadisticas del mes.' },
  { to: '/estadisticas/historial-vida', icon: '📅', title: 'Historial de vida', desc: 'Semana, mes o ano: peso, grasa, medidas y entrenos periodo a periodo.' }
]

export default function Stats() {
  const navigate = useNavigate()
  const today = useMemo(() => new Date(), [])

  // Los ultimos 7 dias, del mas antiguo (izquierda) a hoy (derecha).
  const days = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(today)
      d.setDate(d.getDate() - (6 - i))
      return d
    })
  }, [today])

  // null = agregado de los 7 dias; si no, un dia suelto.
  const [selected, setSelected] = useState<string | null>(null)

  const fromKey = selected ?? dateKey(days[0])
  const toKey = selected ?? dateKey(today)
  const weekFrom = dateKey(days[0])
  const weekTo = dateKey(today)

  const work = useLiveQuery(() => muscleWorkInRange(fromKey, toKey), [fromKey, toKey])

  // Cuantos entrenos hubo cada uno de los 7 dias, para marcarlos en la tira.
  const dayCounts = useLiveQuery(async () => {
    const ws = (await db.workouts.toArray())
      .filter(w => !w.deletedAt && w.finishedAt && w.dateKey >= weekFrom && w.dateKey <= weekTo)
    const m = new Map<string, number>()
    for (const w of ws) m.set(w.dateKey, (m.get(w.dateKey) ?? 0) + 1)
    return m
  }, [weekFrom, weekTo], undefined)

  // Detalle del dia elegido: sus entrenos con ejercicios y series.
  const dayDetail = useLiveQuery(async () => {
    if (!selected) return null
    const workouts = (await db.workouts.toArray())
      .filter(w => !w.deletedAt && w.finishedAt && w.dateKey === selected)
      .sort((a, b) => (b.finishedAt ?? 0) - (a.finishedAt ?? 0))
    const existing = new Set((await db.routines.toArray()).filter(r => !r.deletedAt).map(r => r.id))
    if (!workouts.length) return { items: [] as WorkoutSummary[], existing }

    const ids = new Set(workouts.map(w => w.id))
    const allSets = (await db.sets.toArray()).filter(s => !s.deletedAt && ids.has(s.workoutId))
    const allLinks = (await db.workoutExercises.toArray()).filter(l => !l.deletedAt && ids.has(l.workoutId))
    const items: WorkoutSummary[] = workouts.map(w => ({
      workout: w,
      sets: allSets.filter(s => s.workoutId === w.id),
      exercises: allLinks.filter(l => l.workoutId === w.id).sort((a, b) => a.order - b.order)
    }))
    return { items, existing }
  }, [selected], null)

  const colors = useMemo(() => {
    const map = new Map<string, string>()
    if (!work || work.size === 0) return map
    const max = Math.max(...[...work.values()].map(w => w.effectiveSets))
    if (max <= 0) return map
    for (const [muscle, w] of work) map.set(muscle, heatColor(w.effectiveSets / max))
    return map
  }, [work])

  const trained = work ? [...work.values()].filter(w => w.effectiveSets > 0).length : 0

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Estadisticas" subtitle="Como se reparte tu trabajo y como evolucionas" />

      <div className="px-4 pb-8 md:px-8 lg:grid lg:grid-cols-5 lg:items-start lg:gap-6">
        <div className="mb-6 lg:col-span-3 lg:mb-0">
        <Card className="p-4">
          <div className="mb-3 flex items-baseline justify-between gap-2">
            <h2 className="text-sm font-medium text-ink-300">Grafico corporal de los ultimos 7 dias</h2>
            {selected && (
              <button onClick={() => setSelected(null)} className="text-xs text-accent">Ver los 7 dias</button>
            )}
          </div>

          {/* Tira de dias: los entrenados van marcados; toca uno para ver solo ese dia */}
          <div className="mb-4 grid grid-cols-7 gap-1.5">
            {days.map(d => {
              const key = dateKey(d)
              const isToday = key === dateKey(today)
              const isSel = selected === key
              const count = dayCounts?.get(key) ?? 0
              const trainedDay = count > 0
              return (
                <button
                  key={key}
                  onClick={() => setSelected(s => (s === key ? null : key))}
                  title={trainedDay ? `${count} ${count === 1 ? 'entreno' : 'entrenos'}` : 'Descanso'}
                  className={cx(
                    'flex flex-col items-center gap-1 rounded-xl border py-2 transition-colors',
                    isSel ? 'border-accent bg-accent/10'
                      : trainedDay ? 'border-accent/40 bg-accent/5 hover:bg-ink-850'
                      : 'border-ink-800 hover:bg-ink-850'
                  )}
                >
                  <span className="text-[10px] text-ink-500">{WD[d.getDay()]}</span>
                  <span className="text-sm font-semibold leading-none">{d.getDate()}</span>
                  <span
                    className={cx(
                      'h-1.5 w-1.5 rounded-full',
                      trainedDay ? 'bg-accent' : isToday ? 'bg-ink-600' : 'bg-transparent'
                    )}
                  />
                </button>
              )
            })}
          </div>

          <div className="mx-auto max-w-sm">
            <BodyMap colors={colors} />
          </div>

          <div className="mt-2 flex items-center justify-between gap-3 text-[11px] text-ink-500">
            <span className="truncate">{trained > 0 ? `${trained} musculos trabajados` : 'Sin datos en este periodo'}</span>
            <span className="flex shrink-0 items-center gap-1.5">
              Menos
              <span
                className="h-2.5 w-24 rounded-full"
                style={{ background: `linear-gradient(to right, ${[0.05, 0.2, 0.35, 0.5, 0.65, 0.8, 1].map(t => heatColor(t)).join(', ')})` }}
              />
              Mas
            </span>
          </div>
        </Card>

        {/* Detalle del dia elegido: que rutina, que ejercicios y con que pesos */}
        {selected && (
          <section className="mt-4">
            <h3 className="mb-2 px-1 text-sm font-medium capitalize text-ink-300">
              {formatDateEs(selected)}
            </h3>
            {dayDetail === null ? (
              <Card className="p-4 text-sm text-ink-500">Cargando…</Card>
            ) : dayDetail.items.length === 0 ? (
              <Card className="p-4 text-center text-sm text-ink-500">
                Descanso: no entrenaste este dia.
              </Card>
            ) : (
              <div className="space-y-2">
                {dayDetail.items.map(item => (
                  <WorkoutSummaryCard
                    key={item.workout.id}
                    item={item}
                    defaultOpen
                    existingRoutineIds={dayDetail.existing}
                  />
                ))}
              </div>
            )}
          </section>
        )}
        </div>

        <section className="lg:col-span-2">
          <p className="mb-2 px-1 text-xs uppercase tracking-wide text-ink-500">Estadisticas avanzadas</p>
          <Card className="divide-y divide-ink-850 overflow-hidden p-0">
            {ADVANCED.map(item => (
              <button
                key={item.to}
                onClick={() => navigate(item.to)}
                className="flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-ink-850"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-ink-850 text-lg">
                  {item.icon}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{item.title}</p>
                  <p className="truncate text-xs text-ink-500">{item.desc}</p>
                </div>
                <span className="text-ink-600">›</span>
              </button>
            ))}
          </Card>
        </section>
      </div>
    </div>
  )
}
