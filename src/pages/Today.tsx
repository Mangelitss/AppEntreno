import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { WEEKDAYS, WEEKDAYS_SHORT, weekdayIndex } from '../db/repo'
import { activeWorkout, startWorkout } from '../db/actions'
import { estimateMinutes } from '../lib/muscles'
import RoutinePanel, { type PanelItem } from '../components/RoutinePanel'
import CardioLogSheet from '../components/CardioLogSheet'
import StreakCard from '../components/StreakCard'
import { Button, Card, Empty, Input, Label, Pill, Sheet } from '../components/ui'
import { PageHeader } from '../components/Layout'
import { formatDateEs, formatDuration, totalVolume } from '../lib/stats'
import { backfillDates, computeStreak } from '../lib/streak'
import { dateKey } from '../db/repo'

/**
 * Hoy es el unico sitio desde donde arranca un entreno. En Rutinas se montan
 * y se miran; aqui se hacen.
 */
export default function Today() {
  const navigate = useNavigate()
  const today = weekdayIndex()
  const [picking, setPicking] = useState(false)
  const [recovering, setRecovering] = useState(false)
  const [cardioLog, setCardioLog] = useState<{
    routineId: string | null
    routineName?: string
    initial: Array<{ exerciseId: string; minutes: number }>
  } | null>(null)
  const [backfill, setBackfill] = useState({ dateKey: '', routineId: '', minutes: '' })

  const schedule = useLiveQuery(() => db.schedule.toArray(), [], [])
  const routines = useLiveQuery(
    async () => (await db.routines.toArray()).filter(r => !r.deletedAt && !r.archived).sort((a, b) => a.order - b.order),
    [], []
  )
  const items = useLiveQuery(async () => (await db.routineItems.toArray()).filter(i => !i.deletedAt), [], [])
  const exercises = useLiveQuery(
    async () => new Map((await db.exercises.toArray()).map(e => [e.id, e])), [], new Map()
  )
  const open = useLiveQuery(() => activeWorkout(), [], null)
  const trainingDays = useLiveQuery(
    async () => (await db.workouts.toArray())
      .filter(w => !w.deletedAt && w.finishedAt)
      .map(w => w.dateKey),
    [], [] as string[]
  )
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

  const itemsByRoutine = useMemo(() => {
    const map = new Map<string, PanelItem[]>()
    for (const item of (items ?? []).slice().sort((a, b) => a.order - b.order)) {
      const list = map.get(item.routineId) ?? []
      list.push({ item, exercise: exercises?.get(item.exerciseId) })
      map.set(item.routineId, list)
    }
    return map
  }, [items, exercises])

  const weekdaysByRoutine = useMemo(() => {
    const map = new Map<string, number[]>()
    for (const day of schedule ?? []) {
      if (!day.routineId) continue
      map.set(day.routineId, [...(map.get(day.routineId) ?? []), day.weekday])
    }
    return map
  }, [schedule])

  const streak = useMemo(() => computeStreak(trainingDays ?? [], dateKey()), [trainingDays])

  /**
   * Una rutina de solo cardio no se cronometra: se registra despues. Si tiene
   * algo de fuerza, aunque lleve cardio dentro, va por el entreno normal.
   */
  const cardioOnly = useMemo(() => {
    const set = new Set<string>()
    for (const [routineId, list] of itemsByRoutine) {
      if (list.length > 0 && list.every(i => i.exercise?.tracking === 'cardio')) set.add(routineId)
    }
    return set
  }, [itemsByRoutine])

  function openCardioLog(routineId: string | null, routineName?: string) {
    const list = routineId ? itemsByRoutine.get(routineId) ?? [] : []
    setPicking(false)
    setCardioLog({
      routineId,
      routineName,
      initial: list.map(i => ({
        exerciseId: i.item.exerciseId,
        minutes: i.item.targetDurationMin ?? 30
      }))
    })
  }
  const byId = useMemo(() => new Map((routines ?? []).map(r => [r.id, r])), [routines])
  const todayEntry = (schedule ?? []).find(d => d.weekday === today)
  const todayRoutine = todayEntry?.routineId ? byId.get(todayEntry.routineId) : null
  const week = (schedule ?? []).slice().sort((a, b) => a.weekday - b.weekday)

  async function begin(routineId: string | null) {
    if (routineId && cardioOnly.has(routineId)) {
      openCardioLog(routineId, byId.get(routineId)?.name)
      return
    }
    setPicking(false)
    navigate(`/entreno/${await startWorkout(routineId)}`)
  }

  function openRecover() {
    const dates = backfillDates(dateKey())
    const suggested = (routines ?? [])[0]
    const items = suggested ? itemsByRoutine.get(suggested.id) ?? [] : []
    setBackfill({
      dateKey: dates[0],
      routineId: suggested?.id ?? '',
      minutes: String(items.length ? estimateMinutes(items.map(i => i.item)) : 45)
    })
    setRecovering(true)
  }

  async function saveBackfill() {
    const minutes = Math.max(1, Number(backfill.minutes) || 45)
    const workoutId = await startWorkout(backfill.routineId || null, {
      dateKey: backfill.dateKey,
      durationMinutes: minutes
    })
    setRecovering(false)
    navigate(`/entreno/${workoutId}`)
  }

  return (
    <div className="mx-auto max-w-2xl xl:max-w-7xl">
      <PageHeader
        title={WEEKDAYS[today]}
        subtitle={new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })}
      />

      {/*
        En movil es una columna y el orden es el de siempre. En pantalla grande
        se coloca cada bloque en su sitio con la rejilla, en vez de reordenar el
        marcado: asi el movil no se entera del cambio.
      */}
      <div className="grid gap-4 px-4 pb-8 md:px-8 xl:grid-cols-2 xl:items-start xl:gap-6">
        <div className="xl:col-start-1">
          <StreakCard streak={streak} onRecover={openRecover} />
        </div>

        <div className="space-y-3 xl:col-start-2 xl:row-span-3 xl:row-start-1">
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

        {!open && (todayRoutine ? (
          <div className="space-y-3">
            <RoutinePanel
              routine={todayRoutine}
              items={itemsByRoutine.get(todayRoutine.id) ?? []}
              weekdays={weekdaysByRoutine.get(todayRoutine.id) ?? []}
              onOpen={() => navigate(`/rutinas/${todayRoutine.id}`)}
            />
            <Button variant="primary" size="lg" className="w-full" onClick={() => void begin(todayRoutine.id)}>
              {cardioOnly.has(todayRoutine.id) ? 'Registrar cardio' : 'Empezar entreno'}
            </Button>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" className="flex-1" onClick={() => setPicking(true)}>
                Otra rutina
              </Button>
              <Button variant="ghost" size="sm" className="flex-1" onClick={() => openCardioLog(null)}>
                Registrar cardio
              </Button>
              <Button variant="ghost" size="sm" className="flex-1" onClick={() => void begin(null)}>
                Entreno libre
              </Button>
            </div>
          </div>
        ) : (
          <Card className="p-5">
            <p className="text-sm text-ink-500">Hoy no tienes nada asignado</p>
            <h2 className="mt-1 text-xl font-semibold">Dia de descanso</h2>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <Button variant="primary" className="flex-1" onClick={() => setPicking(true)}>
                Entrenar otra rutina
              </Button>
              <Button variant="subtle" className="flex-1" onClick={() => openCardioLog(null)}>
                Registrar cardio
              </Button>
            </div>
          </Card>
        ))}

        </div>

        <Card className="p-4 xl:col-start-1">
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

        <div className="xl:col-start-1">
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


      {/* Entreno olvidado: eliges dia, rutina y cuanto duro, y luego rellenas las series. */}
      <Sheet open={recovering} onClose={() => setRecovering(false)} title="Apuntar un entreno pasado">
        <div className="space-y-5 p-5">
          <p className="text-sm text-ink-500">
            Solo los ultimos 7 dias. Al guardarlo se recalcula la racha, asi que si el hueco
            era ese, vuelve a estar donde la tenias.
          </p>

          <div className="space-y-2">
            <Label>Que dia fue</Label>
            <div className="grid grid-cols-4 gap-2">
              {backfillDates(dateKey()).map(day => {
                const [, , dayNumber] = day.split('-')
                const label = new Date(`${day}T12:00:00`).toLocaleDateString('es-ES', { weekday: 'short' })
                const already = (trainingDays ?? []).includes(day)
                return (
                  <button
                    key={day}
                    onClick={() => setBackfill(f => ({ ...f, dateKey: day }))}
                    className={[
                      'rounded-xl border py-2 text-center transition-colors',
                      backfill.dateKey === day
                        ? 'border-accent bg-accent/10 text-accent'
                        : 'border-ink-800 text-ink-300 hover:bg-ink-850'
                    ].join(' ')}
                  >
                    <span className="block text-[11px] capitalize">{label}</span>
                    <span className="block text-lg font-medium tabular-nums">{Number(dayNumber)}</span>
                    {already && <span className="block text-[9px] text-emerald-400">ya hay</span>}
                  </button>
                )
              })}
            </div>
          </div>

          <label className="block space-y-1">
            <Label>Que rutina hiciste</Label>
            <select
              value={backfill.routineId}
              onChange={e => {
                const routineId = e.target.value
                const items = itemsByRoutine.get(routineId) ?? []
                setBackfill(f => ({
                  ...f,
                  routineId,
                  minutes: items.length ? String(estimateMinutes(items.map(i => i.item))) : f.minutes
                }))
              }}
              className="h-10 w-full rounded-xl border border-ink-700 bg-ink-850 px-3 text-sm"
            >
              <option value="">Entreno libre</option>
              {(routines ?? []).map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </label>

          <label className="block space-y-1">
            <Label>Cuanto duro (minutos)</Label>
            <Input
              type="number" inputMode="numeric" min={1} max={300}
              value={backfill.minutes}
              onChange={e => setBackfill(f => ({ ...f, minutes: e.target.value }))}
              className="w-32"
            />
            <span className="block text-xs text-ink-500">
              Como no se pudo cronometrar, esta es la duracion que quedara en el historial.
            </span>
          </label>

          <Button variant="primary" className="w-full" onClick={() => void saveBackfill()}>
            Continuar y rellenar las series
          </Button>
        </div>
      </Sheet>

      <CardioLogSheet
        open={cardioLog !== null}
        onClose={() => setCardioLog(null)}
        routineId={cardioLog?.routineId ?? null}
        routineName={cardioLog?.routineName}
        initial={cardioLog?.initial ?? []}
      />

      <Sheet open={picking} onClose={() => setPicking(false)} title="Elegir rutina">
        <div className="divide-y divide-ink-850">
          {(routines ?? []).map(routine => {
            const routineItems = itemsByRoutine.get(routine.id) ?? []
            return (
              <button
                key={routine.id}
                onClick={() => void begin(routine.id)}
                className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left hover:bg-ink-850"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{routine.name}</p>
                  <p className="text-sm text-ink-500">
                    {routineItems.length} ejercicios · {estimateMinutes(routineItems.map(i => i.item))} min
                    {cardioOnly.has(routine.id) && ' · cardio'}
                  </p>
                </div>
                <span className="text-accent">{cardioOnly.has(routine.id) ? '✎' : '▶'}</span>
              </button>
            )
          })}
          {(routines ?? []).length === 0 && (
            <p className="px-5 py-10 text-center text-sm text-ink-500">No tienes rutinas todavia.</p>
          )}
        </div>
        <div className="border-t border-ink-800 p-4">
          <Button variant="outline" className="w-full" onClick={() => void begin(null)}>
            Entreno libre, sin rutina
          </Button>
        </div>
      </Sheet>
    </div>
  )
}
