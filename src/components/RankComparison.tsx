// ---------------------------------------------------------------------------
// Los rangos de un amigo, y el boton para compararlos con los tuyos.
//
// Normalmente se ve su muneco con los seis grupos. Al comparar aparece un
// selector arriba para alternar el muneco entre sus rangos y los tuyos, y la
// lista pasa a dos columnas, apagando en cada grupo a quien va por detras.
// ---------------------------------------------------------------------------

import { useMemo, useState } from 'react'
import { muscleEs } from '../lib/muscles'
import { groupRanks, rankColors, rankLabel, type GroupRank, type MuscleRank } from '../lib/ranks'
import BodyMap from './BodyMap'
import GroupBadge from './GroupBadge'
import { Button, Card, cx } from './ui'

type Who = 'amigo' | 'yo'

/** El rango de un musculo con su color, o "Sin rango" en gris. */
function RankText({ rank }: { rank: MuscleRank | undefined }) {
  if (!rank) return <span className="text-ink-500">Sin rango</span>
  return <span className="font-semibold" style={{ color: rank.color }}>{rankLabel(rank)}</span>
}

function GroupTitle({ group, dim }: { group: GroupRank; dim?: boolean }) {
  return (
    <span
      className={cx('truncate', !group.ranked && 'text-ink-500', dim && 'opacity-40')}
      style={{ color: group.ranked ? group.color : undefined }}
    >
      {group.title}
    </span>
  )
}

export default function RankComparison({
  name, theirs, mine
}: {
  /** como se llama tu amigo, para el selector y la cabecera de la tabla */
  name: string
  theirs: MuscleRank[]
  mine: MuscleRank[]
}) {
  const [comparing, setComparing] = useState(false)
  const [showing, setShowing] = useState<Who>('amigo')
  const [selected, setSelected] = useState<string | null>(null)

  const theirGroups = useMemo(() => groupRanks(theirs), [theirs])
  const myGroups = useMemo(() => groupRanks(mine), [mine])
  const theirByMuscle = useMemo(() => new Map(theirs.map(r => [r.muscle, r])), [theirs])
  const myByMuscle = useMemo(() => new Map(mine.map(r => [r.muscle, r])), [mine])

  const who: Who = comparing ? showing : 'amigo'
  const colors = useMemo(() => rankColors(who === 'yo' ? mine : theirs), [who, mine, theirs])

  return (
    // Como en Rangos: el muneco a la izquierda (fijo al hacer scroll) y los grupos a la derecha.
    <div className="lg:grid lg:grid-cols-5 lg:items-start lg:gap-6">
      <Card className="mb-4 p-4 lg:col-span-2 lg:mb-0 lg:sticky lg:top-4">
        {comparing && (
          <div className="mb-3 flex gap-1 rounded-xl bg-ink-850 p-1">
            {([['amigo', name], ['yo', 'Tú']] as const).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setShowing(key)}
                aria-pressed={showing === key}
                className={cx(
                  'min-w-0 flex-1 truncate rounded-lg px-2 py-2 text-sm transition-colors',
                  showing === key ? 'bg-ink-700 text-ink-100' : 'text-ink-500'
                )}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        <BodyMap colors={colors} selected={selected} onPick={m => setSelected(s => (s === m ? null : m))} />

        {selected ? (
          <div className="mt-3 rounded-xl bg-ink-850 p-3 text-sm">
            <p className="font-medium">{muscleEs(selected)}</p>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs">
              <span>
                <span className="text-ink-500">{name}: </span>
                <RankText rank={theirByMuscle.get(selected)} />
              </span>
              {comparing && (
                <span>
                  <span className="text-ink-500">Tú: </span>
                  <RankText rank={myByMuscle.get(selected)} />
                </span>
              )}
            </div>
          </div>
        ) : (
          <p className="mt-3 text-center text-xs text-ink-500">Toca un músculo para ver su rango</p>
        )}

        <Button
          variant={comparing ? 'outline' : 'primary'}
          className="mt-4 w-full"
          onClick={() => { setComparing(c => !c); setShowing('amigo') }}
        >
          {comparing ? 'Dejar de comparar' : 'Comparar con los míos'}
        </Button>
      </Card>

      <Card className="overflow-hidden p-0 lg:col-span-3">
        {comparing && (
          <div className="flex items-center gap-3 border-b border-ink-800 px-4 py-2.5 text-xs uppercase tracking-wide text-ink-500">
            <span className="flex-1">Grupo</span>
            <div className="grid w-44 shrink-0 grid-cols-2 gap-2 text-right">
              <span className="truncate">{name}</span>
              <span>Tú</span>
            </div>
          </div>
        )}

        <ul className="divide-y divide-ink-850">
          {theirGroups.map((group, i) => {
            const own = myGroups[i]
            const badge = who === 'yo' ? own : group
            const lead: Who | null = !comparing ? null
              : group.points > own.points ? 'amigo'
              : own.points > group.points ? 'yo'
              : null

            return (
              <li key={group.id} className="flex items-center gap-3 px-4 py-3">
                <GroupBadge group={group.id} color={badge.color} active={badge.ranked > 0} size={36} />
                <p className="min-w-0 flex-1 truncate font-medium">{group.label}</p>
                {comparing ? (
                  <div className="grid w-44 shrink-0 grid-cols-2 gap-2 text-right text-xs font-semibold uppercase tracking-wide">
                    <GroupTitle group={group} dim={lead === 'yo'} />
                    <GroupTitle group={own} dim={lead === 'amigo'} />
                  </div>
                ) : (
                  <span className="shrink-0 text-sm font-semibold uppercase tracking-wide">
                    <GroupTitle group={group} />
                  </span>
                )}
              </li>
            )
          })}
        </ul>

        {comparing && (
          <p className="border-t border-ink-850 px-4 py-3 text-[11px] leading-relaxed text-ink-500">
            En cada grupo se apaga el rango de quien va por detrás. Los rangos miden el progreso de
            cada uno sobre su propia referencia, no quién levanta más.
          </p>
        )}
      </Card>
    </div>
  )
}
