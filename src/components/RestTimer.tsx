import { useEffect, useRef, useState } from 'react'
import { Button, cx } from './ui'

/**
 * Cronometro de descanso. Arranca solo al confirmar una serie.
 * Usa timestamps en vez de contar ticks, asi que sigue siendo exacto aunque
 * bloquees el movil y el navegador congele el temporizador.
 */
export default function RestTimer({
  endsAt, onDismiss, onExtend
}: { endsAt: number | null; onDismiss: () => void; onExtend: (seconds: number) => void }) {
  const [remaining, setRemaining] = useState(0)
  const beeped = useRef(false)

  useEffect(() => {
    if (!endsAt) return
    beeped.current = false
    const tick = () => setRemaining(Math.max(0, Math.round((endsAt - Date.now()) / 1000)))
    tick()
    const id = setInterval(tick, 250)
    return () => clearInterval(id)
  }, [endsAt])

  useEffect(() => {
    if (!endsAt || remaining > 0 || beeped.current) return
    beeped.current = true
    if ('vibrate' in navigator) navigator.vibrate([180, 90, 180])
  }, [remaining, endsAt])

  if (!endsAt) return null

  const total = Math.max(1, Math.round((endsAt - Date.now()) / 1000) + 1)
  const pct = Math.max(0, Math.min(100, (remaining / total) * 100))
  const mm = Math.floor(remaining / 60)
  const ss = remaining % 60
  const done = remaining <= 0

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-ink-800 bg-ink-900/97 backdrop-blur safe-bottom">
      <div className="h-1 w-full bg-ink-800">
        <div
          className={cx('h-full transition-[width] duration-300', done ? 'bg-emerald-400' : 'bg-accent')}
          style={{ width: `${done ? 100 : 100 - pct}%` }}
        />
      </div>
      <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-3">
        <div className="flex-1">
          <div className={cx('font-mono text-2xl tabular-nums', done ? 'text-emerald-400' : 'text-ink-100')}>
            {done ? 'Listo' : `${mm}:${String(ss).padStart(2, '0')}`}
          </div>
          <div className="text-xs text-ink-500">Descanso</div>
        </div>
        <Button variant="outline" size="sm" onClick={() => onExtend(30)}>+30s</Button>
        <Button variant={done ? 'primary' : 'subtle'} size="sm" onClick={onDismiss}>Saltar</Button>
      </div>
    </div>
  )
}
