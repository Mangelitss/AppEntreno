import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, getSettings } from '../db/db'
import { now, softDelete } from '../db/repo'
import {
  addExerciseToWorkout, addSet, commitWorkout, discardWorkout, evaluateWorkout,
  lastSessionFor, type ProgressProposal
} from '../db/actions'
import { formatDateEs, formatDuration, formatKg, totalVolume } from '../lib/stats'
import { formatCardioDuration } from '../lib/cardio'
import CardioEntry from '../components/CardioEntry'
import ExerciseThumb from '../components/ExerciseThumb'
import ExercisePicker from '../components/ExercisePicker'
import RestTimer from '../components/RestTimer'
import { Button, Card, Pill, Sheet, cx } from '../components/ui'
import type { SetType, WorkoutSet } from '../db/types'

const SET_TYPES: SetType[] = ['normal', 'warmup', 'failure', 'drop']
const SET_LABEL: Record<SetType, string> = { normal: '', warmup: 'C', failure: 'F', drop: 'D' }
const SET_NAME: Record<SetType, string> = {
  normal: 'Serie normal', warmup: 'Calentamiento', failure: 'Al fallo', drop: 'Dropset'
}

interface Rest { endsAt: number; total: number }

/** Campo numerico grande, pensado para tocarlo con el pulgar y poco mas. */
function NumField({
  value, onCommit, placeholder, wide
}: { value: number | null; onCommit: (n: number | null) => void; placeholder?: string; wide?: boolean }) {
  const [draft, setDraft] = useState(value === null ? '' : String(value))
  useEffect(() => { setDraft(value === null ? '' : String(value)) }, [value])

  return (
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
      className={cx(
        'h-12 rounded-xl border border-ink-700 bg-ink-850 text-center text-lg font-medium tabular-nums',
        'outline-none focus:border-accent/60 focus:ring-2 focus:ring-accent/20',
        wide ? 'w-[4.5rem]' : 'w-16'
      )}
    />
  )
}

/** Ajuste del incremento propuesto, al cerrar el entreno. */
function IncrementEditor({
  value, onChange
}: { value: number; onChange: (n: number) => void }) {
  const step = 0.5
  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => onChange(Math.max(0, Number((value - step).toFixed(2))))}
        className="h-9 w-9 rounded-lg bg-ink-800 text-lg leading-none text-ink-300 hover:bg-ink-700"
        aria-label="Bajar incremento"
      >
        −
      </button>
      <div className="relative">
        <input
          type="number" inputMode="decimal" step={step} min={0}
          value={value}
          onFocus={e => e.currentTarget.select()}
          onChange={e => onChange(Math.max(0, Number(e.target.value) || 0))}
          className="h-9 w-20 rounded-lg border border-ink-700 bg-ink-850 pr-7 text-center tabular-nums outline-none focus:border-accent/60"
        />
        <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-ink-500">kg</span>
      </div>
      <button
        onClick={() => onChange(Number((value + step).toFixed(2)))}
        className="h-9 w-9 rounded-lg bg-ink-800 text-lg leading-none text-ink-300 hover:bg-ink-700"
        aria-label="Subir incremento"
      >
        +
      </button>
    </div>
  )
}

export default function Train() {
  const { workoutId = '' } = useParams()
  const navigate = useNavigate()

  const [index, setIndex] = useState(0)
  const [rest, setRest] = useState<Rest | null>(null)
  const [picking, setPicking] = useState(false)
  const [notesOpen, setNotesOpen] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [proposals, setProposals] = useState<ProgressProposal[] | null>(null)
  const [overrides, setOverrides] = useState<Record<string, number>>({})
  const [saving, setSaving] = useState(false)

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

  const list = links ?? []
  const current = list[Math.min(index, Math.max(0, list.length - 1))]
  const isLast = list.length > 0 && index >= list.length - 1

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

  const isCardio = exercise?.tracking === 'cardio'

  // Un entreno de hoy se cronometra; uno registrado a posteriori ya trae su duracion.
  const backdated = workout?.plannedDurationMs ?? null

  useEffect(() => {
    if (!workout) return
    if (backdated) { setElapsed(backdated); return }
    const tick = () => setElapsed(Date.now() - workout.startedAt)
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [workout?.startedAt, backdated])

  async function patchSet(set: WorkoutSet, changes: Partial<WorkoutSet>) {
    await db.sets.update(set.id, { ...changes, updatedAt: now() })
  }

  async function toggleDone(set: WorkoutSet) {
    const done = set.done === 1 ? 0 : 1
    await patchSet(set, { done, completedAt: done ? now() : null })
    if (done === 1 && set.type !== 'warmup' && !isCardio) {
      const settings = await getSettings()
      const seconds = current?.restSeconds ?? settings.defaultRestSeconds
      if (seconds > 0) setRest({ endsAt: Date.now() + seconds * 1000, total: seconds })
      if ('vibrate' in navigator) navigator.vibrate(15)
    }
  }

  async function openFinish() {
    const doneCount = (allSets ?? []).filter(s => s.done === 1).length
    if (doneCount === 0) {
      if (!confirm('No has completado ninguna serie. Descartar el entreno?')) return
      await discardWorkout(workoutId)
      navigate('/')
      return
    }
    const result = await evaluateWorkout(workoutId)
    setOverrides(Object.fromEntries(
      result.filter(p => p.increment > 0).map(p => [p.exerciseId, p.increment])
    ))
    setProposals(result)
  }

  async function confirmFinish() {
    setSaving(true)
    await commitWorkout(workoutId, overrides)
    navigate('/')
  }

  if (!workout) return <div className="p-8 text-ink-500">Entreno no encontrado</div>

  const totalSets = (allSets ?? []).length
  const doneSets = (allSets ?? []).filter(s => s.done === 1).length
  const rising = (proposals ?? []).filter(p => p.increment > 0 || p.repIncrement > 0)
  const others = (proposals ?? []).filter(p => p.increment === 0 && p.repIncrement === 0 && p.message)

  return (
    <div className="flex min-h-full flex-col">
      <header className="safe-top sticky top-0 z-30 border-b border-ink-800 bg-ink-950/95 backdrop-blur">
        <div className="mx-auto max-w-2xl px-4 py-2">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/')} className="text-ink-500 hover:text-ink-100" aria-label="Salir">←</button>
            <p className="min-w-0 flex-1 truncate text-sm text-ink-300">{workout.routineName}</p>
            <Button variant="primary" size="sm" onClick={() => void openFinish()}>Terminar</Button>
          </div>
          <div className="mt-1 flex items-baseline gap-3">
            <span className="font-mono text-4xl font-semibold tabular-nums leading-none">
              {formatDuration(elapsed)}
            </span>
            <span className="text-sm text-ink-500">{doneSets}/{totalSets} series</span>
            {backdated && (
              <Pill tone="warn">{formatDateEs(workout.dateKey)}</Pill>
            )}
          </div>
        </div>
        <div className="mt-2 h-0.5 w-full bg-ink-800">
          <div
            className="h-full bg-accent transition-[width]"
            style={{ width: `${totalSets ? (doneSets / totalSets) * 100 : 0}%` }}
          />
        </div>
      </header>

      <div className="mx-auto w-full max-w-2xl flex-1 px-4 pb-16">
        {list.length > 1 && (
          <div className="flex gap-1.5 overflow-x-auto py-3">
            {list.map((link, i) => {
              const linkSets = (allSets ?? []).filter(s => s.workoutExerciseId === link.id)
              const complete = linkSets.length > 0 && linkSets.every(s => s.done === 1)
              return (
                <button
                  key={link.id}
                  onClick={() => setIndex(i)}
                  className={cx(
                    'shrink-0 rounded-full px-3 py-1.5 text-xs capitalize transition-colors',
                    i === index ? 'bg-accent font-medium text-ink-950'
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
            {/* Hueco central: la animacion del ejercicio, o el descanso mientras corre. */}
            <div className="flex flex-col items-center py-4">
              {rest ? (
                <RestTimer
                  endsAt={rest.endsAt}
                  totalSeconds={rest.total}
                  onDismiss={() => setRest(null)}
                  onExtend={seconds => setRest(r => r && {
                    endsAt: Math.max(Date.now(), r.endsAt + seconds * 1000),
                    total: Math.max(1, r.total + seconds)
                  })}
                />
              ) : (
                <ExerciseThumb exercise={exercise} size="xl" shape="rounded-3xl" gif />
              )}

              <h1 className="mt-4 text-center text-xl font-semibold capitalize">{current.exerciseName}</h1>
              {(exercise?.props ?? []).filter(p => p.name || p.value).length > 0 && (
                <div className="mt-2 flex flex-wrap justify-center gap-1.5">
                  {(exercise?.props ?? [])
                    .filter(p => p.name || p.value)
                    .map(prop => (
                      <span key={prop.id} className="rounded-full bg-ink-800 px-2.5 py-1 text-[11px] text-ink-300">
                        {prop.name && <span className="text-ink-500">{prop.name} </span>}
                        {prop.value}
                      </span>
                    ))}
                </div>
              )}

              <p className="mt-0.5 text-center text-xs text-ink-500">
                {isCardio
                  ? `Objetivo ${formatCardioDuration((current.targetDurationMin ?? 30) * 60)}`
                  : `Objetivo ${current.targetSets} × ${current.targetRepsMin}–${current.targetRepsMax}`}
                {!isCardio && previous && previous.sets.length > 0 &&
                  ` · ultima vez ${formatKg(Math.max(...previous.sets.map(s => s.weight)))} kg`}
              </p>
            </div>

            {isCardio ? (
              <CardioEntry
                exercise={exercise}
                set={sets[0]}
                previous={previous?.sets[0]}
                onPatch={changes => sets[0] && void patchSet(sets[0], changes)}
                onToggleDone={() => sets[0] && void toggleDone(sets[0])}
              />
            ) : (
            <>
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
                        onClick={() => void patchSet(set, {
                          type: SET_TYPES[(SET_TYPES.indexOf(set.type) + 1) % SET_TYPES.length]
                        })}
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

            </>
            )}

            <div className="mt-3 flex flex-wrap gap-2">
              {!isCardio && (
                <>
                  <Button variant="outline" size="sm" onClick={() => void addSet(current.id)}>+ Serie</Button>
                  {sets.length > 1 && (
                    <Button variant="ghost" size="sm" onClick={() => void softDelete('sets', sets[sets.length - 1].id)}>
                      Quitar ultima
                    </Button>
                  )}
                </>
              )}
              <Button variant="ghost" size="sm" onClick={() => setNotesOpen(true)}>
                {current.notes ? 'Nota ✓' : 'Anadir nota'}
              </Button>
              <Button variant="ghost" size="sm" className="ml-auto" onClick={() => setPicking(true)}>
                + Ejercicio
              </Button>
            </div>

            <div className="mt-6 flex gap-2">
              <Button
                variant="subtle" className="flex-1" disabled={index === 0}
                onClick={() => setIndex(i => Math.max(0, i - 1))}
              >
                ← Anterior
              </Button>
              {isLast ? (
                <Button variant="primary" className="flex-1" onClick={() => void openFinish()}>
                  Terminar entreno
                </Button>
              ) : (
                <Button variant="subtle" className="flex-1" onClick={() => setIndex(i => i + 1)}>
                  Siguiente →
                </Button>
              )}
            </div>
          </>
        )}
      </div>

      <ExercisePicker
        open={picking}
        onClose={() => setPicking(false)}
        onPick={async id => {
          await addExerciseToWorkout(workoutId, id)
          setPicking(false)
          setIndex(list.length)
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

      {/* Cerrar el entreno: el resumen y, sobre todo, revisar las subidas antes de guardarlas. */}
      <Sheet open={proposals !== null} onClose={() => setProposals(null)} title="Terminar entreno">
        <div className="space-y-5 p-5">
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <p className="text-2xl font-semibold">{doneSets}</p>
              <p className="text-xs text-ink-500">series</p>
            </div>
            <div>
              <p className="text-2xl font-semibold">{Math.round(totalVolume(allSets ?? [])).toLocaleString('es-ES')}</p>
              <p className="text-xs text-ink-500">kg totales</p>
            </div>
            <div>
              <p className="text-2xl font-semibold">{formatDuration(elapsed)}</p>
              <p className="text-xs text-ink-500">duracion</p>
            </div>
          </div>

          {rising.length > 0 && (
            <div className="space-y-2">
              <div>
                <p className="text-sm font-medium text-emerald-300">Suben de peso</p>
                <p className="text-xs text-ink-500">
                  Ajusta el incremento si te parece mucho. Lo que dejes se guarda como el
                  incremento de ese ejercicio; con 0 no sube y te lo vuelve a proponer la proxima vez.
                </p>
              </div>

              {rising.map(proposal => {
                const chosen = overrides[proposal.exerciseId] ?? proposal.increment
                return (
                  <Card key={proposal.exerciseId} className="space-y-3 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <p className="min-w-0 flex-1 truncate text-sm capitalize">{proposal.exerciseName}</p>
                      <Pill tone="good">↑</Pill>
                    </div>

                    {proposal.repIncrement > 0 ? (
                      <p className="text-sm text-ink-300">
                        Peso corporal: sube <span className="font-medium">1 repeticion</span> la proxima vez
                      </p>
                    ) : (
                      <>
                        <p className="font-mono text-sm">
                          <span className="text-ink-500">{formatKg(proposal.topWeight)} kg</span>
                          <span className="mx-2 text-ink-700">→</span>
                          <span className={chosen > 0 ? 'text-emerald-300' : 'text-ink-500'}>
                            {formatKg(proposal.topWeight + chosen)} kg
                          </span>
                        </p>
                        <div className="flex items-center justify-between gap-3">
                          <IncrementEditor
                            value={chosen}
                            onChange={n => setOverrides(o => ({ ...o, [proposal.exerciseId]: n }))}
                          />
                          {chosen === 0 && <span className="text-xs text-amber-300">No sube</span>}
                        </div>
                      </>
                    )}
                  </Card>
                )
              })}
            </div>
          )}

          {others.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-sm text-ink-500">Sin cambios</p>
              {others.map(proposal => (
                <div key={proposal.exerciseId} className="rounded-xl bg-ink-850 px-3 py-2">
                  <p className="truncate text-sm capitalize">{proposal.exerciseName}</p>
                  <p className="text-xs text-ink-500">{proposal.message}</p>
                </div>
              ))}
            </div>
          )}

          {rising.length === 0 && others.length === 0 && (
            <p className="text-center text-sm text-ink-500">
              Nada que ajustar: ningun ejercicio cambia de carga esta vez.
            </p>
          )}

          <div className="flex gap-2">
            <Button variant="ghost" className="flex-1" onClick={() => setProposals(null)}>
              Seguir entrenando
            </Button>
            <Button variant="primary" className="flex-1" disabled={saving} onClick={() => void confirmFinish()}>
              {saving ? 'Guardando…' : 'Guardar y terminar'}
            </Button>
          </div>
        </div>
      </Sheet>
    </div>
  )
}
