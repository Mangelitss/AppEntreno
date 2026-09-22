import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { normalize } from '../lib/stats'
import { displayName } from '../lib/muscles'
import ExerciseThumb from './ExerciseThumb'
import { Button, Input, Pill, Sheet, cx } from './ui'
import { createCustomExercise } from '../db/actions'

/**
 * Buscador del catalogo. Filtra sobre el campo `search` precalculado, asi que
 * escribir sobre 1.324 ejercicios no se nota ni en un movil viejo.
 */
export default function ExercisePicker({
  open, onClose, onPick, only, title = 'Anadir ejercicio', libraryFilters = false
}: {
  open: boolean
  onClose: () => void
  onPick: (exerciseId: string) => void
  /** limita la lista a actividades de cardio o a ejercicios de fuerza */
  only?: 'cardio' | 'reps'
  title?: string
  /**
   * Anade los filtros por biblioteca personal (con registro, en una rutina, en
   * el calendario). Solo tienen sentido en Progreso, asi que van apagados por
   * defecto y no aparecen al anadir un ejercicio a un entreno.
   */
  libraryFilters?: boolean
}) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<string>('')
  const [equipment, setEquipment] = useState<string>('')
  const [flags, setFlags] = useState({ registro: false, rutina: false, calendario: false })
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')

  const exercises = useLiveQuery(() => db.exercises.toArray(), [], [])

  // Conjuntos de ids que cumplen cada filtro personal. Se cruzan las tablas en
  // memoria una sola vez en vez de consultar ejercicio a ejercicio.
  const filterSets = useLiveQuery(async () => {
    if (!libraryFilters) return null

    const finished = new Set(
      (await db.workouts.toArray()).filter(w => !w.deletedAt && w.finishedAt).map(w => w.id)
    )
    const links = (await db.workoutExercises.toArray()).filter(l => !l.deletedAt)
    const withRecord = new Set<string>()
    for (const l of links) if (finished.has(l.workoutId)) withRecord.add(l.exerciseId)

    const activeRoutines = new Set(
      (await db.routines.toArray()).filter(r => !r.deletedAt && r.archived !== 1).map(r => r.id)
    )
    const scheduled = new Set(
      (await db.schedule.toArray())
        .filter(s => !s.deletedAt && s.routineId).map(s => s.routineId as string)
    )
    const items = (await db.routineItems.toArray()).filter(i => !i.deletedAt)
    const inRoutine = new Set<string>()
    const inSchedule = new Set<string>()
    for (const it of items) {
      if (activeRoutines.has(it.routineId)) inRoutine.add(it.exerciseId)
      if (scheduled.has(it.routineId)) inSchedule.add(it.exerciseId)
    }

    return { withRecord, inRoutine, inSchedule }
  }, [libraryFilters], null)

  const categories = useMemo(
    () => [...new Set((exercises ?? []).map(e => e.category).filter(Boolean))].sort(),
    [exercises]
  )
  const equipments = useMemo(
    () => [...new Set((exercises ?? []).map(e => e.equipment).filter(Boolean))].sort(),
    [exercises]
  )

  const results = useMemo(() => {
    const q = normalize(query.trim())
    const terms = q.split(/\s+/).filter(Boolean)
    return (exercises ?? [])
      .filter(e => !e.deletedAt && e.archived !== 1)
      .filter(e => !only || (e.tracking ?? 'reps') === only)
      .filter(e => !category || e.category === category)
      .filter(e => !equipment || e.equipment === equipment)
      .filter(e => !flags.registro || (filterSets?.withRecord.has(e.id) ?? false))
      .filter(e => !flags.rutina || (filterSets?.inRoutine.has(e.id) ?? false))
      .filter(e => !flags.calendario || (filterSets?.inSchedule.has(e.id) ?? false))
      .filter(e => terms.every(t => e.search.includes(t) || normalize(e.alias ?? '').includes(t)))
      .sort((a, b) => (b.favorite - a.favorite) || a.name.localeCompare(b.name))
      .slice(0, 120)
  }, [exercises, query, category, equipment, only, flags, filterSets])

  async function handleCreate() {
    if (!newName.trim()) return
    const id = await createCustomExercise({
      name: newName.trim(), category: category || 'otros', equipment: equipment || 'otro', target: ''
    })
    setNewName(''); setCreating(false); setQuery('')
    onPick(id)
  }

  return (
    <Sheet open={open} onClose={onClose} title={title} wide>
      <div className="sticky top-0 z-10 space-y-3 border-b border-ink-800 bg-ink-900 p-4">
        <Input
          autoFocus
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder={only === 'cardio' ? 'Buscar: bici, tenis, HIIT...' : 'Buscar: bench, squat, curl...'}
          className="w-full"
        />
        <div className="flex gap-2 overflow-x-auto pb-1">
          <select
            value={category}
            onChange={e => setCategory(e.target.value)}
            className="h-9 shrink-0 rounded-lg border border-ink-700 bg-ink-850 px-2 text-sm"
          >
            <option value="">Todo el cuerpo</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select
            value={equipment}
            onChange={e => setEquipment(e.target.value)}
            className="h-9 shrink-0 rounded-lg border border-ink-700 bg-ink-850 px-2 text-sm"
          >
            <option value="">Todo el material</option>
            {equipments.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        {libraryFilters && (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {([
              ['registro', 'Con registro'],
              ['rutina', 'En una rutina'],
              ['calendario', 'En el calendario']
            ] as const).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setFlags(f => ({ ...f, [key]: !f[key] }))}
                aria-pressed={flags[key]}
                className={cx(
                  'h-9 shrink-0 rounded-full px-3 text-sm transition-colors',
                  flags[key] ? 'bg-accent font-medium text-ink-950' : 'bg-ink-800 text-ink-300'
                )}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      <ul className="divide-y divide-ink-850">
        {results.map(e => (
          <li key={e.id}>
            <button
              onClick={() => onPick(e.id)}
              className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-ink-850"
            >
              <ExerciseThumb exercise={e} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm capitalize">{displayName(e)}</p>
                <p className="truncate text-xs text-ink-500">{e.equipment} · {e.target || e.category}</p>
              </div>
              {e.isCustom === 1 && <Pill>propio</Pill>}
            </button>
          </li>
        ))}
        {results.length === 0 && (
          <li className="px-4 py-10 text-center text-sm text-ink-500">
            Nada con ese nombre.
          </li>
        )}
      </ul>

      <div className={cx('border-t border-ink-800 p-4', creating ? 'space-y-3' : '')}>
        {creating ? (
          <>
            <Input
              autoFocus value={newName} onChange={e => setNewName(e.target.value)}
              placeholder="Nombre del ejercicio" className="w-full"
              onKeyDown={e => { if (e.key === 'Enter') void handleCreate() }}
            />
            <div className="flex gap-2">
              <Button variant="primary" onClick={() => void handleCreate()}>Crear y anadir</Button>
              <Button variant="ghost" onClick={() => setCreating(false)}>Cancelar</Button>
            </div>
          </>
        ) : (
          <Button variant="outline" className="w-full" onClick={() => setCreating(true)}>
            No esta en la lista, crear uno propio
          </Button>
        )}
      </div>
    </Sheet>
  )
}
