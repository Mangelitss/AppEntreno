import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { datasetOriginal } from '../db/catalog'
import { now, uid } from '../db/repo'
import { displayName, muscleEs } from '../lib/muscles'
import { CATEGORIES, EQUIPMENT, MUSCLES, categoryEs, equipmentEs, mergeOptions } from '../lib/taxonomy'
import { CARDIO_KIND_LABEL, type CardioKind, type PaceStyle } from '../lib/cardio'
import { defaultIncrement, incrementFor } from '../lib/progression'
import { normalize } from '../lib/stats'
import { dataUrlSizeKb, fileToStoredImage, ImageTooLargeError } from '../lib/image'
import { Combobox, TagCombobox } from '../components/Combobox'
import ExerciseThumb from '../components/ExerciseThumb'
import SaveBar from '../components/SaveBar'
import { PageHeader } from '../components/Layout'
import { Button, Card, Input, Label, Pill, cx } from '../components/ui'
import type { Exercise, ExerciseProp } from '../db/types'

/** Campos del dataset: si difieren del original, cuentan como editados por ti. */
const DATASET_FIELDS = [
  'name', 'category', 'equipment', 'target', 'secondaryMuscles', 'instructions', 'image', 'gif'
] as const

/** Lo que se edita en esta pantalla. El resto del ejercicio no se toca. */
type Draft = Pick<
  Exercise,
  'name' | 'alias' | 'category' | 'equipment' | 'target' | 'secondaryMuscles'
  | 'incrementKg' | 'favorite' | 'archived' | 'cardioKind' | 'paceStyle'
> & {
  props: ExerciseProp[]
  imageData: string | null
  gifData: string | null
}

const toDraft = (exercise: Exercise): Draft => ({
  name: exercise.name,
  alias: exercise.alias ?? null,
  category: exercise.category,
  equipment: exercise.equipment,
  target: exercise.target,
  secondaryMuscles: [...exercise.secondaryMuscles],
  incrementKg: exercise.incrementKg,
  favorite: exercise.favorite,
  archived: exercise.archived ?? 0,
  cardioKind: exercise.cardioKind ?? null,
  paceStyle: exercise.paceStyle ?? null,
  props: (exercise.props ?? []).map(p => ({ ...p })),
  imageData: exercise.imageData ?? null,
  gifData: exercise.gifData ?? null
})

export default function ExerciseDetail() {
  const { exerciseId = '' } = useParams()
  const navigate = useNavigate()

  const [draft, setDraft] = useState<Draft | null>(null)
  const [status, setStatus] = useState('')
  const [saving, setSaving] = useState(false)
  const imageInput = useRef<HTMLInputElement>(null)
  const gifInput = useRef<HTMLInputElement>(null)

  const exercise = useLiveQuery(() => db.exercises.get(exerciseId), [exerciseId])

  // El borrador se rellena al abrir y ya no se pisa: a partir de ahi mandas tu.
  useEffect(() => {
    if (exercise && !draft) setDraft(toDraft(exercise))
  }, [exercise, draft])
  useEffect(() => { setDraft(null); setStatus('') }, [exerciseId])

  const options = useLiveQuery(async () => {
    const all = await db.exercises.toArray()
    return {
      categories: mergeOptions(CATEGORIES, all.map(e => e.category)),
      equipment: mergeOptions(EQUIPMENT, all.map(e => e.equipment)),
      muscles: mergeOptions(MUSCLES, all.flatMap(e => [e.target, ...(e.secondaryMuscles ?? [])]))
    }
  }, [], { categories: CATEGORIES, equipment: EQUIPMENT, muscles: MUSCLES })

  const usage = useLiveQuery(async () => {
    const routineItems = (await db.routineItems.where('exerciseId').equals(exerciseId).toArray())
      .filter(i => !i.deletedAt)
    const routines = await db.routines.bulkGet([...new Set(routineItems.map(i => i.routineId))])
    const sessions = (await db.workoutExercises.where('exerciseId').equals(exerciseId).toArray())
      .filter(l => !l.deletedAt).length
    return { routines: routines.filter(r => r && !r.deletedAt).map(r => r!.name), sessions }
  }, [exerciseId], { routines: [] as string[], sessions: 0 })

  const dirty = useMemo(
    () => Boolean(exercise && draft) && JSON.stringify(toDraft(exercise!)) !== JSON.stringify(draft),
    [exercise, draft]
  )

  const patch = (changes: Partial<Draft>) => setDraft(d => (d ? { ...d, ...changes } : d))

  async function save() {
    if (!exercise || !draft) return
    setSaving(true)

    // Editado = distinto de como venia en el dataset, no "campo que has tocado".
    const original = exercise.isCustom === 1 ? null : await datasetOriginal(exercise.id)
    const edited = original
      ? DATASET_FIELDS.filter(field => {
          const mine = draft[field as keyof Draft]
          if (mine === undefined) return false
          return JSON.stringify(mine) !== JSON.stringify(original[field])
        })
      : []

    await db.exercises.update(exercise.id, {
      ...draft,
      alias: draft.alias?.trim() || null,
      props: draft.props.filter(p => p.name.trim() || p.value.trim()),
      editedFields: edited,
      search: normalize([
        draft.name, draft.alias ?? '', draft.target, draft.equipment, draft.category
      ].join(' ')),
      updatedAt: now()
    })

    setSaving(false)
    setStatus('Guardado')
  }

  /** Devuelve los campos del dataset al borrador, para deshacer tus ediciones. */
  async function restoreFromCatalog() {
    if (!exercise) return
    const original = await datasetOriginal(exercise.id)
    if (!original) { setStatus('Este ejercicio no esta en el catalogo descargado'); return }

    patch({
      name: original.name,
      category: original.category,
      equipment: original.equipment,
      target: original.target,
      secondaryMuscles: [...original.secondaryMuscles]
    })
    setStatus('Valores del catalogo cargados. Dale a Guardar para aplicarlos')
  }

  function leave(to: string) {
    if (dirty && !confirm('Tienes cambios sin guardar. Descartarlos?')) return
    navigate(to)
  }

  async function pickImage(file: File, field: 'imageData' | 'gifData') {
    try {
      setStatus('Procesando imagen…')
      const dataUrl = await fileToStoredImage(file)
      patch({ [field]: dataUrl } as Partial<Draft>)
      setStatus(`Lista (${dataUrlSizeKb(dataUrl)} KB). Dale a Guardar`)
    } catch (error) {
      setStatus(error instanceof ImageTooLargeError ? error.message : 'No se pudo procesar el fichero')
    }
  }

  if (!exercise || !draft) return <div className="p-8 text-ink-500">Cargando…</div>

  const isCardio = exercise.tracking === 'cardio'
  const isCustom = exercise.isCustom === 1
  // Vista previa con lo que llevas editado, sin haberlo guardado aun.
  const preview = { ...exercise, ...draft }

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title={displayName(preview)}
        subtitle={isCardio ? CARDIO_KIND_LABEL[draft.cardioKind ?? 'sport'] : draft.equipment}
        action={<Button variant="ghost" onClick={() => leave('/ejercicios')}>Volver</Button>}
      />

      <div className={cx('space-y-4 px-4 md:px-8', dirty ? 'pb-40' : 'pb-8')}>
        <Card className="flex flex-col items-center gap-4 p-5">
          <ExerciseThumb exercise={preview} size="xl" shape="rounded-3xl" gif />

          <div className="flex flex-wrap justify-center gap-2">
            <Button variant="outline" size="sm" onClick={() => imageInput.current?.click()}>Subir imagen</Button>
            <Button variant="outline" size="sm" onClick={() => gifInput.current?.click()}>Subir GIF</Button>
            <Button
              variant={draft.favorite === 1 ? 'primary' : 'outline'} size="sm"
              onClick={() => patch({ favorite: draft.favorite === 1 ? 0 : 1 })}
            >
              {draft.favorite === 1 ? '★ Favorito' : '☆ Favorito'}
            </Button>
            {(draft.imageData || draft.gifData) && (
              <Button variant="ghost" size="sm" onClick={() => patch({ imageData: null, gifData: null })}>
                Quitar la mia
              </Button>
            )}
          </div>

          <input
            ref={imageInput} type="file" accept="image/*" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) void pickImage(f, 'imageData') }}
          />
          <input
            ref={gifInput} type="file" accept="image/gif,image/*" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) void pickImage(f, 'gifData') }}
          />

          <div className="w-full space-y-2">
            <label className="block space-y-1">
              <Label>o pega una URL de imagen</Label>
              <Input
                value={draft.imageData?.startsWith('http') ? draft.imageData : ''}
                placeholder="https://…" className="w-full"
                onChange={e => patch({ imageData: e.target.value.trim() || null })}
              />
            </label>
            <label className="block space-y-1">
              <Label>o pega una URL de GIF</Label>
              <Input
                value={draft.gifData?.startsWith('http') ? draft.gifData : ''}
                placeholder="https://…" className="w-full"
                onChange={e => patch({ gifData: e.target.value.trim() || null })}
              />
            </label>
          </div>

          {status && <p className="text-xs text-accent">{status}</p>}
        </Card>

        <Card className="space-y-4 p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-medium">Datos</h2>
            {(exercise.editedFields?.length ?? 0) > 0 && (
              <Pill tone="accent">{exercise.editedFields!.length} campos editados</Pill>
            )}
          </div>

          <label className="block space-y-1">
            <Label>Nombre que se muestra</Label>
            <Input
              value={draft.alias ?? draft.name} className="w-full"
              onChange={e => patch({ alias: e.target.value })}
            />
          </label>

          <label className="block space-y-1">
            <Label>Nombre original del catalogo</Label>
            <Input
              value={draft.name} className="w-full"
              onChange={e => patch({ name: e.target.value })}
            />
          </label>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Combobox
              label="Grupo" value={draft.category} options={options.categories}
              hint={categoryEs} onChange={value => patch({ category: value })}
            />
            <Combobox
              label="Material" value={draft.equipment} options={options.equipment}
              hint={equipmentEs} onChange={value => patch({ equipment: value })}
            />
            <Combobox
              label="Musculo objetivo" value={draft.target} options={options.muscles}
              hint={muscleEs} onChange={value => patch({ target: value })}
            />
          </div>

          <TagCombobox
            label="Musculos secundarios"
            values={draft.secondaryMuscles}
            options={options.muscles}
            hint={muscleEs}
            onChange={values => patch({ secondaryMuscles: values })}
          />

          {isCardio ? (
            <div className="grid grid-cols-2 gap-3">
              <label className="block space-y-1">
                <Label>Tipo de cardio</Label>
                <select
                  value={draft.cardioKind ?? 'sport'}
                  onChange={e => patch({ cardioKind: e.target.value as CardioKind })}
                  className="h-10 w-full rounded-xl border border-ink-700 bg-ink-850 px-2 text-sm"
                >
                  {(Object.keys(CARDIO_KIND_LABEL) as CardioKind[]).map(k => (
                    <option key={k} value={k}>{CARDIO_KIND_LABEL[k]}</option>
                  ))}
                </select>
              </label>
              <label className="block space-y-1">
                <Label>Ritmo</Label>
                <select
                  value={draft.paceStyle ?? ''}
                  onChange={e => patch({ paceStyle: (e.target.value || null) as PaceStyle | null })}
                  className="h-10 w-full rounded-xl border border-ink-700 bg-ink-850 px-2 text-sm"
                >
                  <option value="">Sin ritmo</option>
                  <option value="pace">min/km</option>
                  <option value="speed">km/h</option>
                  <option value="pace100">min/100m</option>
                </select>
              </label>
            </div>
          ) : (
            <label className="block space-y-1">
              <Label>Incremento al progresar (kg)</Label>
              <div className="flex items-center gap-3">
                <Input
                  type="number" inputMode="decimal" step={0.5} min={0}
                  value={draft.incrementKg ?? incrementFor(exercise)} className="w-28"
                  onChange={e => {
                    const value = Number(e.target.value)
                    patch({ incrementKg: Number.isFinite(value) ? value : null })
                  }}
                />
                <span className="text-xs text-ink-500">
                  Por defecto {defaultIncrement(preview)} kg segun el material
                </span>
              </div>
            </label>
          )}
        </Card>

        {/* Anotaciones tuyas; salen tambien en la pantalla de entreno. */}
        <Card className="space-y-3 p-5">
          <div>
            <h2 className="font-medium">Tus anotaciones</h2>
            <p className="mt-1 text-xs text-ink-500">
              Lo que necesites recordar de este ejercicio. Aparecen al entrenarlo.
            </p>
          </div>

          {draft.props.map(prop => (
            <div key={prop.id} className="flex gap-2">
              <Input
                value={prop.name} placeholder="Altura asiento" className="w-2/5"
                onChange={e => patch({
                  props: draft.props.map(p => p.id === prop.id ? { ...p, name: e.target.value } : p)
                })}
              />
              <Input
                value={prop.value} placeholder="4" className="flex-1"
                onChange={e => patch({
                  props: draft.props.map(p => p.id === prop.id ? { ...p, value: e.target.value } : p)
                })}
              />
              <button
                onClick={() => patch({ props: draft.props.filter(p => p.id !== prop.id) })}
                className="h-10 w-10 shrink-0 rounded-xl text-ink-500 transition-colors hover:bg-red-500/15 hover:text-red-300"
                aria-label="Quitar propiedad"
              >
                ✕
              </button>
            </div>
          ))}

          <Button
            variant="outline" size="sm"
            onClick={() => patch({ props: [...draft.props, { id: uid(), name: '', value: '' }] })}
          >
            + Anadir propiedad
          </Button>
        </Card>

        {exercise.instructions.length > 0 && (
          <Card className="space-y-2 p-5">
            <h2 className="font-medium">Como se hace</h2>
            <ol className="list-decimal space-y-1.5 pl-5 text-sm text-ink-300">
              {exercise.instructions.map((step, i) => <li key={i}>{step}</li>)}
            </ol>
          </Card>
        )}

        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            variant="primary" className="flex-1"
            onClick={() => leave(`/progreso?ejercicio=${exercise.id}`)}
          >
            Ver progreso de este ejercicio
          </Button>
          <Button
            variant={draft.archived === 1 ? 'outline' : 'danger'} className="flex-1"
            onClick={() => patch({ archived: draft.archived === 1 ? 0 : 1 })}
          >
            {draft.archived === 1 ? 'Desarchivar' : 'Archivar'}
          </Button>
        </div>

        {!isCustom && (
          <Button variant="ghost" className="w-full" onClick={() => void restoreFromCatalog()}>
            Restaurar los valores originales del catalogo
          </Button>
        )}

        <p className="px-1 text-xs text-ink-500">
          {usage.sessions > 0 && `Lo has entrenado ${usage.sessions} ${usage.sessions === 1 ? 'vez' : 'veces'}. `}
          {usage.routines.length > 0 && `Esta en: ${usage.routines.join(', ')}. `}
          Archivar solo lo esconde de buscadores y listas: ni tus rutinas ni tu historial se tocan.
        </p>
      </div>

      <SaveBar dirty={dirty} saving={saving} onSave={() => void save()} />
    </div>
  )
}
