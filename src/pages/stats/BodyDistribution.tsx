import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { dateKey } from '../../db/repo'
import { muscleEs } from '../../lib/muscles'
import { MUSCLE_GROUPS } from '../../lib/muscle-groups'
import { muscleWorkInRange, heatColor } from '../../lib/muscle-work'
import BodyMap from '../../components/BodyMap'
import { DIAS, addDays, startOfWeek, sameYMD } from '../../components/WorkoutCalendar'
import { PageHeader } from '../../components/Layout'
import { Card, cx } from '../../components/ui'

/** Filas de la tabla: una por musculo del dataset, deduplicadas por su nombre en espanol. */
const MUSCLE_ROWS = (() => {
  const seen = new Map<string, string[]>()
  for (const group of MUSCLE_GROUPS) {
    for (const muscle of group.muscles) {
      const label = muscleEs(muscle)
      const keys = seen.get(label) ?? []
      keys.push(muscle.toLowerCase())
      seen.set(label, keys)
    }
  }
  return [...seen.entries()]
    .map(([label, keys]) => ({ label, keys }))
    .sort((a, b) => a.label.localeCompare(b.label, 'es'))
})()

const MESES_LARGOS = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
]

export default function BodyDistribution() {
  const navigate = useNavigate()
  const today = useMemo(() => new Date(), [])
  const [cursor, setCursor] = useState(() => new Date())
  const [selected, setSelected] = useState<string | null>(null)

  const start = useMemo(() => startOfWeek(cursor), [cursor])
  const end = useMemo(() => addDays(start, 6), [start])
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(start, i)), [start])

  const fromKey = dateKey(start)
  const toKey = dateKey(end)
  const work = useLiveQuery(() => muscleWorkInRange(fromKey, toKey), [fromKey, toKey])

  const colors = useMemo(() => {
    const map = new Map<string, string>()
    if (!work || work.size === 0) return map
    const max = Math.max(...[...work.values()].map(w => w.effectiveSets))
    if (max <= 0) return map
    for (const [muscle, w] of work) map.set(muscle, heatColor(w.effectiveSets / max))
    return map
  }, [work])

  const rows = useMemo(() => MUSCLE_ROWS.map(row => ({
    ...row,
    sets: Math.round(row.keys.reduce((acc, k) => acc + (work?.get(k)?.effectiveSets ?? 0), 0))
  })), [work])

  const total = rows.reduce((acc, r) => acc + r.sets, 0)
  const atPresent = toKey >= dateKey(today)

  const label = (() => {
    const sameMonth = start.getMonth() === end.getMonth()
    if (sameMonth) return `${start.getDate()}-${end.getDate()} ${MESES_LARGOS[start.getMonth()]} ${end.getFullYear()}`
    return `${start.getDate()} ${MESES_LARGOS[start.getMonth()].slice(0, 3)} - ${end.getDate()} ${MESES_LARGOS[end.getMonth()].slice(0, 3)} ${end.getFullYear()}`
  })()

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Distribucion del cuerpo" onBack={() => navigate('/estadisticas')} />

      <div className="px-4 pb-8 md:px-8 lg:grid lg:grid-cols-5 lg:items-start lg:gap-6">
        <Card className="mb-4 p-4 lg:col-span-3 lg:mb-0 lg:sticky lg:top-4">
          <div className="mb-4 flex items-center justify-between gap-2">
            <button
              onClick={() => setCursor(c => addDays(c, -7))}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-300 hover:bg-ink-800"
              aria-label="Semana anterior"
            >‹</button>
            <p className="text-center text-sm font-medium">{label}</p>
            <button
              onClick={() => setCursor(c => addDays(c, 7))}
              disabled={atPresent}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-300 enabled:hover:bg-ink-800 disabled:opacity-30"
              aria-label="Semana siguiente"
            >›</button>
          </div>

          <div className="mb-4 grid grid-cols-7 gap-1.5">
            {days.map((d, i) => {
              const isToday = sameYMD(d, today)
              return (
                <div
                  key={dateKey(d)}
                  className={cx(
                    'flex flex-col items-center gap-1 rounded-xl border py-2',
                    isToday ? 'border-accent' : 'border-ink-800'
                  )}
                >
                  <span className="text-[10px] text-ink-500">{DIAS[i]}</span>
                  <span className="text-sm font-semibold leading-none">{d.getDate()}</span>
                </div>
              )
            })}
          </div>

          <div className="mx-auto max-w-sm">
            <BodyMap colors={colors} selected={selected} onPick={m => setSelected(s => (s === m ? null : m))} />
          </div>
        </Card>

        <Card className="overflow-hidden p-0 lg:col-span-2">
          <div className="flex items-center justify-between border-b border-ink-800 px-4 py-2.5 text-xs uppercase tracking-wide text-ink-500">
            <span>Musculo</span><span>Series</span>
          </div>
          <div className="flex items-center justify-between px-4 py-2.5 text-sm font-semibold">
            <span>Total</span><span className="tabular-nums">{total}</span>
          </div>
          <ul className="divide-y divide-ink-850">
            {rows.map(row => {
              const isSel = !!selected && row.keys.includes(selected)
              return (
                <li
                  key={row.label}
                  className={cx('flex items-center justify-between px-4 py-2.5 text-sm', isSel && 'bg-accent/10')}
                >
                  <span className={cx(row.sets === 0 && 'text-ink-500')}>{row.label}</span>
                  <span className={cx('tabular-nums', row.sets === 0 ? 'text-ink-500' : 'font-medium')}>{row.sets}</span>
                </li>
              )
            })}
          </ul>
        </Card>
      </div>
    </div>
  )
}
