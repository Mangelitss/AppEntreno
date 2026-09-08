import { useMemo, useState } from 'react'
import { MUSCLE_GROUPS } from '../lib/muscle-groups'
import { muscleEs } from '../lib/muscles'
import {
  CALIBRANDO_COLOR, SIN_RANGO_COLOR, rankLabel, tierFor, nextStep, type MuscleRank
} from '../lib/ranks'
import BodyMap from './BodyMap'
import GroupBadge from './GroupBadge'
import { Card, Empty, cx } from './ui'

interface GroupRank {
  id: string
  label: string
  /** media de puntos de los musculos con datos */
  points: number
  ranked: number
  total: number
  color: string
  title: string
  muscles: MuscleRank[]
}

/** Insignia con la inicial del rango, al estilo de los juegos. */
function Badge({ color, letter, dim }: { color: string; letter: string; dim?: boolean }) {
  return (
    <span
      className={cx(
        'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-bold',
        dim && 'opacity-60'
      )}
      style={{ backgroundColor: `${color}22`, color, border: `1px solid ${color}55` }}
    >
      {letter}
    </span>
  )
}

function Bar({ value, color }: { value: number; color: string }) {
  return (
    <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-ink-850">
      <div
        className="h-full rounded-full transition-[width]"
        style={{ width: `${Math.round(value * 100)}%`, backgroundColor: color }}
      />
    </div>
  )
}

export default function RankPanel({ ranks }: { ranks: MuscleRank[] }) {
  const [open, setOpen] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)

  const byMuscle = useMemo(() => new Map(ranks.map(r => [r.muscle, r])), [ranks])

  /**
   * El rango del grupo sale de la media de puntos de sus musculos, no de la
   * media de sus rangos: promediar rangos pierde precision y da saltos raros.
   * Solo cuentan los que tienen datos; al lado se ve cuantos son de cuantos.
   */
  const groups: GroupRank[] = useMemo(() => MUSCLE_GROUPS.map(group => {
    const muscles = group.muscles
      .map(m => byMuscle.get(m))
      .filter((r): r is MuscleRank => Boolean(r))
      .sort((a, b) => b.points - a.points)

    const withRank = muscles.filter(m => m.division !== null)
    const points = withRank.length
      ? Math.round(withRank.reduce((acc, m) => acc + m.points, 0) / withRank.length)
      : 0

    const { tier, division } = tierFor(points)
    return {
      id: group.id,
      label: group.label,
      points,
      ranked: withRank.length,
      total: group.muscles.length,
      color: tier?.color ?? (muscles.length ? CALIBRANDO_COLOR : SIN_RANGO_COLOR),
      title: tier && division
        ? `${tier.label.toUpperCase()} ${['', 'I', 'II', 'III'][division]}`
        : muscles.length ? 'Calibrando' : 'Sin rango',
      muscles
    }
  }), [byMuscle])

  const colors = useMemo(() => {
    const map = new Map<string, string>()
    for (const rank of ranks) {
      if (rank.division !== null || rank.tier === 'calibrando') map.set(rank.muscle, rank.color)
    }
    return map
  }, [ranks])

  if (ranks.length === 0) {
    return (
      <Empty
        title="Todavia no hay rangos"
        hint="Termina un par de entrenos y cada musculo empezara a calibrar. Hacen falta dos semanas de datos antes de asignar un rango."
      />
    )
  }

  const detail = selected ? byMuscle.get(selected) : null

  return (
    // En escritorio: mapa a la izquierda (fijo al hacer scroll) y grupos a la
    // derecha, para aprovechar el ancho. En movil se apilan como siempre.
    <div className="lg:grid lg:grid-cols-5 lg:items-start lg:gap-6">
      <Card className="mb-4 p-4 lg:col-span-2 lg:mb-0 lg:sticky lg:top-4">
        <BodyMap colors={colors} onPick={m => setSelected(s => (s === m ? null : m))} selected={selected} />

        {detail ? (
          <div className="mt-3 flex items-center gap-3 rounded-xl bg-ink-850 p-3">
            <Badge color={detail.color} letter={detail.label.charAt(0)} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm">{muscleEs(detail.muscle)}</p>
              <p className="text-xs" style={{ color: detail.color }}>{rankLabel(detail)}</p>
              <Bar value={detail.progressToNext} color={detail.color} />
            </div>
            <div className="shrink-0 text-right">
              <p className="font-mono text-sm tabular-nums">{detail.points}</p>
              <p className="text-[10px] text-ink-500">puntos</p>
            </div>
          </div>
        ) : (
          <p className="mt-3 text-center text-xs text-ink-500">
            Toca un musculo del dibujo para ver su rango
          </p>
        )}
      </Card>

      <div className="lg:col-span-3">
        <div className="space-y-2">
        {groups.map(group => {
          const isOpen = open === group.id
          return (
            <div
              key={group.id}
              className="overflow-hidden rounded-2xl border transition-colors"
              style={{
                borderColor: group.ranked ? `${group.color}55` : 'var(--color-ink-800)',
                backgroundColor: group.ranked ? `${group.color}0f` : 'var(--color-ink-900)'
              }}
            >
              <button
                onClick={() => setOpen(isOpen ? null : group.id)}
                className="flex w-full items-center gap-4 p-4 text-left transition-colors hover:brightness-125"
              >
                <GroupBadge group={group.id} color={group.color} active={group.ranked > 0} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-lg font-semibold">{group.label}</p>
                  <p className="mt-0.5 text-sm font-medium uppercase tracking-wide">
                    <span style={{ color: group.ranked ? group.color : undefined }}
                          className={group.ranked ? '' : 'text-ink-500'}>
                      {group.title}
                    </span>
                    {group.ranked > 0 && (
                      <span className="text-ink-500 normal-case"> · {group.ranked}/{group.total}</span>
                    )}
                  </p>
                </div>
                <span
                  className="text-lg"
                  style={{ color: group.ranked ? group.color : 'var(--color-ink-500)' }}
                >
                  {isOpen ? '⌃' : '⌄'}
                </span>
              </button>

              {isOpen && (
                <ul className="divide-y divide-ink-850 border-t border-ink-850">
                  {group.muscles.length === 0 && (
                    <li className="px-4 py-4 text-center text-sm text-ink-500">
                      Sin datos de este grupo todavia
                    </li>
                  )}
                  {group.muscles.map(muscle => (
                    <li key={muscle.muscle} className="flex items-center gap-3 px-4 py-2.5">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: muscle.color }}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm">{muscleEs(muscle.muscle)}</p>
                        <p className="text-[11px]" style={{ color: muscle.color }}>
                          {rankLabel(muscle)}
                          {muscle.weeksIdle > 1 && (
                            <span className="text-amber-300"> · {muscle.weeksIdle} semanas sin tocarlo</span>
                          )}
                        </p>
                        <Bar value={muscle.progressToNext} color={muscle.color} />
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="font-mono text-sm tabular-nums">{muscle.points}</p>
                        {muscle.pointsToNext !== null && (
                          <p className="text-[10px] text-ink-500">
                            faltan {nextStep(muscle.points).pointsToNext}
                          </p>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )
        })}
        </div>

        <p className="mt-4 px-1 text-[11px] leading-relaxed text-ink-500">
          Los rangos miden progreso acumulado, no fuerza maxima: los puntos van por mejora
          relativa, asi que subir el curl de 40 a 42 kg vale lo mismo que la sentadilla de 100 a
          105. Cada semana suman el progreso sobre tu propia referencia, la constancia y las
          series cerca del fallo. Solo se baja rindiendo por debajo de lo que ya habias
          demostrado, o dejando de entrenar ese musculo.
        </p>
      </div>
    </div>
  )
}
