import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { now, softDelete } from '../db/repo'
import { addExerciseToRoutine, startWorkout } from '../db/actions'
import { defaultIncrement, incrementFor } from '../lib/progression'
import { mediaUrl } from '../db/catalog'
import ExercisePicker from '../components/ExercisePicker'
import { Button, Card, Empty, Input, Label } from '../components/ui'
import { PageHeader } from '../components/Layout'
import type { RoutineItem } from '../db/types'

export default function RoutineEditor() {
  const { routineId = '' } = useParams()
  const navigate = useNavigate()
  const [picking, setPicking] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)

  const routine = useLiveQuery(() => db.routines.get(routineId), [routineId])
  const items = useLiveQuery(
    async () => (await db.routineItems.where('routineId').equals(routineId).toArray())
      .filter(i => !i.deletedAt).sort((a, b) => a.order - b.order),
    [routineId], []
  )
  const exercises = useLiveQuery(
    async () => {
      const list = await db.exercises.bulkGet((items ?? []).map(i => i.exerciseId))
      return new Map(list.filter(Boolean).map(e => [e!.id, e!]))
    },
    [items], new Map()
  )

  async function patch(item: RoutineItem, changes: Partial<RoutineItem>) {
    await db.routineItems.update(item.id, { ...changes, updatedAt: now() })
  }

  async function move(index: number, direction: -1 | 1) {
    const list = items ?? []
    const target = index + direction
    if (target < 0 || target >= list.length) return
    await db.routineItems.update(list[index].id, { order: target, updatedAt: now() })
    await db.routineItems.update(list[target].id, { order: index, updatedAt: now() })
  }

  if (!routine) return <div className="p-8 text-ink-500">Rutina no encontrada</div>

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={routine.name}
        subtitle={`${(items ?? []).length} ejercicios`}
        action={
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => navigate('/rutinas')}>Volver</Button>
            <Button variant="primary" onClick={async () => navigate(`/entreno/${await startWorkout(routine.id)}`)}>
              Entrenar
            </Button>
          </div>
        }
      />

      <div className="space-y-3 px-4 pb-8 md:px-8">
        <Input
          defaultValue={routine.name}
          onBlur={e => void db.routines.update(routine.id, { name: e.target.value.trim() || routine.name, updatedAt: now() })}
          className="w-full"
          placeholder="Nombre de la rutina"
        />

        {(items ?? []).length === 0 && (
          <Empty
            title="Rutina vacia"
            hint="Busca en el catalogo de 1.324 ejercicios o crea uno propio."
            action={<Button variant="primary" onClick={() => setPicking(true)}>Anadir ejercicio</Button>}
          />
        )}

        {(items ?? []).map((item, index) => {
          const exercise = exercises?.get(item.exerciseId)
          const isOpen = expanded === item.id
          return (
            <Card key={item.id} className="overflow-hidden">
              <div className="flex items-center gap-3 p-3">
                <img
                  src={mediaUrl(exercise?.image ?? null) ?? ''}
                  alt="" loading="lazy"
                  onError={e => { (e.currentTarget as HTMLImageElement).style.visibility = 'hidden' }}
                  className="h-12 w-12 shrink-0 rounded-lg bg-ink-800 object-cover"
                />
                <button className="min-w-0 flex-1 text-left" onClick={() => setExpanded(isOpen ? null : item.id)}>
                  <p className="truncate text-sm capitalize">{exercise?.name ?? 'Ejercicio'}</p>
                  <p className="text-xs text-ink-500">
                    {item.targetSets} × {item.targetRepsMin}–{item.targetRepsMax} · {item.restSeconds}s descanso
                  </p>
                </button>
                <div className="flex flex-col">
                  <button className="px-2 text-ink-500 hover:text-ink-100" onClick={() => void move(index, -1)} aria-label="Subir">▲</button>
                  <button className="px-2 text-ink-500 hover:text-ink-100" onClick={() => void move(index, 1)} aria-label="Bajar">▼</button>
                </div>
              </div>

              {isOpen && (
                <div className="space-y-4 border-t border-ink-850 bg-ink-950/40 p-4">
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <label className="space-y-1">
                      <Label>Series</Label>
                      <Input
                        type="number" inputMode="numeric" min={1} defaultValue={item.targetSets} className="w-full"
                        onBlur={e => void patch(item, { targetSets: Math.max(1, Number(e.target.value) || 1) })}
                      />
                    </label>
                    <label className="space-y-1">
                      <Label>Reps min</Label>
                      <Input
                        type="number" inputMode="numeric" min={1} defaultValue={item.targetRepsMin} className="w-full"
                        onBlur={e => void patch(item, { targetRepsMin: Math.max(1, Number(e.target.value) || 1) })}
                      />
                    </label>
                    <label className="space-y-1">
                      <Label>Reps max</Label>
                      <Input
                        type="number" inputMode="numeric" min={1} defaultValue={item.targetRepsMax} className="w-full"
                        onBlur={e => void patch(item, { targetRepsMax: Math.max(1, Number(e.target.value) || 1) })}
                      />
                    </label>
                    <label className="space-y-1">
                      <Label>Descanso (s)</Label>
                      <Input
                        type="number" inputMode="numeric" min={0} step={15} defaultValue={item.restSeconds} className="w-full"
                        onBlur={e => void patch(item, { restSeconds: Math.max(0, Number(e.target.value) || 0) })}
                      />
                    </label>
                  </div>

                  {exercise && (
                    <label className="block space-y-1">
                      <Label>Incremento al progresar (kg)</Label>
                      <div className="flex items-center gap-2">
                        <Input
                          type="number" inputMode="decimal" step={0.5} min={0}
                          defaultValue={incrementFor(exercise)}
                          className="w-28"
                          onBlur={e => {
                            const value = Number(e.target.value)
                            void db.exercises.update(exercise.id, {
                              incrementKg: Number.isFinite(value) ? value : null,
                              updatedAt: now()
                            })
                          }}
                        />
                        <span className="text-xs text-ink-500">
                          Por defecto {defaultIncrement(exercise)} kg segun el material ({exercise.equipment || 'sin definir'})
                          {defaultIncrement(exercise) === 0 && ' — aqui se progresa sumando repeticiones'}
                        </span>
                      </div>
                    </label>
                  )}

                  <label className="block space-y-1">
                    <Label>Nota</Label>
                    <Input
                      defaultValue={item.notes} className="w-full" placeholder="Agarre, tempo, ajuste de maquina..."
                      onBlur={e => void patch(item, { notes: e.target.value })}
                    />
                  </label>

                  <Button
                    variant="danger" size="sm"
                    onClick={() => void softDelete('routineItems', item.id)}
                  >
                    Quitar de la rutina
                  </Button>
                </div>
              )}
            </Card>
          )
        })}

        {(items ?? []).length > 0 && (
          <Button variant="outline" className="w-full" onClick={() => setPicking(true)}>
            Anadir ejercicio
          </Button>
        )}
      </div>

      <ExercisePicker
        open={picking}
        onClose={() => setPicking(false)}
        onPick={async id => { await addExerciseToRoutine(routineId, id); setPicking(false) }}
      />
    </div>
  )
}
