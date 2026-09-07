import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { now, uid } from '../db/repo'
import { displayName, muscleColor, muscleEs } from '../lib/muscles'
import { CATEGORIES, EQUIPMENT, MUSCLES, categoryEs, equipmentEs, mergeOptions } from '../lib/taxonomy'
import { CARDIO_KIND_LABEL, type CardioKind, type PaceStyle } from '../lib/cardio'
import { normalize } from '../lib/stats'
import { Combobox } from '../components/Combobox'
import ExerciseThumb from '../components/ExerciseThumb'
import { PageHeader } from '../components/Layout'
import { Button, Card, Empty, Input, Label, Pill, Sheet, cx } from '../components/ui'
import type { Exercise } from '../db/types'

type Scope = 'todos' | 'fuerza' | 'cardio' | 'mios' | 'archivados'

const SCOPES: Array<{ key: Scope; label: string }> = [
  { key: 'todos', label: 'Todos' },
  { key: 'fuerza', label: 'Fuerza' },
  { key: 'cardio', label: 'Cardio' },
  { key: 'mios', label: 'Mios' },
  { key: 'archivados', label: 'Archivados' }
]

/** Formulario de alta, que cambia segun crees fuerza o una actividad de cardio. */
function CreateSheet({
  open, onClose, options
}: {
  open: boolean
  onClose: () => void
  options: { categories: string[]; equipment: string[]; muscles: string[] }
}) {
  const navigate = useNavigate()
  const [kind, setKind] = useState<'reps' | 'cardio'>('reps')
  const [form, setForm] = useState({
    name: '', category: '', equipment: '', target: '',
    cardioKind: 'sport' as CardioKind, paceStyle: '' as PaceStyle | ''
  })

  async function create() {
    if (!form.name.trim()) return
    const isCardio = kind === 'cardio'

    const exercise: Exercise = {
      id: uid(),
      name: form.name.trim(),
      alias: form.name.trim(),
      search: normalize([form.name, form.target, form.equipment, form.category].join(' ')),
      category: form.category.trim() || (isCardio ? 'cardio' : 'otros'),
      equipment: form.equipment.trim() || (isCardio ? 'cardio' : 'otro'),
      target: form.target.trim() || (isCardio ? 'cardiovascular system' : ''),
      secondaryMuscles: [],
      instructions: [],
      image: null,
      gif: null,
      isCustom: 1,
      favorite: 0,
      incrementKg: null,
      tracking: isCardio ? 'cardio' : 'reps',
      cardioKind: isCardio ? form.cardioKind : null,
      paceStyle: isCardio && form.paceStyle ? form.paceStyle : null,
      props: [],
      archived: 0,
      updatedAt: now(),
      deletedAt: null
    }

    await db.exercises.put(exercise)
    onClose()
    navigate(`/ejercicios/${exercise.id}`)
  }

  return (
    <Sheet open={open} onClose={onClose} title="Nuevo ejercicio">
      <div className="space-y-4 p-5">
        <div className="flex gap-1 rounded-xl bg-ink-850 p-1">
          {([['reps', 'Fuerza'], ['cardio', 'Cardio']] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setKind(key)}
              className={cx(
                'flex-1 rounded-lg py-2 text-sm transition-colors',
                kind === key ? 'bg-ink-800 text-ink-100' : 'text-ink-500'
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <label className="block space-y-1">
          <Label>Nombre</Label>
          <Input
            autoFocus value={form.name} className="w-full"
            placeholder={kind === 'cardio' ? 'Spinning, Padel...' : 'Press inclinado en multipower...'}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
          />
        </label>

        {kind === 'cardio' ? (
          <div className="grid grid-cols-2 gap-3">
            <label className="block space-y-1">
              <Label>Tipo</Label>
              <select
                value={form.cardioKind}
                onChange={e => setForm(f => ({ ...f, cardioKind: e.target.value as CardioKind }))}
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
                value={form.paceStyle}
                onChange={e => setForm(f => ({ ...f, paceStyle: e.target.value as PaceStyle | '' }))}
                className="h-10 w-full rounded-xl border border-ink-700 bg-ink-850 px-2 text-sm"
                disabled={form.cardioKind !== 'distance'}
              >
                <option value="">Sin ritmo</option>
                <option value="pace">min/km</option>
                <option value="speed">km/h</option>
                <option value="pace100">min/100m</option>
              </select>
            </label>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Combobox
              label="Grupo" value={form.category} options={options.categories} hint={categoryEs}
              allowEmpty placeholder="chest"
              onChange={value => setForm(f => ({ ...f, category: value }))}
            />
            <Combobox
              label="Material" value={form.equipment} options={options.equipment} hint={equipmentEs}
              allowEmpty placeholder="barbell"
              onChange={value => setForm(f => ({ ...f, equipment: value }))}
            />
            <Combobox
              label="Musculo" value={form.target} options={options.muscles} hint={muscleEs}
              allowEmpty placeholder="pectorals"
              onChange={value => setForm(f => ({ ...f, target: value }))}
            />
          </div>
        )}

        <Button variant="primary" className="w-full" onClick={() => void create()}>
          Crear y abrir ficha
        </Button>
      </div>
    </Sheet>
  )
}

/**
 * Catalogo completo: lo importado del dataset y lo tuyo, en el mismo sitio.
 * Se agrupa por grupo muscular porque es como piensas al montar una rutina.
 */
export default function Exercises() {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [scope, setScope] = useState<Scope>('todos')
  const [equipment, setEquipment] = useState('')
  const [creating, setCreating] = useState(false)
  // Se entra con todo plegado: primero eliges el grupo, luego ves su lista.
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())

  const exercises = useLiveQuery(async () => db.exercises.toArray(), [], [] as Exercise[])

  const equipments = useMemo(
    () => [...new Set((exercises ?? []).map(e => e.equipment).filter(Boolean))].sort(),
    [exercises]
  )

  const options = useMemo(() => ({
    categories: mergeOptions(CATEGORIES, (exercises ?? []).map(e => e.category)),
    equipment: mergeOptions(EQUIPMENT, (exercises ?? []).map(e => e.equipment)),
    muscles: mergeOptions(MUSCLES, (exercises ?? []).flatMap(e => [e.target, ...(e.secondaryMuscles ?? [])]))
  }), [exercises])

  const filtered = useMemo(() => {
    const terms = normalize(query.trim()).split(/\s+/).filter(Boolean)
    return (exercises ?? [])
      .filter(e => !e.deletedAt)
      .filter(e => scope === 'archivados' ? e.archived === 1 : e.archived !== 1)
      .filter(e => {
        if (scope === 'fuerza') return (e.tracking ?? 'reps') === 'reps'
        if (scope === 'cardio') return e.tracking === 'cardio'
        if (scope === 'mios') return e.isCustom === 1
        return true
      })
      .filter(e => !equipment || e.equipment === equipment)
      .filter(e => terms.every(t => e.search.includes(t) || normalize(e.alias ?? '').includes(t)))
  }, [exercises, query, scope, equipment])

  /** Secciones por grupo muscular, ordenadas por cuantos ejercicios tienen. */
  const groups = useMemo(() => {
    const map = new Map<string, Exercise[]>()
    for (const exercise of filtered) {
      const key = muscleEs(exercise.category || 'otros')
      map.set(key, [...(map.get(key) ?? []), exercise])
    }
    return [...map.entries()]
      .map(([group, list]) => ({
        group,
        color: muscleColor(group),
        list: list.sort((a, b) => displayName(a).localeCompare(displayName(b)))
      }))
      .sort((a, b) => b.list.length - a.list.length)
  }, [filtered])

  function toggle(group: string) {
    setExpandedGroups(prev => {
      const next = new Set(prev)
      if (next.has(group)) next.delete(group); else next.add(group)
      return next
    })
  }

  // Buscando o filtrando no tiene sentido esconder los resultados.
  const searching = query.trim() !== '' || equipment !== '' || scope === 'mios' || scope === 'archivados'

  const customCount = (exercises ?? []).filter(e => e.isCustom === 1 && !e.deletedAt && e.archived !== 1).length

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Ejercicios"
        subtitle={`${filtered.length} en la lista · ${customCount} tuyos`}
        action={<Button variant="primary" onClick={() => setCreating(true)}>Nuevo</Button>}
      />

      <div className="space-y-3 px-4 pb-8 md:px-8">
        <Input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Buscar ejercicio o actividad"
          className="w-full"
        />

        <div className="flex gap-2 overflow-x-auto pb-1">
          {SCOPES.map(s => (
            <button
              key={s.key}
              onClick={() => setScope(s.key)}
              className={cx(
                'shrink-0 rounded-full px-3 py-1.5 text-xs transition-colors',
                scope === s.key ? 'bg-accent font-medium text-ink-950' : 'bg-ink-800 text-ink-300'
              )}
            >
              {s.label}
            </button>
          ))}
          <select
            value={equipment}
            onChange={e => setEquipment(e.target.value)}
            className="h-8 shrink-0 rounded-full border border-ink-700 bg-ink-850 px-2 text-xs"
          >
            <option value="">Todo el material</option>
            {equipments.map(eq => <option key={eq} value={eq}>{eq}</option>)}
          </select>
        </div>

        {groups.length === 0 ? (
          <Empty
            title="Nada por aqui"
            hint={scope === 'archivados'
              ? 'No tienes ejercicios archivados.'
              : 'Prueba con otro filtro, o crea el ejercicio que te falta.'}
            action={<Button variant="primary" onClick={() => setCreating(true)}>Crear ejercicio</Button>}
          />
        ) : groups.map(({ group, color, list }) => {
          const isOpen = searching || expandedGroups.has(group)
          return (
            <Card key={group} className="overflow-hidden">
              <button
                onClick={() => toggle(group)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-ink-850/40"
              >
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xs font-semibold uppercase"
                  style={{ backgroundColor: `${color}22`, color }}
                >
                  {group.slice(0, 3)}
                </span>
                <span className="flex-1 font-medium">{group}</span>
                <span className="text-sm text-ink-500">
                  {list.length} {list.length === 1 ? 'ejercicio' : 'ejercicios'}
                </span>
                <span className="w-3 text-center text-ink-500">{isOpen ? '▾' : '▸'}</span>
              </button>

              {isOpen && (
                <ul className="divide-y divide-ink-850 border-t border-ink-850">
                  {list.map(exercise => (
                    <li key={exercise.id}>
                      <button
                        onClick={() => navigate(`/ejercicios/${exercise.id}`)}
                        className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-ink-850"
                      >
                        <ExerciseThumb exercise={exercise} size="sm" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm capitalize">{displayName(exercise)}</p>
                          <p className="truncate text-xs text-ink-500">
                            {exercise.equipment}
                            {exercise.target && ` · ${muscleEs(exercise.target)}`}
                          </p>
                        </div>
                        {exercise.favorite === 1 && <span className="text-accent">★</span>}
                        {exercise.archived === 1 && <Pill tone="warn">archivado</Pill>}
                        {exercise.isCustom === 1 && exercise.archived !== 1 && <Pill>mio</Pill>}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )
        })}
      </div>

      <CreateSheet open={creating} onClose={() => setCreating(false)} options={options} />
    </div>
  )
}
