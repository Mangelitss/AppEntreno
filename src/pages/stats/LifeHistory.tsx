// ---------------------------------------------------------------------------
// Historial de vida.
//
// Semana, mes o ano. Te mueves hacia atras periodo a periodo y ves como ibas
// entonces: cuanto pesabas de media, tu % de grasa, tus medidas y el resumen
// de entrenos de ese tramo. Todo se calcula del historial, nada se guarda
// aparte: corregir un peso o un entreno antiguo tambien corrige esto.
// ---------------------------------------------------------------------------

import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/db'
import { dateKey } from '../../db/repo'
import { formatDateEs, formatDuration, formatKg } from '../../lib/stats'
import LineChart, { type Point } from '../../components/LineChart'
import StatTile from '../../components/StatTile'
import {
  MESES, atNoon, addDays, addMonths, startOfWeek, monthName
} from '../../components/WorkoutCalendar'
import { PageHeader } from '../../components/Layout'
import { Card, Empty, cx } from '../../components/ui'
import type { BodyEntry } from '../../db/types'

type View = 'semana' | 'mes' | 'año'

const VIEWS: { key: View; label: string }[] = [
  { key: 'semana', label: 'Semana' },
  { key: 'mes', label: 'Mes' },
  { key: 'año', label: 'Año' }
]

const MEASURE_LABEL: Record<string, string> = {
  pecho: 'Pecho', cintura: 'Cintura', cadera: 'Cadera', brazo: 'Brazo', muslo: 'Muslo'
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const mean = (xs: number[]): number | null => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)

interface BodyAgg {
  avgWeight: number | null
  firstWeight: number | null
  lastWeight: number | null
  avgFat: number | null
  avgMeasures: Map<string, number>
  entries: number
}

function aggregateBody(entries: BodyEntry[]): BodyAgg {
  const weights = entries.map(e => e.weightKg).filter((w): w is number => w != null)
  const fats = entries.map(e => e.bodyFat).filter((f): f is number => f != null)

  const perMeasure = new Map<string, number[]>()
  for (const e of entries) {
    for (const [k, v] of Object.entries(e.measurements ?? {})) {
      if (typeof v === 'number' && Number.isFinite(v)) {
        const arr = perMeasure.get(k) ?? []
        arr.push(v)
        perMeasure.set(k, arr)
      }
    }
  }
  const avgMeasures = new Map<string, number>()
  for (const [k, arr] of perMeasure) {
    const m = mean(arr)
    if (m != null) avgMeasures.set(k, m)
  }

  const withWeight = entries
    .filter(e => e.weightKg != null)
    .sort((a, b) => a.dateKey.localeCompare(b.dateKey))

  return {
    avgWeight: mean(weights),
    firstWeight: withWeight[0]?.weightKg ?? null,
    lastWeight: withWeight[withWeight.length - 1]?.weightKg ?? null,
    avgFat: mean(fats),
    avgMeasures,
    entries: entries.length
  }
}

interface TrainAgg {
  workouts: number
  durationMs: number
  volume: number
  sets: number
}

/** Etiqueta corta de una media: "82,4 kg" o "—". */
const kgLabel = (v: number | null) => (v == null ? '—' : `${formatKg(Number(v.toFixed(1)))} kg`)
const pctLabel = (v: number | null) => (v == null ? '—' : `${v.toFixed(1)}%`)

export default function LifeHistory() {
  const navigate = useNavigate()
  const today = useMemo(() => new Date(), [])
  const todayKey = dateKey(today)
  const [view, setView] = useState<View>('mes')
  const [cursor, setCursor] = useState(() => new Date())

  const range = useMemo(() => {
    if (view === 'semana') {
      const start = startOfWeek(cursor)
      return { start, end: addDays(start, 6) }
    }
    if (view === 'mes') {
      return {
        start: atNoon(cursor.getFullYear(), cursor.getMonth(), 1),
        end: atNoon(cursor.getFullYear(), cursor.getMonth() + 1, 0)
      }
    }
    return { start: atNoon(cursor.getFullYear(), 0, 1), end: atNoon(cursor.getFullYear(), 11, 31) }
  }, [view, cursor])

  // El cursor equivalente del periodo anterior, para las comparaciones.
  const prevCursor = useMemo(
    () => view === 'semana' ? addDays(cursor, -7) : view === 'mes' ? addMonths(cursor, -1) : addMonths(cursor, -12),
    [view, cursor]
  )
  const prevRange = useMemo(() => {
    if (view === 'semana') {
      const start = startOfWeek(prevCursor)
      return { start, end: addDays(start, 6) }
    }
    if (view === 'mes') {
      return {
        start: atNoon(prevCursor.getFullYear(), prevCursor.getMonth(), 1),
        end: atNoon(prevCursor.getFullYear(), prevCursor.getMonth() + 1, 0)
      }
    }
    return { start: atNoon(prevCursor.getFullYear(), 0, 1), end: atNoon(prevCursor.getFullYear(), 11, 31) }
  }, [view, prevCursor])

  const fromKey = dateKey(range.start)
  const toKey = dateKey(range.end)
  const prevFrom = dateKey(prevRange.start)
  const prevTo = dateKey(prevRange.end)

  const data = useLiveQuery(async () => {
    const allBody = (await db.body.toArray()).filter(b => !b.deletedAt)
    const inRange = (from: string, to: string) => allBody.filter(b => b.dateKey >= from && b.dateKey <= to)

    const workouts = (await db.workouts.toArray()).filter(w => !w.deletedAt && w.finishedAt)
    const sets = (await db.sets.toArray()).filter(s => !s.deletedAt && s.done === 1 && s.type !== 'warmup')
    const trainIn = (from: string, to: string): TrainAgg => {
      const ws = workouts.filter(w => w.dateKey >= from && w.dateKey <= to)
      const ids = new Set(ws.map(w => w.id))
      let durationMs = 0
      for (const w of ws) durationMs += (w.finishedAt ?? 0) - w.startedAt
      let volume = 0
      let count = 0
      for (const s of sets) {
        if (!ids.has(s.workoutId)) continue
        volume += s.weight * s.reps
        count++
      }
      return { workouts: ws.length, durationMs, volume: Math.round(volume), sets: count }
    }

    const current = inRange(fromKey, toKey)
    return {
      body: aggregateBody(current),
      bodyPrev: aggregateBody(inRange(prevFrom, prevTo)),
      train: trainIn(fromKey, toKey),
      trainPrev: trainIn(prevFrom, prevTo),
      points: current
        .filter(e => e.weightKg != null)
        .sort((a, b) => a.dateKey.localeCompare(b.dateKey))
        .map<Point>(e => ({
          x: new Date(`${e.dateKey}T12:00:00`).getTime(),
          y: e.weightKg as number,
          label: formatDateEs(e.dateKey)
        }))
    }
  }, [fromKey, toKey, prevFrom, prevTo], undefined)

  const move = (dir: -1 | 1) => setCursor(c =>
    view === 'semana' ? addDays(c, dir * 7) : view === 'mes' ? addMonths(c, dir) : addMonths(c, dir * 12)
  )
  const atPresent = toKey >= todayKey

  const label = view === 'semana'
    ? `${range.start.getDate()} ${MESES[range.start.getMonth()]} – ${range.end.getDate()} ${MESES[range.end.getMonth()]} ${range.end.getFullYear()}`
    : view === 'mes'
      ? `${monthName(cursor)} ${cursor.getFullYear()}`
      : `${cursor.getFullYear()}`

  const body = data?.body
  const bodyPrev = data?.bodyPrev
  const train = data?.train
  const trainPrev = data?.trainPrev

  // Cambio de peso dentro del periodo (ultimo menos primero registro).
  const weightChange = body && body.firstWeight != null && body.lastWeight != null
    ? Number((body.lastWeight - body.firstWeight).toFixed(1))
    : null

  // Union de medidas presentes en este periodo o el anterior, en orden conocido.
  const measureKeys = useMemo(() => {
    const keys = new Set<string>()
    for (const k of body?.avgMeasures.keys() ?? []) keys.add(k)
    for (const k of bodyPrev?.avgMeasures.keys() ?? []) keys.add(k)
    const known = Object.keys(MEASURE_LABEL)
    return [...keys].sort((a, b) => {
      const ia = known.indexOf(a), ib = known.indexOf(b)
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib)
    })
  }, [body, bodyPrev])

  const hasBody = (body?.entries ?? 0) > 0
  const hasTrain = (train?.workouts ?? 0) > 0

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Historial de vida"
        subtitle="Como ibas evolucionando, periodo a periodo"
        onBack={() => navigate('/estadisticas')}
      />

      <div className="space-y-4 px-4 pb-8 md:px-8">
        <div className="flex gap-1 rounded-xl bg-ink-900 p-1 md:max-w-sm">
          {VIEWS.map(v => (
            <button
              key={v.key}
              onClick={() => { setView(v.key); setCursor(new Date()) }}
              className={cx(
                'flex-1 rounded-lg py-2 text-sm transition-colors',
                view === v.key ? 'bg-ink-800 text-ink-100' : 'text-ink-500'
              )}
            >
              {v.label}
            </button>
          ))}
        </div>

        <Card className="p-4">
          <div className="flex items-center justify-between gap-2">
            <button
              onClick={() => move(-1)}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-300 hover:bg-ink-800"
              aria-label="Periodo anterior"
            >‹</button>
            <p className="text-center text-sm font-medium capitalize">{label}</p>
            <button
              onClick={() => move(1)}
              disabled={atPresent}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-300 enabled:hover:bg-ink-800 disabled:opacity-30"
              aria-label="Periodo siguiente"
            >›</button>
          </div>
        </Card>

        {!data ? (
          <Card className="p-8 text-center text-sm text-ink-500">Cargando…</Card>
        ) : !hasBody && !hasTrain ? (
          <Empty
            title="Nada en este periodo"
            hint="Prueba a moverte a otro tramo con las flechas, o cambia la vista. Anota tu peso en Medidas para ver tu evolucion aqui."
          />
        ) : (
          <div className="space-y-4 lg:grid lg:grid-cols-2 lg:items-start lg:gap-4 lg:space-y-0">
            {/* Cuerpo */}
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                <StatTile label="Peso medio" value={kgLabel(body?.avgWeight ?? null)} prev={kgLabel(bodyPrev?.avgWeight ?? null)} />
                <StatTile
                  label="Cambio en el periodo"
                  value={weightChange == null ? '—' : `${weightChange >= 0 ? '+' : ''}${formatKg(weightChange)} kg`}
                />
                <StatTile label="Grasa media" value={pctLabel(body?.avgFat ?? null)} prev={pctLabel(bodyPrev?.avgFat ?? null)} />
                <StatTile label="Registros" value={String(body?.entries ?? 0)} />
              </div>

              {(data.points.length >= 2) ? (
                <Card className="p-4">
                  <p className="mb-3 text-sm text-ink-500">Peso en el periodo</p>
                  <LineChart points={data.points} unit=" kg" />
                </Card>
              ) : hasBody ? (
                <Card className="p-4 text-center text-sm text-ink-500">
                  Con un par de pesos mas en este periodo veras aqui la curva.
                </Card>
              ) : (
                <Card className="p-4 text-center text-sm text-ink-500">
                  Sin registros de peso en este periodo.
                </Card>
              )}

              {measureKeys.length > 0 && (
                <Card className="p-4">
                  <p className="mb-3 text-sm text-ink-500">Medidas medias (cm)</p>
                  <div className="space-y-2">
                    {measureKeys.map(k => {
                      const cur = body?.avgMeasures.get(k) ?? null
                      const prev = bodyPrev?.avgMeasures.get(k) ?? null
                      const diff = cur != null && prev != null ? Number((cur - prev).toFixed(1)) : null
                      return (
                        <div key={k} className="flex items-center justify-between gap-3 border-b border-ink-850 pb-2 last:border-0 last:pb-0">
                          <span className="text-sm">{MEASURE_LABEL[k] ?? cap(k)}</span>
                          <span className="flex items-baseline gap-2 tabular-nums">
                            <span className="text-sm font-semibold">{cur == null ? '—' : cur.toFixed(1)}</span>
                            {diff != null && diff !== 0 && (
                              <span className={cx('text-xs', diff > 0 ? 'text-amber-300' : 'text-emerald-300')}>
                                {diff > 0 ? '+' : ''}{diff.toFixed(1)}
                              </span>
                            )}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </Card>
              )}
            </div>

            {/* Entreno */}
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                <StatTile label="Entrenos" value={String(train?.workouts ?? 0)} prev={String(trainPrev?.workouts ?? 0)} />
                <StatTile label="Series" value={String(train?.sets ?? 0)} prev={String(trainPrev?.sets ?? 0)} />
                <StatTile
                  label="Volumen"
                  value={`${(train?.volume ?? 0).toLocaleString('es-ES')} kg`}
                  prev={`${(trainPrev?.volume ?? 0).toLocaleString('es-ES')} kg`}
                />
                <StatTile
                  label="Tiempo entrenado"
                  value={formatDuration(train?.durationMs ?? 0)}
                  prev={formatDuration(trainPrev?.durationMs ?? 0)}
                />
              </div>

              {!hasTrain && (
                <Card className="p-4 text-center text-sm text-ink-500">
                  No entrenaste en este periodo.
                </Card>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
