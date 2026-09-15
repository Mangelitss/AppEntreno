import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { dateKey } from '../db/repo'
import { muscleWorkInRange, heatColor } from '../lib/muscle-work'
import BodyMap from '../components/BodyMap'
import { PageHeader } from '../components/Layout'
import { Card, cx } from '../components/ui'

/** Inicial del dia de la semana por getDay() (0 = domingo). */
const WD = ['D', 'L', 'M', 'X', 'J', 'V', 'S']

interface Advanced {
  to: string
  icon: string
  title: string
  desc: string
}

const ADVANCED: Advanced[] = [
  { to: '/estadisticas/recuento', icon: '📈', title: 'Recuento de series por grupo', desc: 'Como evolucionan tus series de cada grupo semana a semana.' },
  { to: '/estadisticas/distribucion', icon: '🕸', title: 'Distribucion de los musculos (grafico)', desc: 'Compara tu reparto actual con el periodo anterior.' },
  { to: '/estadisticas/distribucion-cuerpo', icon: '🧍', title: 'Distribucion de los musculos (cuerpo)', desc: 'Mapa semanal de musculos trabajados.' },
  { to: '/estadisticas/informe', icon: '📋', title: 'Informe mensual', desc: 'Resumen de tus entrenos y estadisticas del mes.' }
]

export default function Stats() {
  const navigate = useNavigate()
  const today = useMemo(() => new Date(), [])

  // Los ultimos 7 dias, del mas antiguo (izquierda) a hoy (derecha).
  const days = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(today)
      d.setDate(d.getDate() - (6 - i))
      return d
    })
  }, [today])

  // null = agregado de los 7 dias; si no, un dia suelto.
  const [selected, setSelected] = useState<string | null>(null)

  const fromKey = selected ?? dateKey(days[0])
  const toKey = selected ?? dateKey(today)

  const work = useLiveQuery(() => muscleWorkInRange(fromKey, toKey), [fromKey, toKey])

  const colors = useMemo(() => {
    const map = new Map<string, string>()
    if (!work || work.size === 0) return map
    const max = Math.max(...[...work.values()].map(w => w.effectiveSets))
    if (max <= 0) return map
    for (const [muscle, w] of work) map.set(muscle, heatColor(w.effectiveSets / max))
    return map
  }, [work])

  const trained = work ? [...work.values()].filter(w => w.effectiveSets > 0).length : 0

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Estadisticas" subtitle="Como se reparte tu trabajo y como evolucionas" />

      <div className="px-4 pb-8 md:px-8 lg:grid lg:grid-cols-5 lg:items-start lg:gap-6">
        <Card className="mb-6 p-4 lg:col-span-3 lg:mb-0 lg:sticky lg:top-4">
          <div className="mb-3 flex items-baseline justify-between gap-2">
            <h2 className="text-sm font-medium text-ink-300">Grafico corporal de los ultimos 7 dias</h2>
            {selected && (
              <button onClick={() => setSelected(null)} className="text-xs text-accent">Ver los 7 dias</button>
            )}
          </div>

          {/* Tira de dias: toca uno para ver solo ese dia */}
          <div className="mb-4 grid grid-cols-7 gap-1.5">
            {days.map(d => {
              const key = dateKey(d)
              const isToday = key === dateKey(today)
              const isSel = selected === key
              return (
                <button
                  key={key}
                  onClick={() => setSelected(s => (s === key ? null : key))}
                  className={cx(
                    'flex flex-col items-center gap-1 rounded-xl border py-2 transition-colors',
                    isSel ? 'border-accent bg-accent/10' : 'border-ink-800 hover:bg-ink-850'
                  )}
                >
                  <span className="text-[10px] text-ink-500">{WD[d.getDay()]}</span>
                  <span className="text-sm font-semibold leading-none">{d.getDate()}</span>
                  <span className={cx('h-1 w-1 rounded-full', isToday ? 'bg-accent' : 'bg-transparent')} />
                </button>
              )
            })}
          </div>

          <div className="mx-auto max-w-sm">
            <BodyMap colors={colors} />
          </div>

          <div className="mt-2 flex items-center justify-between gap-3 text-[11px] text-ink-500">
            <span className="truncate">{trained > 0 ? `${trained} musculos trabajados` : 'Sin datos en este periodo'}</span>
            <span className="flex shrink-0 items-center gap-1.5">
              Menos
              <span
                className="h-2.5 w-24 rounded-full"
                style={{ background: `linear-gradient(to right, ${[0.05, 0.2, 0.35, 0.5, 0.65, 0.8, 1].map(t => heatColor(t)).join(', ')})` }}
              />
              Mas
            </span>
          </div>
        </Card>

        <section className="lg:col-span-2">
          <p className="mb-2 px-1 text-xs uppercase tracking-wide text-ink-500">Estadisticas avanzadas</p>
          <Card className="divide-y divide-ink-850 overflow-hidden p-0">
            {ADVANCED.map(item => (
              <button
                key={item.to}
                onClick={() => navigate(item.to)}
                className="flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-ink-850"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-ink-850 text-lg">
                  {item.icon}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{item.title}</p>
                  <p className="truncate text-xs text-ink-500">{item.desc}</p>
                </div>
                <span className="text-ink-600">›</span>
              </button>
            ))}
          </Card>
        </section>
      </div>
    </div>
  )
}
