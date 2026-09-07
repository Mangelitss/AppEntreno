import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import type { Exercise } from '../db/types'
import { dateKey } from '../db/repo'
import { logCardioWorkout, type CardioLogEntry } from '../db/actions'
import { displayName } from '../lib/muscles'
import {
  CARDIO_KIND_LABEL, FIELD_LABEL, FIELD_UNIT, fieldsFor, paceLabel, type CardioField
} from '../lib/cardio'
import { BACKFILL_DAYS, shiftDateKey } from '../lib/streak'
import ExerciseThumb from './ExerciseThumb'
import ExercisePicker from './ExercisePicker'
import { Button, Card, Input, Label, Sheet, cx } from './ui'

/** Lo que se esta rellenando de una actividad, en unidades de teclear (minutos, km...). */
interface Draft {
  key: string
  exerciseId: string
  minutes: string
  distance: string
  kcal: string
  avgHr: string
  maxHr: string
  expanded: boolean
}

const emptyDraft = (exerciseId: string, minutes = 30): Draft => ({
  key: Math.random().toString(36).slice(2),
  exerciseId,
  minutes: String(minutes),
  distance: '', kcal: '', avgHr: '', maxHr: '',
  expanded: false
})

const num = (text: string): number | null => {
  const trimmed = text.trim()
  if (trimmed === '') return null
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : null
}

/**
 * Registro de cardio.
 *
 * El cardio no se cronometra dentro de la app: se apunta despues. Solo la
 * duracion esta a la vista; distancia, kcal y pulsaciones viven detras de
 * "mas datos" para que registrar una salida sean dos toques cuando no tengas
 * ganas de detallar.
 */
export default function CardioLogSheet({
  open, onClose, routineId, routineName, initial, onSaved
}: {
  open: boolean
  onClose: () => void
  routineId: string | null
  routineName?: string
  /** actividades precargadas: las de la rutina de cardio */
  initial: Array<{ exerciseId: string; minutes: number }>
  onSaved?: (workoutId: string) => void
}) {
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [day, setDay] = useState(dateKey())
  const [notes, setNotes] = useState('')
  const [picking, setPicking] = useState(false)
  const [saving, setSaving] = useState(false)

  const exercises = useLiveQuery(
    async () => new Map((await db.exercises.toArray()).map(e => [e.id, e])),
    [], new Map<string, Exercise>()
  )

  useEffect(() => {
    if (!open) return
    setDrafts(initial.length
      ? initial.map(i => emptyDraft(i.exerciseId, i.minutes))
      : [])
    setDay(dateKey())
    setNotes('')
  }, [open])

  function patch(key: string, changes: Partial<Draft>) {
    setDrafts(list => list.map(d => (d.key === key ? { ...d, ...changes } : d)))
  }

  async function save() {
    const entries: CardioLogEntry[] = drafts.map(d => ({
      exerciseId: d.exerciseId,
      durationSec: num(d.minutes) === null ? null : Math.round(num(d.minutes)! * 60),
      distanceKm: num(d.distance),
      kcal: num(d.kcal),
      avgHr: num(d.avgHr),
      maxHr: num(d.maxHr)
    }))
    if (entries.length === 0) return

    setSaving(true)
    const workoutId = await logCardioWorkout({ routineId, routineName, dateKey: day, notes, entries })
    setSaving(false)
    onClose()
    onSaved?.(workoutId)
  }

  const today = dateKey()
  const minDay = shiftDateKey(today, -BACKFILL_DAYS)

  return (
    <>
      <Sheet open={open} onClose={onClose} title="Registrar cardio">
        <div className="space-y-4 p-5">
          <p className="text-sm text-ink-500">
            Apunta lo que hiciste cuando te venga bien. Con la duracion basta; lo demas,
            solo si te apetece detallarlo.
          </p>

          {drafts.map(draft => {
            const exercise = exercises?.get(draft.exerciseId)
            const fields = fieldsFor(exercise?.cardioKind ?? undefined)
            const extra = fields.filter(f => f !== 'duration')
            const pace = paceLabel(
              num(draft.minutes) === null ? null : num(draft.minutes)! * 60,
              num(draft.distance),
              exercise?.paceStyle ?? undefined
            )

            const value = (field: CardioField) =>
              field === 'distance' ? draft.distance
                : field === 'kcal' ? draft.kcal
                : field === 'avgHr' ? draft.avgHr
                : draft.maxHr

            const set = (field: CardioField, text: string) =>
              patch(draft.key, field === 'distance' ? { distance: text }
                : field === 'kcal' ? { kcal: text }
                : field === 'avgHr' ? { avgHr: text }
                : { maxHr: text })

            return (
              <Card key={draft.key} className="space-y-3 p-4">
                <div className="flex items-center gap-3">
                  <ExerciseThumb exercise={exercise} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">{displayName(exercise, 'Actividad')}</p>
                    <p className="text-xs text-ink-500">
                      {CARDIO_KIND_LABEL[exercise?.cardioKind ?? 'sport']}
                      {pace && ` · ${pace}`}
                    </p>
                  </div>
                  <button
                    onClick={() => setDrafts(list => list.filter(d => d.key !== draft.key))}
                    className="h-8 w-8 shrink-0 rounded-lg text-ink-500 transition-colors hover:bg-red-500/15 hover:text-red-300"
                    aria-label="Quitar actividad"
                  >
                    ✕
                  </button>
                </div>

                <label className="block">
                  <Label>Duracion (min)</Label>
                  <Input
                    type="number" inputMode="numeric" min={1} step={5}
                    value={draft.minutes}
                    onFocus={e => e.currentTarget.select()}
                    onChange={e => patch(draft.key, { minutes: e.target.value })}
                    className="mt-1 h-14 w-full text-center text-2xl font-medium tabular-nums"
                  />
                </label>

                {draft.expanded ? (
                  <div className="grid grid-cols-2 gap-3">
                    {extra.map(field => (
                      <label key={field} className="block">
                        <Label>{FIELD_LABEL[field]} ({FIELD_UNIT[field]})</Label>
                        <Input
                          type="number" inputMode="decimal" step="any" min={0}
                          value={value(field)}
                          placeholder="—"
                          onFocus={e => e.currentTarget.select()}
                          onChange={e => set(field, e.target.value)}
                          className="mt-1 w-full text-center tabular-nums"
                        />
                      </label>
                    ))}
                  </div>
                ) : (
                  <button
                    onClick={() => patch(draft.key, { expanded: true })}
                    className="w-full rounded-xl border border-ink-800 py-2 text-xs text-ink-500 transition-colors hover:bg-ink-850 hover:text-ink-300"
                  >
                    + Anadir {extra.map(f => FIELD_LABEL[f].toLowerCase()).join(', ')}
                  </button>
                )}
              </Card>
            )
          })}

          <Button variant="outline" className="w-full" onClick={() => setPicking(true)}>
            {drafts.length === 0 ? 'Elegir actividad' : '+ Otra actividad'}
          </Button>

          <div className="grid grid-cols-2 gap-3">
            <label className="block space-y-1">
              <Label>Que dia</Label>
              <Input
                type="date" value={day} min={minDay} max={today}
                onChange={e => setDay(e.target.value)}
                className="w-full"
              />
            </label>
            <label className="block space-y-1">
              <Label>Nota</Label>
              <Input
                value={notes} placeholder="Ruta, sensaciones..."
                onChange={e => setNotes(e.target.value)}
                className="w-full"
              />
            </label>
          </div>

          <Button
            variant="primary" size="lg"
            className={cx('w-full', drafts.length === 0 && 'pointer-events-none opacity-40')}
            disabled={saving || drafts.length === 0}
            onClick={() => void save()}
          >
            {saving ? 'Guardando…' : 'Guardar entreno'}
          </Button>
        </div>
      </Sheet>

      <ExercisePicker
        open={picking}
        onClose={() => setPicking(false)}
        only="cardio"
        title="Elegir actividad"
        onPick={id => { setDrafts(list => [...list, emptyDraft(id)]); setPicking(false) }}
      />
    </>
  )
}
