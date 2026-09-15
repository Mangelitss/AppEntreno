import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { buildWeekMuscleData } from '../../db/rank-data'
import { MUSCLE_GROUPS, groupOf } from '../../lib/muscle-groups'
import LineChart, { type Point } from '../../components/LineChart'
import { PageHeader } from '../../components/Layout'
import { Card, Empty, cx } from '../../components/ui'

/** '2026-W37' -> 'S37' */
function weekShort(weekKey: string): string {
  const w = weekKey.split('-W')[1]
  return `S${Number(w)}`
}

const WEEKS_SHOWN = 12

export default function SetsPerGroup() {
  const navigate = useNavigate()
  const weekData = useLiveQuery(() => buildWeekMuscleData(), [], [])
  const [group, setGroup] = useState<string>('pecho')

  // Series efectivas por semana y grupo.
  const byWeek = useMemo(() => {
    const weeks = new Map<string, Map<string, number>>()
    for (const entry of weekData ?? []) {
      const g = groupOf(entry.muscle)
      if (!g) continue
      const perGroup = weeks.get(entry.weekKey) ?? new Map<string, number>()
      perGroup.set(g.id, (perGroup.get(g.id) ?? 0) + entry.effectiveSets)
      weeks.set(entry.weekKey, perGroup)
    }
    return weeks
  }, [weekData])

  const weekKeys = useMemo(
    () => [...byWeek.keys()].sort().slice(-WEEKS_SHOWN),
    [byWeek]
  )

  const points: Point[] = useMemo(
    () => weekKeys.map((wk, i) => ({
      x: i,
      y: Math.round((byWeek.get(wk)?.get(group) ?? 0) * 10) / 10,
      label: weekShort(wk)
    })),
    [weekKeys, byWeek, group]
  )

  const hasData = (weekData ?? []).length > 0

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Recuento de series por grupo" onBack={() => navigate('/estadisticas')} />

      <div className="space-y-4 px-4 pb-8 md:px-8">
        {!hasData ? (
          <Empty title="Todavia no hay datos" hint="Termina algunos entrenos y veras aqui como suben o bajan tus series de cada grupo." />
        ) : (
          <>
            <div className="flex flex-wrap gap-1.5">
              {MUSCLE_GROUPS.map(g => (
                <button
                  key={g.id}
                  onClick={() => setGroup(g.id)}
                  className={cx(
                    'rounded-full px-3 py-1 text-xs transition-colors',
                    group === g.id ? 'bg-accent font-medium text-ink-950' : 'bg-ink-800 text-ink-300'
                  )}
                >
                  {g.label}
                </button>
              ))}
            </div>

            <Card className="p-4">
              <p className="mb-2 text-sm text-ink-500">Series efectivas por semana</p>
              <LineChart points={points} unit=" series" yLabel="Series" xLabel="Semanas" />
            </Card>

            <p className="px-1 text-[11px] leading-relaxed text-ink-500">
              Cada serie cuenta 1 para el musculo objetivo y 0,4 para cada secundario, igual que en los rangos.
              Se muestran las ultimas {WEEKS_SHOWN} semanas con datos.
            </p>
          </>
        )}
      </div>
    </div>
  )
}
