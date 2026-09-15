import { Card } from './ui'

/** Cifra de resumen, con una linea opcional de comparacion (→ periodo anterior). */
export default function StatTile({ label, value, prev }: { label: string; value: string; prev?: string }) {
  return (
    <Card className="p-4">
      <p className="text-sm text-ink-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {prev !== undefined && <p className="mt-0.5 text-xs text-ink-500">→ {prev}</p>}
    </Card>
  )
}
