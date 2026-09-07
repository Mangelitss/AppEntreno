import { useEffect, useRef, useState } from 'react'
import { Button, cx } from './ui'

/**
 * Cuenta atras del descanso, en el hueco central de la pantalla de entreno.
 *
 * Cuenta contra un timestamp en vez de acumular ticks: si bloqueas el movil y
 * el navegador congela los temporizadores, al volver el numero sigue siendo el
 * correcto en lugar de haberse quedado atras.
 */
export default function RestTimer({
  endsAt, totalSeconds, onDismiss, onExtend
}: {
  endsAt: number
  totalSeconds: number
  onDismiss: () => void
  onExtend: (seconds: number) => void
}) {
  const [remaining, setRemaining] = useState(() => Math.max(0, Math.round((endsAt - Date.now()) / 1000)))
  const alerted = useRef(false)

  useEffect(() => {
    const tick = () => setRemaining(Math.max(0, Math.round((endsAt - Date.now()) / 1000)))
    tick()
    const id = setInterval(tick, 200)
    return () => clearInterval(id)
  }, [endsAt])

  useEffect(() => {
    if (remaining > 0) { alerted.current = false; return }
    if (alerted.current) return
    alerted.current = true
    if ('vibrate' in navigator) navigator.vibrate([200, 100, 200])
  }, [remaining])

  const done = remaining <= 0
  const mm = Math.floor(remaining / 60)
  const ss = remaining % 60

  const RADIUS = 92
  const circumference = 2 * Math.PI * RADIUS
  const ratio = Math.max(0, Math.min(1, remaining / Math.max(1, totalSeconds)))

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative h-56 w-56">
        <svg viewBox="0 0 200 200" className="h-full w-full -rotate-90">
          <circle cx="100" cy="100" r={RADIUS} fill="none" stroke="var(--color-ink-800)" strokeWidth="10" />
          <circle
            cx="100" cy="100" r={RADIUS} fill="none" strokeWidth="10" strokeLinecap="round"
            stroke={done ? 'var(--color-emerald-400, #34d399)' : 'var(--color-accent)'}
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - ratio)}
            style={{ transition: 'stroke-dashoffset 0.2s linear' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={cx(
            'font-mono text-5xl font-semibold tabular-nums',
            done ? 'text-emerald-400' : 'text-ink-100'
          )}>
            {done ? '¡Ya!' : `${mm}:${String(ss).padStart(2, '0')}`}
          </span>
          <span className="mt-1 text-xs uppercase tracking-wide text-ink-500">
            {done ? 'Descanso terminado' : 'Descanso'}
          </span>
        </div>
      </div>

      <div className="flex gap-2">
        <Button variant="outline" onClick={() => onExtend(-15)} disabled={remaining <= 15}>−15s</Button>
        <Button variant="outline" onClick={() => onExtend(30)}>+30s</Button>
        <Button variant={done ? 'primary' : 'subtle'} onClick={onDismiss}>
          {done ? 'Seguir' : 'Saltar'}
        </Button>
      </div>
    </div>
  )
}
