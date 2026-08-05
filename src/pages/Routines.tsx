import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { WEEKDAYS, now } from '../db/repo'
import { createRoutine, duplicateRoutine, startWorkout } from '../db/actions'
import { softDelete } from '../db/repo'
import { Button, Card, Empty, Input, Sheet } from '../components/ui'
import { PageHeader } from '../components/Layout'

export default function Routines() {
  const navigate = useNavigate()
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')

  const routines = useLiveQuery(
    async () => (await db.routines.toArray()).filter(r => !r.deletedAt && !r.archived).sort((a, b) => a.order - b.order),
    [], []
  )
  const items = useLiveQuery(async () => (await db.routineItems.toArray()).filter(i => !i.deletedAt), [], [])
  const schedule = useLiveQuery(
    async () => (await db.schedule.toArray()).sort((a, b) => a.weekday - b.weekday), [], []
  )

  const countByRoutine = useMemo(() => {
    const map = new Map<string, number>()
    for (const item of items ?? []) map.set(item.routineId, (map.get(item.routineId) ?? 0) + 1)
    return map
  }, [items])

  async function handleCreate() {
    if (!name.trim()) return
    const id = await createRoutine(name.trim())
    setName(''); setCreating(false)
    navigate(`/rutinas/${id}`)
  }

  async function assign(weekday: number, routineId: string) {
    const day = (schedule ?? []).find(d => d.weekday === weekday)
    if (!day) return
    await db.schedule.update(day.id, { routineId: routineId || null, updatedAt: now() })
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Rutinas"
        subtitle="Montalas aqui y asignalas a los dias que entrenas"
        action={<Button variant="primary" onClick={() => setCreating(true)}>Nueva</Button>}
      />

      <div className="space-y-6 px-4 pb-8 md:px-8">
        <section>
          <h2 className="mb-2 px-1 text-sm text-ink-500">Calendario semanal</h2>
          <Card className="divide-y divide-ink-850">
            {(schedule ?? []).map(day => (
              <div key={day.id} className="flex items-center gap-3 px-4 py-2.5">
                <span className="w-24 shrink-0 text-sm text-ink-300">{WEEKDAYS[day.weekday]}</span>
                <select
                  value={day.routineId ?? ''}
                  onChange={e => void assign(day.weekday, e.target.value)}
                  className="h-9 flex-1 rounded-lg border border-ink-700 bg-ink-850 px-2 text-sm"
                >
                  <option value="">Descanso</option>
                  {(routines ?? []).map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </div>
            ))}
          </Card>
          <p className="mt-2 px-1 text-xs text-ink-500">
            El calendario es una sugerencia: siempre puedes lanzar cualquier rutina el dia que quieras.
          </p>
        </section>

        <section>
          <h2 className="mb-2 px-1 text-sm text-ink-500">Tus rutinas</h2>
          {(routines ?? []).length === 0 ? (
            <Empty
              title="Todavia no tienes rutinas"
              hint="Crea una, anadele ejercicios del catalogo y asignala a un dia de la semana."
              action={<Button variant="primary" onClick={() => setCreating(true)}>Crear la primera</Button>}
            />
          ) : (
            <div className="space-y-2">
              {(routines ?? []).map(routine => (
                <Card key={routine.id} className="p-4">
                  <div className="flex items-center justify-between gap-3">
                    <button className="min-w-0 flex-1 text-left" onClick={() => navigate(`/rutinas/${routine.id}`)}>
                      <p className="truncate font-medium">{routine.name}</p>
                      <p className="text-sm text-ink-500">
                        {countByRoutine.get(routine.id) ?? 0} ejercicios
                      </p>
                    </button>
                    <Button
                      variant="primary"
                      onClick={async () => navigate(`/entreno/${await startWorkout(routine.id)}`)}
                    >
                      Entrenar
                    </Button>
                  </div>
                  <div className="mt-3 flex gap-2 border-t border-ink-850 pt-3">
                    <Button variant="ghost" size="sm" onClick={() => navigate(`/rutinas/${routine.id}`)}>Editar</Button>
                    <Button variant="ghost" size="sm" onClick={() => void duplicateRoutine(routine.id)}>Duplicar</Button>
                    <Button
                      variant="ghost" size="sm" className="ml-auto text-red-300"
                      onClick={() => { if (confirm(`Borrar "${routine.name}"? Tus entrenos pasados no se tocan.`)) void softDelete('routines', routine.id) }}
                    >
                      Borrar
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </section>
      </div>

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
    </div>
  )
}
