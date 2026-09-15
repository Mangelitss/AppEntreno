import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { dateKey } from '../../db/repo'
import { shiftDateKey } from '../../lib/streak'
import { formatDuration } from '../../lib/stats'
import { muscleWorkInRange, groupWork, periodSummary } from '../../lib/muscle-work'
import RadarChart from '../../components/RadarChart'
import StatTile from '../../components/StatTile'
import { PageHeader } from '../../components/Layout'
import { Card, Empty } from '../../components/ui'

/** Etiqueta corta de cada grupo para que quepa en los ejes del radar. */
const SHORT: Record<string, string> = {
  pecho: 'Pecho', espalda: 'Espalda', hombros: 'Hombros',
  brazos: 'Brazos', abdominales: 'Core', piernas: 'Piernas'
}

/** Periodos: cada uno se compara con el periodo anterior de la misma longitud. */
const PERIODS: { id: string; label: string; days: number }[] = [
  { id: '2s', label: 'Ultimas 2 semanas', days: 14 },
  { id: '30d', label: 'Ultimos 30 dias', days: 30 },
  { id: '3m', label: 'Ultimos 3 meses', days: 90 },
  { id: '6m', label: 'Ultimos 6 meses', days: 180 },
  { id: '1a', label: 'Ultimo ano', days: 365 }
]

export default function MuscleRadar() {
  const navigate = useNavigate()
  const [periodId, setPeriodId] = useState('30d')
  const period = PERIODS.find(p => p.id === periodId) ?? PERIODS[1]
  const days = period.days

  const todayKey = dateKey(new Date())
  const curFrom = shiftDateKey(todayKey, -(days - 1))
  const prevTo = shiftDateKey(todayKey, -days)
  const prevFrom = shiftDateKey(todayKey, -(2 * days - 1))

  const data = useLiveQuery(async () => {
    const [cur, prev, sum, prevSum] = await Promise.all([
      muscleWorkInRange(curFrom, todayKey),
      muscleWorkInRange(prevFrom, prevTo),
      periodSummary(curFrom, todayKey),
      periodSummary(prevFrom, prevTo)
    ])
    return { cur: groupWork(cur), prev: groupWork(prev), sum, prevSum }
  }, [curFrom, todayKey, prevFrom, prevTo])

  const hasData = data && data.sum.workouts > 0

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Distribucion de los musculos" onBack={() => navigate('/estadisticas')} />

      <div className="space-y-4 px-4 pb-8 md:px-8">
        <label className="block">
          <span className="mb-1 block text-xs uppercase tracking-wide text-ink-500">Periodo</span>
          <select
            value={periodId}
            onChange={e => setPeriodId(e.target.value)}
            className="h-11 w-full rounded-xl border border-ink-700 bg-ink-850 px-3 text-sm text-ink-100 outline-none focus:border-accent/60"
          >
            {PERIODS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </label>

        {!hasData ? (
          <Empty title="Sin entrenos en este periodo" hint="Cuando registres entrenos veras aqui como repartes el trabajo por grupo." />
        ) : (
          <div className="lg:grid lg:grid-cols-5 lg:items-start lg:gap-4">
            <Card className="p-4 lg:col-span-3">
              <RadarChart
                axes={data!.cur.map(g => SHORT[g.id] ?? g.label)}
                series={[
                  { label: 'Actual', color: 'var(--color-accent)', values: data!.cur.map(g => g.effectiveSets) },
                  { label: 'Anterior', color: '#a1a1aa', values: data!.prev.map(g => g.effectiveSets) }
                ]}
              />
            </Card>

            <div className="mt-2 grid grid-cols-2 gap-2 lg:col-span-2 lg:mt-0">
              <StatTile label="Entrenamientos" value={String(data!.sum.workouts)} prev={String(data!.prevSum.workouts)} />
              <StatTile label="Duracion" value={formatDuration(data!.sum.durationMs)} prev={formatDuration(data!.prevSum.durationMs)} />
              <StatTile label="Volumen" value={`${data!.sum.volume.toLocaleString('es-ES')} kg`} prev={`${data!.prevSum.volume.toLocaleString('es-ES')} kg`} />
              <StatTile label="Series" value={String(data!.sum.sets)} prev={String(data!.prevSum.sets)} />
            </div>
          </div>
        )}

        <p className="px-1 text-[11px] leading-relaxed text-ink-500">
          En color se ve el periodo actual; en gris, el periodo anterior de la misma duracion (por ejemplo,
          los 3 meses previos a los 3 actuales). Las cifras comparan ambos con la flecha.
        </p>
      </div>
    </div>
  )
}
