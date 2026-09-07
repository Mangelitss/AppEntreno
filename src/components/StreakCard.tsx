import { MAX_GAP_DAYS, type Streak } from '../lib/streak'
import { formatDateEs } from '../lib/stats'
import { Card, cx } from './ui'

/**
 * Racha de entrenos en Hoy.
 *
 * El mensaje cambia segun lo cerca que estes de perderla: mientras hay margen
 * es informativo, y solo aprieta cuando de verdad queda un dia.
 */
export default function StreakCard({ streak, onRecover }: { streak: Streak; onRecover: () => void }) {
  const { days, alive, trainedToday, daysLeft, best, startedOn } = streak

  const urgent = alive && daysLeft === 0 && !trainedToday
  const warning = alive && daysLeft === 1 && !trainedToday

  const message = !alive
    ? days === 0 && best === 0
      ? 'Entrena hoy y empieza tu racha'
      : 'Racha perdida. Entrena hoy y empiezas otra'
    : trainedToday
      ? `Ya has entrenado hoy. Aguanta ${MAX_GAP_DAYS} dias mas sin pisar el gimnasio`
      : urgent
        ? 'Hoy es el ultimo dia para no perderla'
        : `Te quedan ${daysLeft} ${daysLeft === 1 ? 'dia' : 'dias'} para entrenar y mantenerla`

  return (
    <Card className={cx(
      'p-4',
      urgent ? 'border-amber-500/40 bg-amber-500/5'
        : alive ? 'border-ink-800' : 'border-ink-800'
    )}>
      <div className="flex items-center gap-4">
        <div className={cx(
          'flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-2xl',
          alive ? 'bg-accent/15 text-accent' : 'bg-ink-850 text-ink-500'
        )}>
          <span className="text-2xl font-semibold leading-none tabular-nums">{days}</span>
          <span className="mt-0.5 text-[10px] uppercase tracking-wide">
            {days === 1 ? 'dia' : 'dias'}
          </span>
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">
            {alive ? 'Racha en marcha' : 'Sin racha'}
          </p>
          <p className={cx('mt-0.5 text-xs', urgent ? 'text-amber-300' : warning ? 'text-ink-300' : 'text-ink-500')}>
            {message}
          </p>
          <p className="mt-1 text-[11px] text-ink-500">
            {alive && startedOn && `Desde el ${formatDateEs(startedOn)}`}
            {alive && startedOn && best > 0 && ' · '}
            {best > 0 && `Tu mejor racha: ${best} ${best === 1 ? 'dia' : 'dias'}`}
          </p>
        </div>
      </div>

      <button
        onClick={onRecover}
        className="mt-3 w-full rounded-xl border border-ink-800 py-2 text-xs text-ink-300 transition-colors hover:bg-ink-850 hover:text-ink-100"
      >
        Se me olvido apuntar un entreno
      </button>
    </Card>
  )
}
