import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { WEEKDAYS, WEEKDAYS_SHORT, weekdayIndex } from '../db/repo'
import { activeWorkout, startWorkout } from '../db/actions'
import { Button, Card, Empty, Pill } from '../components/ui'
import { PageHeader } from '../components/Layout'
import { formatDateEs, formatDuration, totalVolume } from '../lib/stats'

export default function Today() {
  const navigate = useNavigate()
  const today = weekdayIndex()

  const schedule = useLiveQuery(() => db.schedule.toArray(), [], [])
  const routines = useLiveQuery(() => db.routines.toArray(), [], [])
  const open = useLiveQuery(() => activeWorkout(), [], null)
  const recent = useLiveQuery(async () => {
    const workouts = (await db.workouts.toArray())
      .filter(w => !w.deletedAt && w.finishedAt)
      .sort((a, b) => (b.finishedAt ?? 0) - (a.finishedAt ?? 0))
      .slice(0, 5)
    return Promise.all(workouts.map(async w => ({
      workout: w,
      sets: (await db.sets.where('workoutId').equals(w.id).toArray()).filter(s => !s.deletedAt)
    })))
  }, [], [])

  const byId = useMemo(
    () => new Map((routines ?? []).filter(r => !r.deletedAt).map(r => [r.id, r])),
    [routines]
  )
  const todayEntry = (schedule ?? []).find(d => d.weekday === today)
  const todayRoutine = todayEntry?.routineId ? byId.get(todayEntry.routineId) : null

  const week = (schedule ?? []).slice().sort((a, b) => a.weekday - b.weekday)

  async function begin(routineId: string | null) {
    const id = await startWorkout(routineId)
    navigate(`/entreno/${id}`)
  }

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title={WEEKDAYS[today]}
        subtitle={new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })}
      />

      <div className="space-y-4 px-4 md:px-8">
        {open && (
          <Card className="border-accent/40 bg-accent/5 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <Pill tone="accent">En curso</Pill>
                <p className="mt-2 font-medium">{open.routineName}</p>
                <p className="text-sm text-ink-500">
                  Empezado hace {formatDuration(Date.now() - open.startedAt)}
                </p>
              </div>
              <Button variant="primary" size="lg" onClick={() => navigate(`/entreno/${open.id}`)}>
                Continuar
              </Button>
            </div>
          </Card>
        )}

        {!open && (
          <Card className="p-5">
            {todayRoutine ? (
              <>
                <p className="text-sm text-ink-500">Hoy toca</p>
                <h2 className="mt-1 text-xl font-semibold">{todayRoutine.name}</h2>
                <Button variant="primary" size="lg" className="mt-4 w-full" onClick={() => void begin(todayRoutine.id)}>
                  Empezar entreno
                </Button>
              </>
            ) : (
              <>
                <p className="text-sm text-ink-500">Hoy no tienes nada asignado</p>
                <h2 className="mt-1 text-xl font-semibold">Dia libre</h2>
                <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                  <Button variant="outline" className="flex-1" onClick={() => navigate('/rutinas')}>
                    Elegir una rutina
                  </Button>
                  <Button variant="subtle" className="flex-1" onClick={() => void begin(null)}>
                    Entreno libre
                  </Button>
                </div>
              </>
            )}
          </Card>
        )}

        <Card className="p-4">
          <p className="mb-3 text-sm text-ink-500">Tu semana</p>
          <div className="flex gap-1.5">
            {week.map(day => {
              const routine = day.routineId ? byId.get(day.routineId) : null
              const isToday = day.weekday === today
              return (
                <button
                  key={day.id}
                  onClick={() => navigate('/rutinas')}
                  className={[
                    'flex-1 rounded-xl border px-1 py-2.5 text-center transition-colors',
                    isToday ? 'border-accent/50 bg-accent/10' : 'border-ink-800 hover:bg-ink-850',
                    routine ? '' : 'opacity-45'
                  ].join(' ')}
                >
                  <div className={isToday ? 'text-xs font-semibold text-accent' : 'text-xs text-ink-500'}>
                    {WEEKDAYS_SHORT[day.weekday]}
                  </div>
                  <div className="mt-1 truncate text-[10px] leading-tight text-ink-300">
                    {routine ? routine.name.slice(0, 8) : '—'}
                  </div>
                </button>
              )
            })}
          </div>
        </Card>

        <div>
          <p className="mb-2 px-1 text-sm text-ink-500">Ultimos entrenos</p>
          {(recent ?? []).length === 0 ? (
            <Empty title="Aun no hay entrenos" hint="Cuando termines el primero aparecera aqui con su volumen total." />
          ) : (
            <div className="space-y-2">
              {(recent ?? []).map(({ workout, sets }) => (
                <Card key={workout.id} className="flex items-center justify-between p-4">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{workout.routineName}</p>
                    <p className="text-sm text-ink-500">
                      {formatDateEs(workout.dateKey)} · {sets.filter(s => s.done).length} series
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono text-sm">{Math.round(totalVolume(sets)).toLocaleString('es-ES')} kg</p>
                    <p className="text-xs text-ink-500">
                      {workout.finishedAt ? formatDuration(workout.finishedAt - workout.startedAt) : ''}
                    </p>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
