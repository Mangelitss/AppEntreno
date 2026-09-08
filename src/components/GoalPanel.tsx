// ---------------------------------------------------------------------------
// Objetivo de peso: definirlo y seguirlo.
//
// Vive en Progreso pero se refleja en Medidas. A la izquierda el anillo de
// avance y los numeros gordos; a la derecha las graficas (porcentaje hacia la
// meta y peso en el tiempo) y la proyeccion segun el ritmo actual.
// ---------------------------------------------------------------------------

import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, getProfile, saveProfile } from '../db/db'
import { dateKey } from '../db/repo'
import { formatDateEs, formatKg } from '../lib/stats'
import { DIRECTION_LABEL, goalDirection, goalPace, goalSeries, goalStats } from '../lib/goal'
import type { WeightGoal } from '../db/types'
import LineChart, { type Point } from './LineChart'
import { Button, Card, Empty, Input, Label, Pill, Sheet } from './ui'

const TONE_COLOR: Record<'good' | 'warn' | 'bad' | 'default', string> = {
  good: 'var(--color-accent)',
  warn: '#fbbf24',
  bad: '#f87171',
  default: 'var(--color-accent)'
}

/** Anillo de avance. */
function Ring({ percent, color }: { percent: number; color: string }) {
  const r = 52
  const c = 2 * Math.PI * r
  const clamped = Math.max(0, Math.min(100, percent))
  return (
    <svg viewBox="0 0 120 120" className="h-40 w-40 shrink-0">
      <circle cx="60" cy="60" r={r} fill="none" stroke="var(--color-ink-800)" strokeWidth="10" />
      <circle
        cx="60" cy="60" r={r} fill="none" stroke={color} strokeWidth="10" strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={c * (1 - clamped / 100)}
        transform="rotate(-90 60 60)" style={{ transition: 'stroke-dashoffset .4s' }}
      />
      <text x="60" y="58" textAnchor="middle" className="fill-ink-100" style={{ fontSize: 26, fontWeight: 700 }}>
        {Math.round(percent)}%
      </text>
      <text x="60" y="76" textAnchor="middle" className="fill-ink-500" style={{ fontSize: 10 }}>
        del objetivo
      </text>
    </svg>
  )
}

function Stat({ value, label, unit }: { value: string; label: string; unit?: string }) {
  return (
    <Card className="p-3 text-center">
      <p className="text-lg font-semibold tabular-nums">
        {value}{unit && <span className="ml-0.5 text-xs font-normal text-ink-500">{unit}</span>}
      </p>
      <p className="text-[11px] text-ink-500">{label}</p>
    </Card>
  )
}

export default function GoalPanel() {
  const entries = useLiveQuery(
    async () => (await db.body.toArray()).filter(b => !b.deletedAt).sort((a, b) => a.dateKey.localeCompare(b.dateKey)),
    [], []
  )
  const profile = useLiveQuery(() => getProfile(), [])
  const goal = profile?.goal ?? null

  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState({ target: '', date: '', start: '' })

  const latest = useMemo(() => {
    const w = (entries ?? []).filter(e => e.weightKg != null)
    return w.length ? w[w.length - 1] : null
  }, [entries])
  const latestWeight = latest?.weightKg ?? null

  function openForm() {
    setForm({
      target: goal ? String(goal.targetWeightKg) : '',
      date: goal?.targetDateKey ?? '',
      start: goal ? String(goal.startWeightKg) : (latestWeight != null ? String(latestWeight) : '')
    })
    setFormOpen(true)
  }

  async function saveGoal() {
    const target = Number(form.target)
    const start = Number(form.start)
    if (!Number.isFinite(target) || target <= 0 || !Number.isFinite(start) || start <= 0) return
    const next: WeightGoal = {
      targetWeightKg: target,
      startWeightKg: start,
      // La partida se ancla al ultimo pesaje real (o a hoy si no hay ninguno),
      // para que el plan y el ritmo se midan desde un punto de datos de verdad.
      // Al editar se conserva la fecha de partida original.
      startDateKey: goal?.startDateKey ?? latest?.dateKey ?? dateKey(),
      targetDateKey: form.date || null,
      createdAt: goal?.createdAt ?? Date.now()
    }
    await saveProfile({ goal: next })
    setFormOpen(false)
  }

  async function removeGoal() {
    if (!confirm('¿Quitar el objetivo? Podras crear otro cuando quieras.')) return
    await saveProfile({ goal: null })
  }

  const stats = goal ? goalStats(goal, entries ?? [], dateKey()) : null
  const pace = stats ? goalPace(stats) : null
  const color = pace ? TONE_COLOR[pace.tone] : TONE_COLOR.default

  const percentSeries: Point[] = useMemo(
    () => goal
      ? goalSeries(goal, entries ?? []).map(p => ({
          x: new Date(p.dateKey).getTime(), y: Number(p.percent.toFixed(1)), label: formatDateEs(p.dateKey)
        }))
      : [],
    [goal, entries]
  )

  const weightPoints: Point[] = useMemo(
    () => (entries ?? [])
      .filter(e => e.weightKg != null)
      .map(e => ({ x: new Date(e.dateKey).getTime(), y: e.weightKg as number, label: formatDateEs(e.dateKey) })),
    [entries]
  )

  const goalForm = (
    <Sheet open={formOpen} onClose={() => setFormOpen(false)} title={goal ? 'Editar objetivo' : 'Nuevo objetivo'}>
      <div className="space-y-4 p-5">
        <p className="text-sm text-ink-500">
          Elige a cuanto quieres llegar. Si pones una fecha, verás si vas en el plan; si no, se
          mide a tu ritmo. El peso de partida se guarda para medir el avance siempre contra el
          mismo punto.
        </p>

        <div className="grid grid-cols-2 gap-3">
          <label className="space-y-1">
            <Label>Peso objetivo (kg)</Label>
            <Input
              type="number" inputMode="decimal" step="0.1" autoFocus value={form.target} className="w-full"
              onChange={e => setForm(f => ({ ...f, target: e.target.value }))}
            />
          </label>
          <label className="space-y-1">
            <Label>Peso de partida (kg)</Label>
            <Input
              type="number" inputMode="decimal" step="0.1" value={form.start} className="w-full"
              onChange={e => setForm(f => ({ ...f, start: e.target.value }))}
            />
          </label>
        </div>

        <label className="block space-y-1">
          <Label>Fecha límite (opcional)</Label>
          <Input
            type="date" value={form.date} className="w-full"
            onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
          />
        </label>

        {form.target && form.start && Number(form.target) !== Number(form.start) && (
          <p className="text-sm text-ink-300">
            {Number(form.target) < Number(form.start) ? 'Perder' : 'Ganar'}{' '}
            <span className="font-semibold">{formatKg(Math.abs(Number(form.target) - Number(form.start)))} kg</span>
            {form.date && `, antes del ${formatDateEs(form.date)}`}.
          </p>
        )}

        <Button variant="primary" className="w-full" onClick={() => void saveGoal()}>
          {goal ? 'Guardar cambios' : 'Fijar objetivo'}
        </Button>
      </div>
    </Sheet>
  )

  if (!goal || !stats) {
    return (
      <>
        <Empty
          title="Sin objetivo todavia"
          hint="Fija a cuánto quieres llegar (y opcionalmente para cuándo) y verás aquí tu avance, el ritmo y una estimación de cuándo lo lograrás. También aparecerá en Medidas."
          action={<Button variant="primary" onClick={openForm}>Definir objetivo</Button>}
        />
        {goalForm}
      </>
    )
  }

  const direction = goalDirection(goal)

  return (
    <div className="lg:grid lg:grid-cols-2 lg:items-start lg:gap-6">
      {/* Izquierda: anillo + numeros */}
      <div className="mb-4 space-y-4 lg:mb-0">
        <Card className="flex flex-col items-center gap-3 p-5">
          <Ring percent={stats.percent} color={color} />
          <div className="text-center">
            <p className="text-sm text-ink-500">{DIRECTION_LABEL[direction]}</p>
            <p className="text-2xl font-semibold">
              {stats.current != null ? formatKg(stats.current) : '—'}
              <span className="text-base text-ink-500"> / {formatKg(goal.targetWeightKg)} kg</span>
            </p>
          </div>
          {pace && <Pill tone={pace.tone}>{pace.label}</Pill>}
        </Card>

        <div className="grid grid-cols-3 gap-2">
          <Stat value={formatKg(goal.startWeightKg)} unit="kg" label="Partida" />
          <Stat value={stats.current != null ? formatKg(stats.current) : '—'} unit="kg" label="Ahora" />
          <Stat value={formatKg(goal.targetWeightKg)} unit="kg" label="Meta" />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Stat value={formatKg(Number(stats.doneKg.toFixed(1)))} unit="kg" label="ya conseguidos" />
          <Stat value={formatKg(Number(stats.remainingKg.toFixed(1)))} unit="kg" label="te faltan" />
        </div>

        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={openForm}>Editar</Button>
          <Button variant="danger" className="flex-1" onClick={() => void removeGoal()}>Quitar</Button>
        </div>
      </div>

      {/* Derecha: graficas + proyeccion */}
      <div className="space-y-4">
        <Card className="p-4">
          <p className="mb-3 text-sm font-medium">Avance hacia la meta</p>
          {percentSeries.length > 1 ? (
            <LineChart points={percentSeries} unit=" %" />
          ) : (
            <p className="py-8 text-center text-sm text-ink-500">
              Anota algún peso más y aquí verás cómo sube tu porcentaje hacia la meta.
            </p>
          )}
        </Card>

        <Card className="p-4">
          <div className="mb-3 flex items-baseline justify-between">
            <p className="text-sm font-medium">Peso</p>
            <p className="text-xs text-ink-500">meta {formatKg(goal.targetWeightKg)} kg</p>
          </div>
          <LineChart points={weightPoints} unit=" kg" />
        </Card>

        <Card className="space-y-2 p-4">
          <p className="text-sm font-medium">Proyección</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <span className="text-ink-500">Ritmo reciente</span>
            <span className="text-right tabular-nums">
              {stats.perWeekKg != null
                ? `${stats.perWeekKg >= 0 ? '+' : ''}${formatKg(Number(stats.perWeekKg.toFixed(2)))} kg/sem`
                : '—'}
            </span>

            {goal.targetDateKey && (
              <>
                <span className="text-ink-500">Fecha límite</span>
                <span className="text-right">{formatDateEs(goal.targetDateKey)}</span>
                <span className="text-ink-500">Días restantes</span>
                <span className="text-right tabular-nums">
                  {stats.daysLeft != null ? (stats.daysLeft >= 0 ? stats.daysLeft : 'plazo pasado') : '—'}
                </span>
              </>
            )}

            <span className="text-ink-500">A este ritmo llegas</span>
            <span className="text-right">
              {stats.reached ? '¡ya está!' : stats.projectedDateKey ? formatDateEs(stats.projectedDateKey) : '—'}
            </span>
          </div>

          {goal.targetDateKey && stats.onSchedulePercent != null && (
            <div className="pt-1">
              <div className="mb-1 flex justify-between text-[11px] text-ink-500">
                <span>Tu avance {Math.round(Math.max(0, stats.rawPercent))}%</span>
                <span>Plan {Math.round(stats.onSchedulePercent)}%</span>
              </div>
              <div className="relative h-2 w-full overflow-hidden rounded-full bg-ink-850">
                <div className="h-full rounded-full" style={{ width: `${stats.percent}%`, backgroundColor: color }} />
                <div
                  className="absolute top-0 h-full w-0.5 bg-ink-100"
                  style={{ left: `${stats.onSchedulePercent}%` }}
                  title="Donde deberías ir hoy"
                />
              </div>
            </div>
          )}
        </Card>
      </div>

      {goalForm}
    </div>
  )
}
