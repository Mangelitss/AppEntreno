import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, getProfile, saveProfile } from '../db/db'
import { dateKey, softDelete } from '../db/repo'
import { upsertBodyEntry } from '../db/actions'
import { formatDateEs, formatKg } from '../lib/stats'
import {
  ageFrom, bmi, bmiBand, composition, formatRatio, waistToHeight, waistToHeightBand
} from '../lib/body'
import { DIRECTION_LABEL, goalDirection, goalSeries, goalStats } from '../lib/goal'
import LineChart, { type Point } from '../components/LineChart'
import { PageHeader } from '../components/Layout'
import { Button, Card, Empty, Input, Label, Pill, Sheet } from '../components/ui'
import type { Profile } from '../db/types'

const MEASURES = [
  { key: 'pecho', label: 'Pecho' },
  { key: 'cintura', label: 'Cintura' },
  { key: 'cadera', label: 'Cadera' },
  { key: 'brazo', label: 'Brazo' },
  { key: 'muslo', label: 'Muslo' }
]

/** Tarjetita de una metrica calculada. */
function Metric({
  value, unit, label, band, hint
}: {
  value: string
  unit?: string
  label: string
  band?: { label: string; tone: 'good' | 'warn' | 'bad' | 'default' } | null
  hint?: string
}) {
  return (
    <Card className="p-4">
      <p className="text-2xl font-semibold tabular-nums">
        {value}
        {unit && <span className="ml-1 text-sm font-normal text-ink-500">{unit}</span>}
      </p>
      <p className="mt-0.5 text-xs text-ink-500">{label}</p>
      {band && <div className="mt-2"><Pill tone={band.tone}>{band.label}</Pill></div>}
      {hint && <p className="mt-2 text-[11px] leading-snug text-ink-500">{hint}</p>}
    </Card>
  )
}

export default function Body() {
  const [open, setOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [form, setForm] = useState({ dateKey: dateKey(), weight: '', fat: '', notes: '' })
  const [measures, setMeasures] = useState<Record<string, string>>({})
  const [profileForm, setProfileForm] = useState({ height: '', sex: '', birthDate: '' })
  const [searchDate, setSearchDate] = useState('')

  const entries = useLiveQuery(
    async () => (await db.body.toArray()).filter(b => !b.deletedAt).sort((a, b) => a.dateKey.localeCompare(b.dateKey)),
    [], []
  )
  const profile = useLiveQuery(() => getProfile(), [])

  const points: Point[] = useMemo(
    () => (entries ?? [])
      .filter(e => e.weightKg !== null)
      .map(e => ({ x: new Date(e.dateKey).getTime(), y: e.weightKg as number, label: formatDateEs(e.dateKey) })),
    [entries]
  )

  const latest = (entries ?? [])[(entries ?? []).length - 1]
  const first = (entries ?? [])[0]

  const height = profile?.heightCm ?? null
  const age = ageFrom(profile?.birthDate ?? null)

  // Todas las metricas salen del ultimo registro cruzado con el perfil.
  const imc = bmi(latest?.weightKg ?? null, height)
  const ratio = waistToHeight(latest?.measurements?.cintura ?? null, height)
  const comp = composition(latest?.weightKg ?? null, latest?.bodyFat ?? null, height)
  const hasMetrics = imc !== null || ratio !== null || comp !== null

  // El objetivo se define en Progreso; aqui solo se refleja.
  const goal = profile?.goal ?? null
  const goalStat = goal ? goalStats(goal, entries ?? [], dateKey()) : null
  const goalPercentPoints: Point[] = useMemo(
    () => goal
      ? goalSeries(goal, entries ?? []).map(p => ({
          x: new Date(p.dateKey).getTime(), y: Number(p.percent.toFixed(1)), label: formatDateEs(p.dateKey)
        }))
      : [],
    [goal, entries]
  )

  // Buscador por fecha: si no hay registro justo ese dia, se muestra el mas cercano.
  const search = useMemo(() => {
    const all = (entries ?? []).slice().reverse() // del mas nuevo al mas viejo
    if (!searchDate) return { list: all, note: null as string | null }
    const exact = all.filter(e => e.dateKey === searchDate)
    if (exact.length) return { list: exact, note: null }
    const before = all.find(e => e.dateKey <= searchDate)
    if (before) return { list: [before], note: `No hay registro del ${formatDateEs(searchDate)}; te muestro el más cercano.` }
    const after = [...all].reverse().find(e => e.dateKey >= searchDate)
    return after
      ? { list: [after], note: `No hay registro del ${formatDateEs(searchDate)}; te muestro el más cercano.` }
      : { list: [], note: 'Sin registros para esa fecha.' }
  }, [entries, searchDate])

  function openForm() {
    const today = (entries ?? []).find(e => e.dateKey === dateKey())
    setForm({
      dateKey: dateKey(),
      weight: today?.weightKg != null ? String(today.weightKg) : '',
      fat: today?.bodyFat != null ? String(today.bodyFat) : '',
      notes: today?.notes ?? ''
    })
    setMeasures(Object.fromEntries(Object.entries(today?.measurements ?? {}).map(([k, v]) => [k, String(v)])))
    setOpen(true)
  }

  useEffect(() => {
    if (!profile) return
    setProfileForm({
      height: profile.heightCm != null ? String(profile.heightCm) : '',
      sex: profile.sex ?? '',
      birthDate: profile.birthDate ?? ''
    })
  }, [profile])

  async function save() {
    const parsed: Record<string, number> = {}
    for (const [k, v] of Object.entries(measures)) {
      const n = Number(v)
      if (v.trim() !== '' && Number.isFinite(n)) parsed[k] = n
    }
    await upsertBodyEntry({
      dateKey: form.dateKey,
      weightKg: form.weight.trim() === '' ? null : Number(form.weight),
      bodyFat: form.fat.trim() === '' ? null : Number(form.fat),
      measurements: parsed,
      notes: form.notes
    })
    setOpen(false)
  }

  async function saveProfileForm() {
    const height = Number(profileForm.height)
    await saveProfile({
      heightCm: profileForm.height.trim() === '' || !Number.isFinite(height) ? null : height,
      sex: (profileForm.sex || null) as Profile['sex'],
      birthDate: profileForm.birthDate || null
    })
    setProfileOpen(false)
  }

  const profileSummary = [
    height ? `${height} cm` : null,
    profile?.sex ? profile.sex.charAt(0).toUpperCase() + profile.sex.slice(1) : null,
    age !== null ? `${age} anos` : null
  ].filter(Boolean)

  return (
    <div className="mx-auto max-w-2xl lg:max-w-6xl">
      <PageHeader
        title="Medidas"
        subtitle="Tu perfil, el peso y los contornos"
        action={<Button variant="primary" onClick={openForm}>Anotar</Button>}
      />

      <div className="px-4 pb-8 md:px-8">
        <div className="lg:grid lg:grid-cols-2 lg:items-start lg:gap-6">
          {/* Izquierda: perfil, graficas y metricas */}
          <div className="mb-4 space-y-4 lg:mb-0">
            {/* Datos que no cambian de una semana a otra, y que hacen falta para el resto. */}
            <Card className="flex items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <p className="text-sm font-medium">Perfil</p>
                <p className="mt-0.5 truncate text-sm text-ink-500">
                  {profileSummary.length ? profileSummary.join(' · ') : 'Sin datos todavia'}
                </p>
                {!height && (
                  <p className="mt-1 text-[11px] text-amber-300">
                    Pon tu altura y apareceran el IMC y el ratio cintura/altura
                  </p>
                )}
              </div>
              <Button variant="outline" size="sm" onClick={() => setProfileOpen(true)}>Editar</Button>
            </Card>

            {points.length > 0 && (
              <Card className="p-4">
                <div className="mb-3 flex items-baseline justify-between">
                  <div>
                    <p className="text-3xl font-semibold">
                      {formatKg(latest?.weightKg ?? 0)} <span className="text-base text-ink-500">kg</span>
                    </p>
                    <p className="text-xs text-ink-500">
                      Ultimo registro · {latest && formatDateEs(latest.dateKey)}
                    </p>
                  </div>
                  {first && latest && first.weightKg !== null && latest.weightKg !== null && (
                    <p className="text-sm text-ink-500">
                      {latest.weightKg - first.weightKg >= 0 ? '+' : ''}
                      {formatKg(Number((latest.weightKg - first.weightKg).toFixed(1)))} kg desde el inicio
                    </p>
                  )}
                </div>
                <LineChart points={points} unit=" kg" />
              </Card>
            )}

            {/* Progreso al objetivo, que se fija en Progreso › Objetivo. */}
            {goal && goalStat && (
              <Card className="p-4">
                <div className="mb-3 flex items-baseline justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">Progreso al objetivo</p>
                    <p className="truncate text-xs text-ink-500">
                      {DIRECTION_LABEL[goalDirection(goal)]} · meta {formatKg(goal.targetWeightKg)} kg
                    </p>
                  </div>
                  <p className="shrink-0 text-3xl font-semibold text-accent">{Math.round(goalStat.percent)}%</p>
                </div>
                {goalPercentPoints.length > 1 ? (
                  <LineChart points={goalPercentPoints} unit=" %" />
                ) : (
                  <p className="py-6 text-center text-sm text-ink-500">
                    Con un par de pesos más verás aquí la curva de avance.
                  </p>
                )}
                <p className="mt-2 text-[11px] text-ink-500">Define y ajusta el objetivo en Progreso › Objetivo.</p>
              </Card>
            )}

            {hasMetrics && (
              <div className="grid grid-cols-2 gap-2">
                {imc !== null && (
                  <Metric
                    value={String(imc)} label="IMC" band={bmiBand(imc)}
                    hint="Con bastante musculo puede marcar sobrepeso siendo falso"
                  />
                )}
                {ratio !== null && (
                  <Metric
                    value={formatRatio(ratio)} label="Cintura / altura" band={waistToHeightBand(ratio)}
                    hint="Por debajo de 0,50 se considera saludable"
                  />
                )}
                {comp && (
                  <>
                    <Metric value={formatKg(comp.leanKg)} unit="kg" label="Masa magra" />
                    <Metric value={formatKg(comp.fatKg)} unit="kg" label="Masa grasa" />
                  </>
                )}
              </div>
            )}
          </div>

          {/* Derecha: buscador de fecha + historial */}
          <div className="space-y-3">
            <div>
              <Label>Buscar por fecha</Label>
              <div className="mt-1 flex items-center gap-2">
                <Input
                  type="date" value={searchDate} className="w-full"
                  onChange={e => setSearchDate(e.target.value)}
                />
                {searchDate && (
                  <Button variant="ghost" size="sm" onClick={() => setSearchDate('')} aria-label="Limpiar búsqueda">✕</Button>
                )}
              </div>
            </div>

            {(entries ?? []).length === 0 ? (
              <Empty
                title="Sin registros todavia"
                hint="Anota tu peso cada semana mas o menos: con 3 o 4 puntos la grafica ya dice algo."
                action={<Button variant="primary" onClick={openForm}>Anotar el primero</Button>}
              />
            ) : (
              <div className="space-y-2 lg:max-h-[calc(100vh-11rem)] lg:overflow-y-auto lg:pr-1">
                {search.note && <p className="px-1 text-xs text-amber-300">{search.note}</p>}
                {search.list.length === 0 ? (
                  <p className="px-1 py-6 text-center text-sm text-ink-500">Nada para esa fecha.</p>
                ) : search.list.map(entry => (
                  <Card key={entry.id} className="flex items-center justify-between gap-3 p-4">
                    <div className="min-w-0">
                      <p className="font-medium">
                        {entry.weightKg !== null ? `${formatKg(entry.weightKg)} kg` : 'Sin peso'}
                        {entry.bodyFat !== null && (
                          <span className="ml-2 text-sm text-ink-500">{entry.bodyFat}% grasa</span>
                        )}
                      </p>
                      <p className="text-sm text-ink-500">{formatDateEs(entry.dateKey)}</p>
                      {Object.keys(entry.measurements).length > 0 && (
                        <p className="mt-1 text-xs text-ink-500">
                          {Object.entries(entry.measurements).map(([k, v]) => `${k} ${v}cm`).join(' · ')}
                        </p>
                      )}
                      {entry.notes && <p className="mt-1 text-xs italic text-ink-500">{entry.notes}</p>}
                    </div>
                    <Button
                      variant="ghost" size="sm" className="text-red-300"
                      onClick={() => void softDelete('body', entry.id)}
                    >
                      ✕
                    </Button>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <Sheet open={profileOpen} onClose={() => setProfileOpen(false)} title="Tu perfil">
        <div className="space-y-4 p-5">
          <p className="text-sm text-ink-500">
            Esto se pone una vez. Se usa para calcular el IMC, el ratio cintura/altura y el
            reparto entre masa magra y grasa de todos tus registros, tambien los antiguos.
          </p>

          <label className="block space-y-1">
            <Label>Altura (cm)</Label>
            <Input
              type="number" inputMode="numeric" min={80} max={250} autoFocus
              value={profileForm.height} className="w-32"
              onChange={e => setProfileForm(f => ({ ...f, height: e.target.value }))}
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block space-y-1">
              <Label>Sexo</Label>
              <select
                value={profileForm.sex}
                onChange={e => setProfileForm(f => ({ ...f, sex: e.target.value }))}
                className="h-10 w-full rounded-xl border border-ink-700 bg-ink-850 px-2 text-sm"
              >
                <option value="">Sin indicar</option>
                <option value="hombre">Hombre</option>
                <option value="mujer">Mujer</option>
                <option value="otro">Otro</option>
              </select>
            </label>
            <label className="block space-y-1">
              <Label>Fecha de nacimiento</Label>
              <Input
                type="date" value={profileForm.birthDate} className="w-full"
                onChange={e => setProfileForm(f => ({ ...f, birthDate: e.target.value }))}
              />
            </label>
          </div>

          <Button variant="primary" className="w-full" onClick={() => void saveProfileForm()}>
            Guardar perfil
          </Button>
        </div>
      </Sheet>

      <Sheet open={open} onClose={() => setOpen(false)} title="Anotar medidas">
        <div className="space-y-4 p-5">
          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1">
              <Label>Fecha</Label>
              <Input
                type="date" value={form.dateKey} className="w-full"
                onChange={e => setForm(f => ({ ...f, dateKey: e.target.value }))}
              />
            </label>
            <label className="space-y-1">
              <Label>Peso (kg)</Label>
              <Input
                type="number" inputMode="decimal" step="0.1" autoFocus value={form.weight} className="w-full"
                onChange={e => setForm(f => ({ ...f, weight: e.target.value }))}
              />
            </label>
          </div>

          <label className="block space-y-1">
            <Label>Grasa corporal (%) opcional</Label>
            <Input
              type="number" inputMode="decimal" step="0.1" value={form.fat} className="w-full"
              onChange={e => setForm(f => ({ ...f, fat: e.target.value }))}
            />
          </label>

          <div>
            <Label>Contornos (cm) opcional</Label>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {MEASURES.map(m => (
                <label key={m.key} className="space-y-1">
                  <span className="text-xs text-ink-500">{m.label}</span>
                  <Input
                    type="number" inputMode="decimal" step="0.5" className="w-full"
                    value={measures[m.key] ?? ''}
                    onChange={e => setMeasures(prev => ({ ...prev, [m.key]: e.target.value }))}
                  />
                </label>
              ))}
            </div>
          </div>

          <label className="block space-y-1">
            <Label>Nota</Label>
            <Input
              value={form.notes} className="w-full" placeholder="En ayunas, despues de entrenar..."
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            />
          </label>

          <Button variant="primary" className="w-full" onClick={() => void save()}>Guardar</Button>
        </div>
      </Sheet>
    </div>
  )
}
