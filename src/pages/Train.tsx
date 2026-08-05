import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, getSettings } from '../db/db'
import { now, softDelete } from '../db/repo'
import {
  addExerciseToWorkout, addSet, discardWorkout, finishWorkout, lastSessionFor, type FinishReport
} from '../db/actions'
import { mediaUrl } from '../db/catalog'
import { formatDuration, formatKg, totalVolume } from '../lib/stats'
import ExercisePicker from '../components/ExercisePicker'
import RestTimer from '../components/RestTimer'
import { Button, Card, Pill, Sheet, cx } from '../components/ui'
import type { SetType, WorkoutSet } from '../db/types'

const SET_TYPES: SetType[] = ['normal', 'warmup', 'failure', 'drop']
const SET_LABEL: Record<SetType, string> = { normal: '', warmup: 'C', failure: 'F', drop: 'D' }
const SET_NAME: Record<SetType, string> = {
  normal: 'Serie normal', warmup: 'Calentamiento', failure: 'Al fallo', drop: 'Dropset'
}

/** Campo numerico grande, pensado para tocarlo con el pulgar y poco mas. */
function NumField({
  value, onCommit, suffix, placeholder, wide
}: { value: number | null; onCommit: (n: number | null) => void; suffix?: string; placeholder?: string; wide?: boolean }) {
  const [draft, setDraft] = useState(value === null ? '' : String(value))
  useEffect(() => { setDraft(value === null ? '' : String(value)) }, [value])

  return (
    <div className={cx('relative', wide ? 'w-[4.5rem]' : 'w-16')}>
      <input
        type="number" inputMode="decimal" step="any"
        value={draft}
        placeholder={placeholder}
        onFocus={e => e.currentTarget.select()}
        onChange={e => setDraft(e.target.value)}
        onBlur={() => {
          const trimmed = draft.trim()
          if (trimmed === '') { onCommit(null); return }
          const parsed = Number(trimmed)
          onCommit(Number.isFinite(parsed) ? parsed : null)
        }}
        className="h-12 w-full rounded-xl border border-ink-700 bg-ink-850 text-center text-lg font-medium tabular-nums outline-none focus:border-accent/60 focus:ring-2 focus:ring-accent/20"
      />
      {suffix && <span className="pointer-events-none absolute right-1.5 top-1 text-[10px] text-ink-500">{suffix}</span>}
    </div>
  )
}

export default function Train() {
  const { workoutId = '' } = useParams()
  const navigate = useNavigate()

  const [index, setIndex] = useState(0)
  const [restEndsAt, setRestEndsAt] = useState<number | null>(null)
  const [picking, setPicking] = useState(false)
  const [report, setReport] = useState<FinishReport[] | null>(null)
  const [notesOpen, setNotesOpen] = useState(false)
  const [elapsed, setElapsed] = useState(0)

  const workout = useLiveQuery(() => db.workouts.get(workoutId), [workoutId])
  const links = useLiveQuery(
    async () => (await db.workoutExercises.where('workoutId').equals(workoutId).toArray())
      .filter(l => !l.deletedAt).sort((a, b) => a.order - b.order),
    [workoutId], []
  )
  const allSets = useLiveQuery(
    async () => (await db.sets.where('workoutId').equals(workoutId).toArray()).filter(s => !s.deletedAt),
    [workoutId], []
  )

  const current = (links ?? [])[Math.min(index, Math.max(0, (links ?? []).length - 1))]
  const exercise = useLiveQuery(
    () => current ? db.exercises.get(current.exerciseId) : undefined, [current?.exerciseId]
  )
  const previous = useLiveQuery(
    () => current ? lastSessionFor(current.exerciseId, workoutId) : null, [current?.exerciseId, workoutId], null
  )

  const sets = useMemo(
    () => (allSets ?? []).filter(s => s.workoutExerciseId === current?.id).sort((a, b) => a.order - b.order),
    [allSets, current?.id]
  )

  useEffect(() => {
    if (!workout) return
    const id = setInterval(() => setElapsed(Date.now() - workout.startedAt), 1000)
    setElapsed(Date.now() - workout.startedAt)
    return () => clearInterval(id)
  }, [workout?.startedAt])

  async function patchSet(set: WorkoutSet, changes: Partial<WorkoutSet>) {
    await db.sets.update(set.id, { ...changes, updatedAt: now() })
  }

  async function toggleDone(set: WorkoutSet) {
    const done = set.done === 1 ? 0 : 1
    await patchSet(set, { done, completedAt: done ? now() : null })
    if (done === 1 && set.type !== 'warmup') {
      const settings = await getSettings()
      const rest = current?.restSeconds ?? settings.defaultRestSeconds
      if (rest > 0) setRestEndsAt(Date.now() + rest * 1000)
      if ('vibrate' in navigator) navigator.vibrate(15)
    }
  }

  function cycleType(set: WorkoutSet) {
    const next = SET_TYPES[(SET_TYPES.indexOf(set.type) + 1) % SET_TYPES.length]
    void patchSet(set, { type: next })
  }

  async function handleFinish() {
    const doneCount = (allSets ?? []).filter(s => s.done === 1).length
    if (doneCount === 0) {
      if (!confirm('No has completado ninguna serie. Descartar el entreno?')) return
      await discardWorkout(workoutId)
      navigate('/')
      return
    }
    setReport(await finishWorkout(workoutId))
  }

  if (!workout) return <div className="p-8 text-ink-500">Entreno no encontrado</div>

  const totalSets = (allSets ?? []).length
  const doneSets = (allSets ?? []).filter(s => s.done === 1).length

  return (
    <div className="flex min-h-full flex-col">
      <header className="safe-top sticky top-0 z-30 border-b border-ink-800 bg-ink-950/95 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-3">
          <button onClick={() => navigate('/')} className="text-ink-500 hover:text-ink-100" aria-label="Salir">←</button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{workout.routineName}</p>
            <p className="font-mono text-xs text-ink-500">
              {formatDuration(elapsed)} · {doneSets}/{totalSets} series
            </p>
          </div>
          <Button variant="primary" size="sm" onClick={() => void handleFinish()}>Terminar</Button>
        </div>
        <div className="h-0.5 w-full bg-ink-800">
          <div className="h-full bg-accent transition-[width]" style={{ width: `${totalSets ? (doneSets / totalSets) * 100 : 0}%` }} />
        </div>
      </header>

      <div className="mx-auto w-full max-w-2xl flex-1 px-4 pb-40">
        {(links ?? []).length > 1 && (
          <div className="flex gap-1.5 overflow-x-auto py-3">
            {(links ?? []).map((link, i) => {
              const linkSets = (allSets ?? []).filter(s => s.workoutExerciseId === link.id)
              const complete = linkSets.length > 0 && linkSets.every(s => s.done === 1)
              return (
                <button
                  key={link.id}
                  onClick={() => setIndex(i)}
                  className={cx(
                    'shrink-0 rounded-full px-3 py-1.5 text-xs capitalize transition-colors',
                    i === index ? 'bg-accent text-ink-950 font-medium'
                      : complete ? 'bg-emerald-500/15 text-emerald-300' : 'bg-ink-800 text-ink-300'
                  )}
                >
                  {complete && '✓ '}{link.exerciseName.slice(0, 18)}
                </button>
              )
            })}
          </div>
        )}

        {!current ? (
          <div className="flex flex-col items-center gap-4 py-20 text-center">
            <p className="text-ink-500">Entreno vacio</p>
            <Button variant="primary" onClick={() => setPicking(true)}>Anadir ejercicio</Button>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3 py-3">
              {exercise?.gif && (
                <img
                  src={mediaUrl(exercise.gif) ?? ''} alt="" loading="lazy"
                  onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
                  className="h-16 w-16 shrink-0 rounded-xl bg-ink-800 object-cover"
                />
              )}
              <div className="min-w-0 flex-1">
                <h1 className="truncate text-lg font-semibold capitalize">{current.exerciseName}</h1>
                <p className="text-xs text-ink-500">
                  Objetivo {current.targetSets} × {current.targetRepsMin}–{current.targetRepsMax}
                  {previous && ` · ultima vez ${formatKg(Math.max(...previous.sets.map(s => s.weight), 0))} kg`}
                </p>
              </div>
            </div>

            <div className="mb-2 flex items-center gap-2 px-1 text-[11px] uppercase tracking-wide text-ink-500">
              <span className="w-8">Serie</span>
              <span className="w-[4.5rem] text-center">Kg</span>
              <span className="w-16 text-center">Reps</span>
              <span className="w-16 text-center">RIR</span>
              <span className="flex-1" />
            </div>

            <div className="space-y-2">
              {sets.map((set, i) => {
                const ref = previous?.sets.filter(s => s.type !== 'warmup')[i]
                return (
                  <Card
                    key={set.id}
                    className={cx('p-2 transition-colors', set.done === 1 && 'border-emerald-500/30 bg-emerald-500/5')}
                  >
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => cycleType(set)}
                        title={SET_NAME[set.type]}
                        className={cx(
                          'h-12 w-8 shrink-0 rounded-lg text-sm font-medium tabular-nums',
                          set.type === 'warmup' ? 'bg-amber-500/15 text-amber-300'
                            : set.type === 'failure' ? 'bg-red-500/15 text-red-300'
                            : set.type === 'drop' ? 'bg-violet-500/15 text-violet-300'
                            : 'bg-ink-800 text-ink-300'
                        )}
                      >
                        {SET_LABEL[set.type] || i + 1}
                      </button>

                      <NumField wide value={set.weight} onCommit={v => void patchSet(set, { weight: v ?? 0 })} />
                      <NumField value={set.reps} onCommit={v => void patchSet(set, { reps: v ?? 0 })} />
                      <NumField value={set.rir} placeholder="–" onCommit={v => void patchSet(set, { rir: v })} />

                      <button
                        onClick={() => void toggleDone(set)}
                        className={cx(
                          'ml-auto h-12 w-12 shrink-0 rounded-xl text-xl transition-colors',
                          set.done === 1 ? 'bg-emerald-500 text-ink-950' : 'bg-ink-800 text-ink-500 hover:bg-ink-700'
                        )}
                        aria-label="Confirmar serie"
                      >
                        ✓
                      </button>
                    </div>
                    {ref && (
                      <p className="px-10 pt-1 text-[11px] text-ink-500">
                        Anterior: {formatKg(ref.weight)} kg × {ref.reps}{ref.rir !== null ? ` · RIR ${ref.rir}` : ''}
                      </p>
                    )}
                  </Card>
                )
              })}
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => void addSet(current.id)}>+ Serie</Button>
              {sets.length > 0 && (
                <Button
                  variant="ghost" size="sm"
                  onClick={() => void softDelete('sets', sets[sets.length - 1].id)}
                >
                  Quitar ultima
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={() => setNotesOpen(true)}>
                {current.notes ? 'Nota ✓' : 'Anadir nota'}
              </Button>
              <Button variant="ghost" size="sm" className="ml-auto" onClick={() => setPicking(true)}>
                + Ejercicio
              </Button>
            </div>

            {(links ?? []).length > 1 && (
              <div className="mt-6 flex gap-2">
                <Button
                  variant="subtle" className="flex-1" disabled={index === 0}
                  onClick={() => setIndex(i => Math.max(0, i - 1))}
                >
                  ← Anterior
                </Button>
                <Button
                  variant="subtle" className="flex-1" disabled={index >= (links ?? []).length - 1}
                  onClick={() => setIndex(i => Math.min((links ?? []).length - 1, i + 1))}
                >
                  Siguiente →
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      <RestTimer
        endsAt={restEndsAt}
        onDismiss={() => setRestEndsAt(null)}
        onExtend={s => setRestEndsAt(prev => (prev ?? Date.now()) + s * 1000)}
      />

      <ExercisePicker
        open={picking}
        onClose={() => setPicking(false)}
        onPick={async id => {
          await addExerciseToWorkout(workoutId, id)
          setPicking(false)
          setIndex((links ?? []).length)
        }}
      />

      <Sheet open={notesOpen} onClose={() => setNotesOpen(false)} title="Nota del ejercicio">
        <div className="p-5">
          <textarea
            autoFocus
            defaultValue={current?.notes ?? ''}
            placeholder="Como te has sentido, molestias, ajustes de la maquina..."
            onBlur={e => current && void db.workoutExercises.update(current.id, { notes: e.target.value, updatedAt: now() })}
            className="h-40 w-full resize-none rounded-xl border border-ink-700 bg-ink-850 p-3 text-sm outline-none focus:border-accent/60"
          />
          <Button variant="primary" className="mt-3 w-full" onClick={() => setNotesOpen(false)}>Guardar</Button>
        </div>
      </Sheet>

      <Sheet open={report !== null} onClose={() => navigate('/')} title="Entreno terminado">
        <div className="space-y-4 p-5">
          <div className="grid grid-cols-3 gap-3 text-center">
            <div><p className="text-2xl font-semibold">{doneSets}</p><p className="text-xs text-ink-500">series</p></div>
            <div><p className="text-2xl font-semibold">{Math.round(totalVolume(allSets ?? [])).toLocaleString('es-ES')}</p><p className="text-xs text-ink-500">kg totales</p></div>
            <div><p className="text-2xl font-semibold">{formatDuration(elapsed)}</p><p className="text-xs text-ink-500">duracion</p></div>
          </div>

          {(report ?? []).length > 0 && (
            <div className="space-y-2">
              <p className="text-sm text-ink-500">Progresion</p>
              {(report ?? []).map((r, i) => (
                <div key={i} className="flex items-start gap-2 rounded-xl bg-ink-850 p-3">
                  <Pill tone={r.ready ? 'good' : 'default'}>{r.ready ? '↑' : '→'}</Pill>
                  <div className="min-w-0">
                    <p className="truncate text-sm capitalize">{r.exerciseName}</p>
                    <p className="text-xs text-ink-500">{r.message}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          <Button variant="primary" className="w-full" onClick={() => navigate('/')}>Hecho</Button>
        </div>
      </Sheet>
    </div>
  )
}
