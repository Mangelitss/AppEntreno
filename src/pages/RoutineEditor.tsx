import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { draftItemFor, saveRoutineDraft, type RoutineDraftItem } from '../db/actions'
import { defaultIncrement, incrementFor } from '../lib/progression'
import { displayName, estimateMinutes, muscleDistribution } from '../lib/muscles'
import { dataUrlSizeKb, fileToStoredImage, HERO_SIZE_PX, ImageTooLargeError } from '../lib/image'
import ExerciseThumb from '../components/ExerciseThumb'
import ExercisePicker from '../components/ExercisePicker'
import SaveBar from '../components/SaveBar'
import { PageHeader } from '../components/Layout'
import { Button, Card, Empty, Input, Label, cx } from '../components/ui'
import type { ID } from '../db/types'

/**
 * Editor de rutinas.
 *
 * Todo lo que haces aqui —anadir, quitar, reordenar y los numeros— vive en un
 * borrador local hasta que le das a Guardar. Asi puedes reorganizar una rutina
 * entera sin dejarla a medias si te arrepientes, y el historial no ve estados
 * intermedios.
 */
export default function RoutineEditor() {
  const { routineId = '' } = useParams()
  const navigate = useNavigate()

  const [name, setName] = useState<string | null>(null)
  const [cover, setCover] = useState<string | null | undefined>(undefined)
  const [status, setStatus] = useState('')
  const coverInput = useRef<HTMLInputElement>(null)
  const [items, setItems] = useState<RoutineDraftItem[] | null>(null)
  const [increments, setIncrements] = useState<Record<ID, number | null>>({})
  const [picking, setPicking] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const routine = useLiveQuery(() => db.routines.get(routineId), [routineId])
  const saved = useLiveQuery(
    async () => (await db.routineItems.where('routineId').equals(routineId).toArray())
      .filter(i => !i.deletedAt)
      .sort((a, b) => a.order - b.order)
      .map<RoutineDraftItem>(i => ({
        id: i.id,
        exerciseId: i.exerciseId,
        targetSets: i.targetSets,
        targetRepsMin: i.targetRepsMin,
        targetRepsMax: i.targetRepsMax,
        restSeconds: i.restSeconds,
        targetDurationMin: i.targetDurationMin ?? null,
        notes: i.notes
      })),
    [routineId]
  )

  const exercises = useLiveQuery(
    async () => new Map((await db.exercises.toArray()).map(e => [e.id, e])), [], new Map()
  )

  // Se carga el borrador al abrir; despues manda lo que tengas en pantalla.
  useEffect(() => {
    if (saved && items === null) setItems(saved)
    if (routine && name === null) setName(routine.name)
    if (routine && cover === undefined) setCover(routine.imageData ?? null)
  }, [saved, routine, items, name, cover])
  useEffect(() => {
    setItems(null); setName(null); setCover(undefined); setIncrements({}); setStatus('')
  }, [routineId])

  const dirty = useMemo(() => {
    if (!saved || !items || !routine || name === null) return false
    return JSON.stringify(saved) !== JSON.stringify(items)
      || name.trim() !== routine.name
      || (cover ?? null) !== (routine.imageData ?? null)
      || Object.keys(increments).length > 0
  }, [saved, items, routine, name, cover, increments])

  function patchItem(id: string, changes: Partial<RoutineDraftItem>) {
    setItems(list => list?.map(i => (i.id === id ? { ...i, ...changes } : i)) ?? null)
  }

  function move(index: number, direction: -1 | 1) {
    setItems(list => {
      if (!list) return list
      const target = index + direction
      if (target < 0 || target >= list.length) return list
      const next = [...list]
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
  }

  function remove(id: string, label: string) {
    if (!confirm(`Quitar ${label} de la rutina?`)) return
    if (expanded === id) setExpanded(null)
    setItems(list => list?.filter(i => i.id !== id) ?? null)
  }

  function discard() {
    if (!confirm('Deshacer todos los cambios sin guardar?')) return
    setItems(saved ?? null)
    setName(routine?.name ?? null)
    setCover(routine?.imageData ?? null)
    setIncrements({})
    setStatus('')
  }

  async function pickCover(file: File) {
    try {
      setStatus('Procesando foto…')
      const dataUrl = await fileToStoredImage(file, HERO_SIZE_PX)
      setCover(dataUrl)
      setStatus(`Lista (${dataUrlSizeKb(dataUrl)} KB). Dale a Guardar`)
    } catch (error) {
      setStatus(error instanceof ImageTooLargeError ? error.message : 'No se pudo procesar el fichero')
    }
  }

  async function save() {
    if (!items || name === null) return
    setSaving(true)
    await saveRoutineDraft(routineId, { name, imageData: cover ?? null, items, increments })
    setIncrements({})
    setSaving(false)
  }

  function leave() {
    if (dirty && !confirm('Tienes cambios sin guardar. Descartarlos?')) return
    navigate('/rutinas')
  }

  if (!routine) return <div className="p-8 text-ink-500">Rutina no encontrada</div>
  if (!items || name === null || cover === undefined) return <div className="p-8 text-ink-500">Cargando…</div>

  // Se recalcula con el borrador, asi que cambia mientras anades o quitas.
  const distribution = muscleDistribution(
    items.map(i => ({ targetSets: i.targetSets, exercise: exercises?.get(i.exerciseId) }))
  )

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={name || routine.name}
        subtitle={`${items.length} ejercicios · ${estimateMinutes(items)} min`}
        action={<Button variant="ghost" onClick={leave}>Volver</Button>}
      />

      <div className={cx('space-y-3 px-4 md:px-8', dirty ? 'pb-40' : 'pb-8')}>
        <Card className="overflow-hidden">
          <div className="relative aspect-[16/9] w-full overflow-hidden">
            {cover ? (
              <img src={cover} alt="" className="absolute inset-0 h-full w-full object-cover" />
            ) : (
              <div
                className="absolute inset-0"
                style={{
                  background: `linear-gradient(145deg, ${distribution[0]?.color ?? 'var(--color-accent)'}55 0%, #16161a 55%, #0f0f12 100%)`
                }}
              />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 flex flex-wrap gap-2 p-3">
              <Button variant="subtle" size="sm" onClick={() => coverInput.current?.click()}>
                {cover ? 'Cambiar foto' : 'Subir foto'}
              </Button>
              {cover && (
                <Button variant="ghost" size="sm" onClick={() => setCover(null)}>Quitar</Button>
              )}
            </div>
          </div>

          <input
            ref={coverInput} type="file" accept="image/*" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) void pickCover(f) }}
          />

          <div className="space-y-2 p-4">
            <Input
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full"
              placeholder="Nombre de la rutina"
            />
            <label className="block space-y-1">
              <Label>o pega la URL de una foto</Label>
              <Input
                value={cover?.startsWith('http') ? cover : ''}
                placeholder="https://…"
                className="w-full"
                onChange={e => setCover(e.target.value.trim() || null)}
              />
            </label>
            {status && <p className="text-xs text-accent">{status}</p>}
          </div>
        </Card>

        {distribution.length > 0 && (
          <Card className="p-4">
            <p className="mb-2 text-xs uppercase tracking-wide text-ink-500">Distribucion muscular</p>
            <div className="flex h-2 overflow-hidden rounded-full bg-ink-850">
              {distribution.map(share => (
                <div
                  key={share.muscle}
                  style={{ width: `${share.percent}%`, backgroundColor: share.color }}
                  title={`${share.muscle} ${share.percent}%`}
                />
              ))}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
              {distribution.slice(0, 5).map(share => (
                <span key={share.muscle} className="flex items-center gap-1.5 text-xs">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: share.color }} />
                  <span className="text-ink-300">{share.muscle}</span>
                  <span className="tabular-nums text-ink-500">{share.percent}%</span>
                </span>
              ))}
            </div>
          </Card>
        )}

        {items.length === 0 && (
          <Empty
            title="Rutina vacia"
            hint="Busca en el catalogo de 1.324 ejercicios o crea uno propio."
            action={<Button variant="primary" onClick={() => setPicking(true)}>Anadir ejercicio</Button>}
          />
        )}

        {items.map((item, index) => {
          const exercise = exercises?.get(item.exerciseId)
          const isOpen = expanded === item.id
          const isCardio = exercise?.tracking === 'cardio'

          return (
            <Card key={item.id} className="overflow-hidden">
              <div className="flex items-center gap-2 p-3">
                <ExerciseThumb exercise={exercise} />
                <button className="min-w-0 flex-1 text-left" onClick={() => setExpanded(isOpen ? null : item.id)}>
                  <p className="truncate text-sm capitalize">{displayName(exercise, 'Ejercicio')}</p>
                  <p className="text-xs text-ink-500">
                    {item.targetDurationMin
                      ? `${item.targetDurationMin} min`
                      : `${item.targetSets} × ${item.targetRepsMin}–${item.targetRepsMax} · ${item.restSeconds}s descanso`}
                  </p>
                </button>
                <div className="flex shrink-0 flex-col">
                  <button
                    className="px-2 leading-tight text-ink-500 transition-colors hover:text-ink-100 disabled:opacity-20"
                    disabled={index === 0} onClick={() => move(index, -1)} aria-label="Subir"
                  >
                    ▲
                  </button>
                  <button
                    className="px-2 leading-tight text-ink-500 transition-colors hover:text-ink-100 disabled:opacity-20"
                    disabled={index === items.length - 1} onClick={() => move(index, 1)} aria-label="Bajar"
                  >
                    ▼
                  </button>
                </div>
                <button
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-ink-500 transition-colors hover:bg-red-500/15 hover:text-red-300"
                  aria-label={`Quitar ${displayName(exercise, 'ejercicio')}`}
                  onClick={() => remove(item.id, displayName(exercise, 'este ejercicio'))}
                >
                  ✕
                </button>
              </div>

              {isOpen && (
                <div className="space-y-4 border-t border-ink-850 bg-ink-950/40 p-4">
                  {isCardio ? (
                    <label className="block space-y-1">
                      <Label>Duracion objetivo (min)</Label>
                      <Input
                        type="number" inputMode="numeric" min={1} step={5}
                        value={item.targetDurationMin ?? 30} className="w-28"
                        onChange={e => patchItem(item.id, {
                          targetDurationMin: Math.max(1, Number(e.target.value) || 30)
                        })}
                      />
                      <span className="block text-xs text-ink-500">
                        Es solo una referencia para estimar lo que dura la rutina. Al entrenar
                        apuntas el tiempo real, las kcal y lo que aplique a esta actividad.
                      </span>
                    </label>
                  ) : (
                    <>
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                        <label className="space-y-1">
                          <Label>Series</Label>
                          <Input
                            type="number" inputMode="numeric" min={1} value={item.targetSets} className="w-full"
                            onChange={e => patchItem(item.id, { targetSets: Math.max(1, Number(e.target.value) || 1) })}
                          />
                        </label>
                        <label className="space-y-1">
                          <Label>Reps min</Label>
                          <Input
                            type="number" inputMode="numeric" min={1} value={item.targetRepsMin} className="w-full"
                            onChange={e => patchItem(item.id, { targetRepsMin: Math.max(1, Number(e.target.value) || 1) })}
                          />
                        </label>
                        <label className="space-y-1">
                          <Label>Reps max</Label>
                          <Input
                            type="number" inputMode="numeric" min={1} value={item.targetRepsMax} className="w-full"
                            onChange={e => patchItem(item.id, { targetRepsMax: Math.max(1, Number(e.target.value) || 1) })}
                          />
                        </label>
                        <label className="space-y-1">
                          <Label>Descanso (s)</Label>
                          <Input
                            type="number" inputMode="numeric" min={0} step={15} value={item.restSeconds} className="w-full"
                            onChange={e => patchItem(item.id, { restSeconds: Math.max(0, Number(e.target.value) || 0) })}
                          />
                        </label>
                      </div>

                      {exercise && (
                        <label className="block space-y-1">
                          <Label>Incremento al progresar (kg)</Label>
                          <div className="flex items-center gap-2">
                            <Input
                              type="number" inputMode="decimal" step={0.5} min={0}
                              value={increments[exercise.id] ?? incrementFor(exercise)}
                              className="w-28"
                              onChange={e => {
                                const value = Number(e.target.value)
                                setIncrements(prev => ({
                                  ...prev,
                                  [exercise.id]: Number.isFinite(value) ? value : null
                                }))
                              }}
                            />
                            <span className="text-xs text-ink-500">
                              Por defecto {defaultIncrement(exercise)} kg segun el material
                              ({exercise.equipment || 'sin definir'})
                              {defaultIncrement(exercise) === 0 && ' — aqui se progresa sumando repeticiones'}
                            </span>
                          </div>
                        </label>
                      )}
                    </>
                  )}

                  <label className="block space-y-1">
                    <Label>Nota</Label>
                    <Input
                      value={item.notes} className="w-full" placeholder="Agarre, tempo, ajuste de maquina..."
                      onChange={e => patchItem(item.id, { notes: e.target.value })}
                    />
                  </label>
                </div>
              )}
            </Card>
          )
        })}

        {items.length > 0 && (
          <Button variant="outline" className="w-full" onClick={() => setPicking(true)}>
            Anadir ejercicio
          </Button>
        )}
      </div>

      <ExercisePicker
        open={picking}
        onClose={() => setPicking(false)}
        onPick={async id => {
          const item = await draftItemFor(id)
          if (item) setItems(list => [...(list ?? []), item])
          setPicking(false)
        }}
      />

      <SaveBar
        dirty={dirty}
        saving={saving}
        onSave={() => void save()}
        secondary={<Button variant="ghost" onClick={discard}>Deshacer</Button>}
      />
    </div>
  )
}
