import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { dateKey, softDelete } from '../db/repo'
import { upsertBodyEntry } from '../db/actions'
import { formatDateEs, formatKg } from '../lib/stats'
import LineChart, { type Point } from '../components/LineChart'
import { Button, Card, Empty, Input, Label, Sheet } from '../components/ui'
import { PageHeader } from '../components/Layout'

const MEASURES = [
  { key: 'pecho', label: 'Pecho' },
  { key: 'cintura', label: 'Cintura' },
  { key: 'cadera', label: 'Cadera' },
  { key: 'brazo', label: 'Brazo' },
  { key: 'muslo', label: 'Muslo' }
]

export default function Body() {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ dateKey: dateKey(), weight: '', fat: '', notes: '' })
  const [measures, setMeasures] = useState<Record<string, string>>({})

  const entries = useLiveQuery(
    async () => (await db.body.toArray()).filter(b => !b.deletedAt).sort((a, b) => a.dateKey.localeCompare(b.dateKey)),
    [], []
  )

  const points: Point[] = useMemo(
    () => (entries ?? [])
      .filter(e => e.weightKg !== null)
      .map(e => ({ x: new Date(e.dateKey).getTime(), y: e.weightKg as number, label: formatDateEs(e.dateKey) })),
    [entries]
  )

  const latest = (entries ?? [])[(entries ?? []).length - 1]
  const first = (entries ?? [])[0]

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

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Peso corporal"
        subtitle="Un registro por dia, con medidas si te apetece"
        action={<Button variant="primary" onClick={openForm}>Anotar</Button>}
      />

      <div className="space-y-4 px-4 pb-8 md:px-8">
        {points.length > 0 && (
          <Card className="p-4">
            <div className="mb-3 flex items-baseline justify-between">
              <div>
                <p className="text-3xl font-semibold">{formatKg(latest?.weightKg ?? 0)} <span className="text-base text-ink-500">kg</span></p>
                <p className="text-xs text-ink-500">Ultimo registro · {latest && formatDateEs(latest.dateKey)}</p>
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

        {(entries ?? []).length === 0 ? (
          <Empty
            title="Sin registros de peso"
            hint="Anota tu peso cada semana mas o menos: con 3 o 4 puntos la grafica ya dice algo."
            action={<Button variant="primary" onClick={openForm}>Anotar el primero</Button>}
          />
        ) : (
          <div className="space-y-2">
            {(entries ?? []).slice().reverse().map(entry => (
              <Card key={entry.id} className="flex items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="font-medium">
                    {entry.weightKg !== null ? `${formatKg(entry.weightKg)} kg` : 'Sin peso'}
                    {entry.bodyFat !== null && <span className="ml-2 text-sm text-ink-500">{entry.bodyFat}% grasa</span>}
                  </p>
                  <p className="text-sm text-ink-500">{formatDateEs(entry.dateKey)}</p>
                  {Object.keys(entry.measurements).length > 0 && (
                    <p className="mt-1 text-xs text-ink-500">
                      {Object.entries(entry.measurements).map(([k, v]) => `${k} ${v}cm`).join(' · ')}
                    </p>
                  )}
                  {entry.notes && <p className="mt-1 text-xs text-ink-500 italic">{entry.notes}</p>}
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

      <Sheet open={open} onClose={() => setOpen(false)} title="Anotar peso">
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
            <Label>Medidas (cm) opcional</Label>
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
