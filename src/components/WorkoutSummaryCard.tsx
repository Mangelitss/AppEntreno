// ---------------------------------------------------------------------------
// Tarjeta de un entreno, desplegable.
//
// Cerrada muestra el resumen (rutina, fecha, kg, series, duracion). Abierta,
// cada ejercicio con sus series: peso x reps y RIR en fuerza, o duracion /
// distancia / kcal en cardio. Es la copia congelada del entreno, asi que
// aunque borres la rutina o el ejercicio, aqui se sigue viendo lo que hiciste.
// ---------------------------------------------------------------------------

import { useMemo, useState } from 'react'
import type { Workout, WorkoutExercise, WorkoutSet } from '../db/types'
import { formatDateEs, formatDuration, formatKg, totalVolume } from '../lib/stats'
import { formatCardioDuration, isCardioSet } from '../lib/cardio'
import { Card, Pill, cx } from './ui'

export interface WorkoutSummary {
  workout: Workout
  sets: WorkoutSet[]
  exercises: WorkoutExercise[]
}

const SET_LABEL: Record<string, string> = { warmup: 'C', failure: 'F', drop: 'D' }

/** Lo que hace falta de una serie para pintarla: vale una del historial o una de un post. */
type SetLike = Pick<WorkoutSet, 'type' | 'weight' | 'reps' | 'rir' | 'durationSec' | 'distanceKm' | 'kcal' | 'avgHr'>
  & { done?: 0 | 1 }

function cardioLine(s: SetLike): string {
  const parts: string[] = []
  if (s.durationSec) parts.push(formatCardioDuration(s.durationSec))
  if (s.distanceKm) parts.push(`${s.distanceKm} km`)
  if (s.kcal) parts.push(`${s.kcal} kcal`)
  if (s.avgHr) parts.push(`${s.avgHr} ppm`)
  return parts.join(' · ') || '—'
}

/**
 * Una serie dentro de un ejercicio: su numero o su marca (calentamiento, fallo,
 * dropset) y lo que se hizo. La comparten el historial y los posts de Social.
 */
export function SetRow({ set, index }: { set: SetLike; index: number }) {
  const done = set.done !== 0
  return (
    <div
      className={cx(
        'flex items-center gap-2 rounded-lg px-2 py-1 text-sm tabular-nums',
        done ? 'bg-emerald-500/5' : 'opacity-60'
      )}
    >
      <span
        className={cx(
          'flex h-6 w-6 shrink-0 items-center justify-center rounded text-xs',
          SET_LABEL[set.type] ? 'bg-ink-800 text-ink-300' : 'bg-ink-850 text-ink-500'
        )}
      >
        {SET_LABEL[set.type] ?? index + 1}
      </span>
      {isCardioSet(set) ? (
        <span className="text-ink-200">{cardioLine(set)}</span>
      ) : (
        <span className="text-ink-200">
          {formatKg(set.weight)} kg × {set.reps}
          {set.rir != null && <span className="text-ink-500"> · RIR {set.rir}</span>}
        </span>
      )}
      {!done && <span className="ml-auto text-[11px] text-ink-500">sin hacer</span>}
    </div>
  )
}

export default function WorkoutSummaryCard({
  item, defaultOpen = false, existingRoutineIds
}: {
  item: WorkoutSummary
  defaultOpen?: boolean
  /** ids de rutinas que siguen existiendo; si se pasa, marca las eliminadas */
  existingRoutineIds?: Set<string>
}) {
  const { workout, sets, exercises } = item
  const [open, setOpen] = useState(defaultOpen)

  const setsByLink = useMemo(() => {
    const map = new Map<string, WorkoutSet[]>()
    for (const s of sets) {
      const arr = map.get(s.workoutExerciseId)
      if (arr) arr.push(s); else map.set(s.workoutExerciseId, [s])
    }
    for (const arr of map.values()) arr.sort((a, b) => a.order - b.order)
    return map
  }, [sets])

  const volume = Math.round(totalVolume(sets))
  const doneSets = sets.filter(s => s.done === 1).length
  const routineDeleted =
    workout.routineId != null && existingRoutineIds != null && !existingRoutineIds.has(workout.routineId)

  return (
    <Card className="overflow-hidden p-0">
      <button
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="flex w-full items-start justify-between gap-3 p-4 text-left hover:bg-ink-850"
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="truncate font-medium">{workout.routineName}</p>
            {routineDeleted && <Pill tone="warn">eliminada</Pill>}
          </div>
          <p className="text-sm text-ink-500">{formatDateEs(workout.dateKey)}</p>
          {!open && (
            <p className="mt-1 truncate text-xs capitalize text-ink-500">
              {exercises.map(e => e.exerciseName).join(' · ') || 'Sin ejercicios'}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <div className="text-right">
            <p className="font-mono text-sm">{volume.toLocaleString('es-ES')} kg</p>
            <p className="text-xs text-ink-500">
              {doneSets} series
              {workout.finishedAt && ` · ${formatDuration(workout.finishedAt - workout.startedAt)}`}
            </p>
          </div>
          <span className={cx('text-ink-500 transition-transform', open && 'rotate-180')}>⌄</span>
        </div>
      </button>

      {open && (
        <div className="space-y-3 border-t border-ink-850 p-4">
          {exercises.length === 0 && (
            <p className="text-sm text-ink-500">Este entreno no tiene ejercicios.</p>
          )}
          {exercises.map(link => {
            const linkSets = setsByLink.get(link.id) ?? []
            return (
              <div key={link.id}>
                <p className="mb-1 text-sm font-medium capitalize">{link.exerciseName}</p>
                {linkSets.length === 0 ? (
                  <p className="text-xs text-ink-500">Sin series registradas.</p>
                ) : (
                  <div className="space-y-1">
                    {linkSets.map((s, i) => <SetRow key={s.id} set={s} index={i} />)}
                  </div>
                )}
                {link.notes && <p className="mt-1 text-xs italic text-ink-500">{link.notes}</p>}
              </div>
            )
          })}
          {workout.notes && (
            <p className="border-t border-ink-850 pt-2 text-xs italic text-ink-400">{workout.notes}</p>
          )}
        </div>
      )}
    </Card>
  )
}
