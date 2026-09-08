import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { epley1RM, formatDateEs, formatDuration, formatKg, totalVolume } from '../lib/stats'
import { effectiveSets } from '../lib/progression'
import { displayName } from '../lib/muscles'
import { formatCardioDuration } from '../lib/cardio'
import { buildWeekMuscleData } from '../db/rank-data'
import { computeMuscleRanks, weekKeyOf } from '../lib/ranks'
import RankPanel from '../components/RankPanel'
import LineChart, { type Point } from '../components/LineChart'
import ExercisePicker from '../components/ExercisePicker'
import { Button, Card, Empty, Pill, cx } from '../components/ui'
import { PageHeader } from '../components/Layout'

type Metric = '1rm' | 'peso' | 'volumen' | 'duracion' | 'distancia' | 'kcal'

const STRENGTH_METRICS: { key: Metric; label: string }[] = [
  { key: '1rm', label: '1RM estimado' },
  { key: 'peso', label: 'Peso maximo' },
  { key: 'volumen', label: 'Volumen' }
]

const CARDIO_METRICS: { key: Metric; label: string }[] = [
  { key: 'duracion', label: 'Duracion' },
  { key: 'distancia', label: 'Distancia' },
  { key: 'kcal', label: 'Kcal' }
]

export default function Progress() {
  // Se puede entrar desde la ficha de un ejercicio con ?ejercicio=<id>.
  const [params, setParams] = useSearchParams()
  const [exerciseId, setExerciseId] = useState<string | null>(params.get('ejercicio'))
  const [metric, setMetric] = useState<Metric>('1rm')
  const [picking, setPicking] = useState(false)
  // Al abrir Progreso se ve primero Rangos, que aprovecha el ancho del escritorio.
  // Salvo que llegues desde la ficha de un ejercicio (?ejercicio=): ahi quieres su grafica.
  const [tab, setTab] = useState<'ejercicio' | 'rangos' | 'historial'>(
    params.get('ejercicio') ? 'ejercicio' : 'rangos'
  )

  // Los rangos se recalculan del historial, no se guardan: corregir un entreno
  // antiguo tambien los corrige.
  const weekData = useLiveQuery(() => buildWeekMuscleData(), [], [])
  const ranks = useMemo(
    () => computeMuscleRanks(weekData ?? [], weekKeyOf(new Date())),
    [weekData]
  )

  const exercise = useLiveQuery(() => exerciseId ? db.exercises.get(exerciseId) : undefined, [exerciseId])
  const progression = useLiveQuery(() => exerciseId ? db.progression.get(exerciseId) : undefined, [exerciseId])

  /** Serie temporal del ejercicio elegido, una entrada por sesion. */
  const series = useLiveQuery(async () => {
    if (!exerciseId) return []
    const links = (await db.workoutExercises.where('exerciseId').equals(exerciseId).toArray()).filter(l => !l.deletedAt)
    const rows: {
      date: number; dateKey: string; top: number; best1RM: number; volume: number
      minutes: number; km: number; kcal: number
    }[] = []

    for (const link of links) {
      const workout = await db.workouts.get(link.workoutId)
      if (!workout || workout.deletedAt || !workout.finishedAt) continue
      const sets = effectiveSets(
        (await db.sets.where('workoutExerciseId').equals(link.id).toArray()).filter(s => !s.deletedAt)
      )
      if (!sets.length) continue
      rows.push({
        date: workout.finishedAt,
        dateKey: workout.dateKey,
        top: Math.max(...sets.map(s => s.weight)),
        best1RM: Math.max(...sets.map(s => epley1RM(s.weight, s.reps))),
        volume: sets.reduce((a, s) => a + s.weight * s.reps, 0),
        minutes: sets.reduce((a, s) => a + (s.durationSec ?? 0), 0) / 60,
        km: sets.reduce((a, s) => a + (s.distanceKm ?? 0), 0),
        kcal: sets.reduce((a, s) => a + (s.kcal ?? 0), 0)
      })
    }
    return rows.sort((a, b) => a.date - b.date)
  }, [exerciseId], [])

  const history = useLiveQuery(async () => {
    const workouts = (await db.workouts.toArray())
      .filter(w => !w.deletedAt && w.finishedAt)
      .sort((a, b) => (b.finishedAt ?? 0) - (a.finishedAt ?? 0))
      .slice(0, 40)
    return Promise.all(workouts.map(async w => ({
      workout: w,
      sets: (await db.sets.where('workoutId').equals(w.id).toArray()).filter(s => !s.deletedAt),
      exercises: (await db.workoutExercises.where('workoutId').equals(w.id).toArray()).filter(l => !l.deletedAt)
    })))
  }, [], [])

  const isCardio = exercise?.tracking === 'cardio'
  const metrics = isCardio ? CARDIO_METRICS : STRENGTH_METRICS

  // Si cambias de un ejercicio de fuerza a una actividad de cardio, la metrica
  // que tenias elegida deja de existir: volvemos a la primera del grupo.
  useEffect(() => {
    if (!metrics.some(m => m.key === metric)) setMetric(metrics[0].key)
  }, [isCardio])

  const points: Point[] = useMemo(() => (series ?? []).map(r => {
    const value =
      metric === '1rm' ? r.best1RM
        : metric === 'peso' ? r.top
        : metric === 'volumen' ? r.volume
        : metric === 'duracion' ? r.minutes
        : metric === 'distancia' ? r.km
        : r.kcal
    return { x: r.date, y: Number(value.toFixed(1)), label: formatDateEs(r.dateKey) }
  }), [series, metric])

  const unit = metric === 'duracion' ? ' min'
    : metric === 'distancia' ? ' km'
    : metric === 'kcal' ? ' kcal'
    : ' kg'

  const pr = useMemo(() => {
    if (!series?.length) return null
    return {
      maxWeight: Math.max(...series.map(r => r.top)),
      best1RM: Math.max(...series.map(r => r.best1RM)),
      sessions: series.length
    }
  }, [series])

  return (
    <div className={cx('mx-auto', tab === 'rangos' ? 'max-w-6xl' : 'max-w-3xl')}>
      <PageHeader title="Progreso" subtitle="Como evoluciona cada ejercicio y todo tu historial" />

      <div className="px-4 pb-8 md:px-8">
        <div className={cx(
          'mb-4 flex gap-1 rounded-xl bg-ink-900 p-1',
          // En rangos la pagina va ancha, pero el selector no tiene por que estirarse.
          tab === 'rangos' && 'md:max-w-lg'
        )}>
          {(['ejercicio', 'rangos', 'historial'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cx(
                'flex-1 rounded-lg py-2 text-sm capitalize transition-colors',
                tab === t ? 'bg-ink-800 text-ink-100' : 'text-ink-500'
              )}
            >
              {t === 'ejercicio' ? 'Por ejercicio' : t === 'rangos' ? 'Rangos' : 'Historial'}
            </button>
          ))}
        </div>

        {tab === 'rangos' ? (
          <RankPanel ranks={ranks} />
        ) : tab === 'ejercicio' ? (
          <div className="space-y-4">
            <Button variant="outline" className="w-full justify-between" onClick={() => setPicking(true)}>
              <span className="truncate capitalize">{exercise ? displayName(exercise) : 'Elegir ejercicio'}</span>
              <span className="text-ink-500">▾</span>
            </Button>

            {!exerciseId ? (
              <Empty title="Elige un ejercicio" hint="Veras su grafica de progreso, tus records y si estas listo para subir peso." />
            ) : (series ?? []).length === 0 ? (
              <Empty title="Sin datos de este ejercicio" hint="Hazlo en un entreno y termina la sesion para que aparezca aqui." />
            ) : (
              <>
                <Card className="p-4">
                  <div className="mb-3 flex gap-1.5">
                    {metrics.map(m => (
                      <button
                        key={m.key}
                        onClick={() => setMetric(m.key)}
                        className={cx(
                          'rounded-full px-3 py-1 text-xs transition-colors',
                          metric === m.key ? 'bg-accent text-ink-950 font-medium' : 'bg-ink-800 text-ink-300'
                        )}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                  <LineChart points={points} unit={unit} />
                </Card>

                <div className="grid grid-cols-3 gap-2">
                  {isCardio ? (
                    <>
                      <Card className="p-4 text-center">
                        <p className="text-xl font-semibold">
                          {formatCardioDuration((series ?? []).reduce((a, r) => a + r.minutes, 0) * 60)}
                        </p>
                        <p className="text-xs text-ink-500">tiempo total</p>
                      </Card>
                      <Card className="p-4 text-center">
                        <p className="text-xl font-semibold">
                          {Math.round((series ?? []).reduce((a, r) => a + r.km, 0))}
                        </p>
                        <p className="text-xs text-ink-500">km acumulados</p>
                      </Card>
                      <Card className="p-4 text-center">
                        <p className="text-xl font-semibold">{pr?.sessions ?? 0}</p>
                        <p className="text-xs text-ink-500">sesiones</p>
                      </Card>
                    </>
                  ) : (
                    <>
                      <Card className="p-4 text-center">
                        <p className="text-xl font-semibold">{formatKg(pr?.maxWeight ?? 0)}</p>
                        <p className="text-xs text-ink-500">kg maximo</p>
                      </Card>
                      <Card className="p-4 text-center">
                        <p className="text-xl font-semibold">{formatKg(Math.round((pr?.best1RM ?? 0) * 10) / 10)}</p>
                        <p className="text-xs text-ink-500">1RM estimado</p>
                      </Card>
                      <Card className="p-4 text-center">
                        <p className="text-xl font-semibold">{pr?.sessions ?? 0}</p>
                        <p className="text-xs text-ink-500">sesiones</p>
                      </Card>
                    </>
                  )}
                </div>

                {!isCardio && progression && (
                  <Card className="p-4">
                    <p className="mb-2 text-sm text-ink-500">Estado de progresion</p>
                    <div className="flex flex-wrap items-center gap-2">
                      <Pill tone={progression.streak > 0 ? 'good' : 'default'}>
                        Racha {progression.streak}
                      </Pill>
                      {progression.pendingWeightKg > 0 && (
                        <Pill tone="accent">+{formatKg(progression.pendingWeightKg)} kg la proxima vez</Pill>
                      )}
                      {progression.pendingReps > 0 && (
                        <Pill tone="accent">+{progression.pendingReps} reps la proxima vez</Pill>
                      )}
                      {progression.streak === 0 && progression.pendingWeightKg === 0 && progression.pendingReps === 0 && (
                        <span className="text-xs text-ink-500">Sigue con el peso actual hasta cerrar el rango de reps</span>
                      )}
                    </div>
                  </Card>
                )}
              </>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {(history ?? []).length === 0 ? (
              <Empty title="Historial vacio" hint="Aqui se acumulan todos los entrenos que termines." />
            ) : (history ?? []).map(({ workout, sets, exercises }) => (
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
        )}
      </div>

      <ExercisePicker
        open={picking}
        onClose={() => setPicking(false)}
        onPick={id => {
          setExerciseId(id)
          setParams(id ? { ejercicio: id } : {}, { replace: true })
          setPicking(false)
        }}
      />
    </div>
  )
}
