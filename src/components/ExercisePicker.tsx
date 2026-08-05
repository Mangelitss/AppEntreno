import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { mediaUrl } from '../db/catalog'
import { normalize } from '../lib/stats'
import { Button, Input, Pill, Sheet, cx } from './ui'
import { createCustomExercise } from '../db/actions'

/**
 * Buscador del catalogo. Filtra sobre el campo `search` precalculado, asi que
 * escribir sobre 1.324 ejercicios no se nota ni en un movil viejo.
 */
export default function ExercisePicker({
  open, onClose, onPick
}: { open: boolean; onClose: () => void; onPick: (exerciseId: string) => void }) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<string>('')
  const [equipment, setEquipment] = useState<string>('')
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')

  const exercises = useLiveQuery(() => db.exercises.toArray(), [], [])

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
      .filter(e => !e.deletedAt)
      .filter(e => !category || e.category === category)
      .filter(e => !equipment || e.equipment === equipment)
      .filter(e => terms.every(t => e.search.includes(t)))
      .sort((a, b) => (b.favorite - a.favorite) || a.name.localeCompare(b.name))
      .slice(0, 120)
  }, [exercises, query, category, equipment])

  async function handleCreate() {
    if (!newName.trim()) return
    const id = await createCustomExercise({
      name: newName.trim(), category: category || 'otros', equipment: equipment || 'otro', target: ''
    })
    setNewName(''); setCreating(false); setQuery('')
    onPick(id)
  }

  return (
    <Sheet open={open} onClose={onClose} title="Anadir ejercicio" wide>
      <div className="sticky top-0 z-10 space-y-3 border-b border-ink-800 bg-ink-900 p-4">
        <Input
          autoFocus
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Buscar: bench, squat, curl..."
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
      </div>

      <ul className="divide-y divide-ink-850">
        {results.map(e => (
          <li key={e.id}>
            <button
              onClick={() => onPick(e.id)}
              className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-ink-850"
            >
              <img
                src={mediaUrl(e.image) ?? ''}
                alt=""
                loading="lazy"
                onError={ev => { (ev.currentTarget as HTMLImageElement).style.visibility = 'hidden' }}
                className="h-11 w-11 shrink-0 rounded-lg bg-ink-800 object-cover"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm capitalize">{e.name}</p>
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
