import { useEffect, useState } from 'react'
import { CARDIO_KIND_LABEL, FIELD_LABEL, FIELD_UNIT, fieldsFor, paceLabel, type CardioField } from '../lib/cardio'
import type { Exercise, WorkoutSet } from '../db/types'
import { Button, Card, Pill, cx } from './ui'

/** Campo suelto de la ficha; se guarda al salir para no escribir en cada tecla. */
function Field({
  label, unit, value, onCommit, autoFocus
}: {
  label: string; unit: string; value: number | null
  onCommit: (n: number | null) => void; autoFocus?: boolean
}) {
  const [draft, setDraft] = useState(value === null || value === undefined ? '' : String(value))
  useEffect(() => { setDraft(value === null || value === undefined ? '' : String(value)) }, [value])

  return (
    <label className="block">
      <span className="text-[11px] uppercase tracking-wide text-ink-500">{label}</span>
      <div className="relative mt-1">
        <input
          type="number" inputMode="decimal" step="any" min={0}
          autoFocus={autoFocus}
          value={draft}
          placeholder="—"
          onFocus={e => e.currentTarget.select()}
          onChange={e => setDraft(e.target.value)}
          onBlur={() => {
            const trimmed = draft.trim()
            if (trimmed === '') { onCommit(null); return }
            const parsed = Number(trimmed)
            onCommit(Number.isFinite(parsed) ? parsed : null)
          }}
          className="h-14 w-full rounded-xl border border-ink-700 bg-ink-850 pr-12 text-center text-xl font-medium tabular-nums outline-none focus:border-accent/60 focus:ring-2 focus:ring-accent/20"
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-ink-500">
          {unit}
        </span>
      </div>
    </label>
  )
}

/**
 * Ficha de una actividad de cardio.
 *
 * Solo pinta los campos que tienen sentido para el tipo de actividad: un HIIT
 * no lleva distancia, y un partido de tenis tampoco. El ritmo o la velocidad no
 * se teclean, salen de dividir tiempo entre distancia.
 */
export default function CardioEntry({
  exercise, set, previous, onPatch, onToggleDone
}: {
  exercise: Exercise | undefined
  set: WorkoutSet | undefined
  previous: WorkoutSet | undefined
  onPatch: (changes: Partial<WorkoutSet>) => void
  onToggleDone: () => void
}) {
  if (!set) return null

  const fields = fieldsFor(exercise?.cardioKind ?? undefined)
  const done = set.done === 1
  const pace = paceLabel(set.durationSec, set.distanceKm, exercise?.paceStyle ?? undefined)
  const previousPace = previous
    ? paceLabel(previous.durationSec, previous.distanceKm, exercise?.paceStyle ?? undefined)
    : null

  const get = (field: CardioField): number | null => {
    switch (field) {
      case 'duration': return set.durationSec ? Math.round(set.durationSec / 60) : null
      case 'distance': return set.distanceKm ?? null
      case 'kcal': return set.kcal ?? null
      case 'avgHr': return set.avgHr ?? null
      case 'maxHr': return set.maxHr ?? null
    }
  }

  const put = (field: CardioField, value: number | null) => {
    switch (field) {
      case 'duration': return onPatch({ durationSec: value === null ? null : Math.round(value * 60) })
      case 'distance': return onPatch({ distanceKm: value })
      case 'kcal': return onPatch({ kcal: value })
      case 'avgHr': return onPatch({ avgHr: value })
      case 'maxHr': return onPatch({ maxHr: value })
    }
  }

  return (
    <Card className={cx('space-y-4 p-4 transition-colors', done && 'border-emerald-500/30 bg-emerald-500/5')}>
      <div className="flex items-center justify-between gap-3">
        <Pill tone="accent">{CARDIO_KIND_LABEL[exercise?.cardioKind ?? 'sport']}</Pill>
        {pace && <span className="font-mono text-sm text-accent">{pace}</span>}
      </div>

      <div className="grid grid-cols-2 gap-3">
        {fields.map((field, i) => (
          <Field
            key={field}
            label={FIELD_LABEL[field]}
            unit={FIELD_UNIT[field]}
            value={get(field)}
            autoFocus={i === 0 && !done}
            onCommit={value => put(field, value)}
          />
        ))}
      </div>

      {previous && (
        <p className="text-xs text-ink-500">
          Ultima vez: {previous.durationSec ? `${Math.round(previous.durationSec / 60)} min` : '—'}
          {previous.distanceKm ? ` · ${previous.distanceKm} km` : ''}
          {previous.kcal ? ` · ${previous.kcal} kcal` : ''}
          {previousPace ? ` · ${previousPace}` : ''}
        </p>
      )}

      <Button
        variant={done ? 'subtle' : 'primary'}
        size="lg"
        className="w-full"
        onClick={onToggleDone}
      >
        {done ? '✓ Actividad registrada' : 'Marcar como hecha'}
      </Button>
    </Card>
  )
}
