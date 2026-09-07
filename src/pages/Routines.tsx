import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { WEEKDAYS, WEEKDAYS_SHORT, softDelete } from '../db/repo'
import { createRoutine, duplicateRoutine, saveSchedule } from '../db/actions'
import { estimateMinutes } from '../lib/muscles'
import RoutinePanel, { type PanelItem } from '../components/RoutinePanel'
import SaveBar from '../components/SaveBar'
import { Button, Card, Empty, Input, Sheet, cx } from '../components/ui'
import { PageHeader } from '../components/Layout'

/** Que rutina toca cada dia, de lunes a domingo. */
type Week = Record<number, string | null>

export default function Routines() {
  const navigate = useNavigate()
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [week, setWeek] = useState<Week | null>(null)
  const [editingDay, setEditingDay] = useState<number | null>(null)
  // Solo una rutina desplegada a la vez: las demas se atenuan para no distraer.
  const [expanded, setExpanded] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const routines = useLiveQuery(
    async () => (await db.routines.toArray())
      .filter(r => !r.deletedAt && !r.archived)
      .sort((a, b) => a.order - b.order),
    [], []
  )
  const items = useLiveQuery(async () => (await db.routineItems.toArray()).filter(i => !i.deletedAt), [], [])
  const exercises = useLiveQuery(
    async () => new Map((await db.exercises.toArray()).map(e => [e.id, e])), [], new Map()
  )
  const schedule = useLiveQuery(
    async () => (await db.schedule.toArray()).sort((a, b) => a.weekday - b.weekday), [], []
  )

  /** Lo que hay guardado, en el mismo formato que el borrador. */
  const savedWeek = useMemo<Week | null>(() => {
    if (!schedule || schedule.length === 0) return null
    return Object.fromEntries(schedule.map(d => [d.weekday, d.routineId ?? null]))
  }, [schedule])

  // El calendario tambien es un borrador: no se aplica hasta darle a Guardar.
  useEffect(() => { if (savedWeek && !week) setWeek(savedWeek) }, [savedWeek, week])

  const dirty = Boolean(savedWeek && week) && JSON.stringify(savedWeek) !== JSON.stringify(week)

  const itemsByRoutine = useMemo(() => {
    const map = new Map<string, PanelItem[]>()
    for (const item of (items ?? []).slice().sort((a, b) => a.order - b.order)) {
      const list = map.get(item.routineId) ?? []
      list.push({ item, exercise: exercises?.get(item.exerciseId) })
      map.set(item.routineId, list)
    }
    return map
  }, [items, exercises])

  /** Dias asignados a cada rutina segun el borrador, para pintarlos en su panel. */
  const weekdaysByRoutine = useMemo(() => {
    const map = new Map<string, number[]>()
    for (const [weekday, routineId] of Object.entries(week ?? {})) {
      if (!routineId) continue
      map.set(routineId, [...(map.get(routineId) ?? []), Number(weekday)])
    }
    return map
  }, [week])

  const byId = useMemo(() => new Map((routines ?? []).map(r => [r.id, r])), [routines])

  async function handleCreate() {
    if (!name.trim()) return
    const id = await createRoutine(name.trim())
    setName(''); setCreating(false)
    navigate(`/rutinas/${id}`)
  }

  function assign(weekday: number, routineId: string | null) {
    setWeek(prev => ({ ...(prev ?? {}), [weekday]: routineId }))
    setEditingDay(null)
  }

  async function save() {
    if (!week) return
    setSaving(true)
    await saveSchedule(week)
    setSaving(false)
  }

  function leave(to: string) {
    if (dirty && !confirm('Tienes cambios sin guardar en la semana. Descartarlos?')) return
    navigate(to)
  }

  return (
    <div className="mx-auto max-w-3xl xl:max-w-5xl">
      <PageHeader
        title="Rutinas"
        subtitle="Montalas aqui y asignalas a los dias que entrenas"
        action={<Button variant="primary" onClick={() => setCreating(true)}>Nueva</Button>}
      />

      <div className={cx('space-y-6 px-4 md:px-8', dirty ? 'pb-40' : 'pb-8')}>
        <section>
          <h2 className="mb-2 px-1 text-sm text-ink-500">Tu semana</h2>
          <Card className="p-3">
            <div className="flex gap-1.5">
              {WEEKDAYS_SHORT.map((label, weekday) => {
                const routineId = week?.[weekday] ?? null
                const routine = routineId ? byId.get(routineId) : null
                const changed = savedWeek ? savedWeek[weekday] !== routineId : false
                return (
                  <button
                    key={weekday}
                    onClick={() => setEditingDay(weekday)}
                    className={cx(
                      'min-w-0 flex-1 rounded-xl border px-1 py-2 text-center transition-colors',
                      changed ? 'border-amber-500/50 bg-amber-500/10'
                        : routine ? 'border-accent/30 bg-accent/5 hover:bg-accent/10'
                        : 'border-ink-800 hover:bg-ink-850'
                    )}
                  >
                    <div className={routine ? 'text-xs font-semibold text-accent' : 'text-xs text-ink-500'}>
                      {label}
                    </div>
                    <div className="mt-1 truncate text-[10px] leading-tight text-ink-300">
                      {routine ? routine.name : '—'}
                    </div>
                  </button>
                )
              })}
            </div>
            <p className="mt-2 text-center text-[11px] text-ink-500">
              Toca un dia para elegir que rutina toca
            </p>
          </Card>
        </section>

        <section className="space-y-3">
          <h2 className="px-1 text-sm text-ink-500">Tus rutinas</h2>
          {(routines ?? []).length === 0 ? (
            <Empty
              title="Todavia no tienes rutinas"
              hint="Crea una, anadele ejercicios del catalogo y asignala a un dia de la semana."
              action={<Button variant="primary" onClick={() => setCreating(true)}>Crear la primera</Button>}
            />
          ) : (
          <div className="grid grid-cols-2 items-start gap-3 md:grid-cols-3">
          {(routines ?? []).map(routine => (
            <RoutinePanel
              key={routine.id}
              routine={routine}
              items={itemsByRoutine.get(routine.id) ?? []}
              weekdays={weekdaysByRoutine.get(routine.id) ?? []}
              onOpen={() => leave(`/rutinas/${routine.id}`)}
              expanded={expanded === routine.id}
              onToggleExpand={() => setExpanded(prev => (prev === routine.id ? null : routine.id))}
              dimmed={expanded !== null && expanded !== routine.id}
              footer={
                <>
                  <Button variant="ghost" size="sm" onClick={() => leave(`/rutinas/${routine.id}`)}>Editar</Button>
                  <Button variant="ghost" size="sm" onClick={() => void duplicateRoutine(routine.id)}>Duplicar</Button>
                  <Button
                    variant="ghost" size="sm" className="ml-auto text-red-300"
                    onClick={() => {
                      if (confirm(`Borrar "${routine.name}"? Tus entrenos pasados no se tocan.`)) {
                        void softDelete('routines', routine.id)
                      }
                    }}
                  >
                    Borrar
                  </Button>
                </>
              }
            />
          ))}
          </div>
          )}
        </section>
      </div>

      <Sheet
        open={editingDay !== null}
        onClose={() => setEditingDay(null)}
        title={editingDay !== null ? WEEKDAYS[editingDay] : ''}
      >
        <div className="divide-y divide-ink-850">
          <button
            onClick={() => editingDay !== null && assign(editingDay, null)}
            className="flex w-full items-center justify-between px-5 py-4 text-left hover:bg-ink-850"
          >
            <span className="text-ink-300">Descanso</span>
            {editingDay !== null && !week?.[editingDay] && <span className="text-accent">✓</span>}
          </button>

          {(routines ?? []).map(routine => {
            const routineItems = itemsByRoutine.get(routine.id) ?? []
            const selected = editingDay !== null && week?.[editingDay] === routine.id
            return (
              <button
                key={routine.id}
                onClick={() => editingDay !== null && assign(editingDay, routine.id)}
                className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left hover:bg-ink-850"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{routine.name}</p>
                  <p className="text-sm text-ink-500">
                    {routineItems.length} ejercicios · {estimateMinutes(routineItems.map(i => i.item))} min
                  </p>
                </div>
                {selected && <span className="shrink-0 text-accent">✓</span>}
              </button>
            )
          })}
        </div>
      </Sheet>

      <Sheet open={creating} onClose={() => setCreating(false)} title="Nueva rutina">
        <div className="space-y-4 p-5">
          <Input
            autoFocus value={name} onChange={e => setName(e.target.value)}
            placeholder="Push, Pull, Pierna, Torso..." className="w-full"
            onKeyDown={e => { if (e.key === 'Enter') void handleCreate() }}
          />
          <Button variant="primary" className="w-full" onClick={() => void handleCreate()}>
            Crear y anadir ejercicios
          </Button>
        </div>
      </Sheet>

      <SaveBar
        dirty={dirty}
        saving={saving}
        onSave={() => void save()}
        secondary={<Button variant="ghost" onClick={() => setWeek(savedWeek)}>Deshacer</Button>}
      />
    </div>
  )
}
