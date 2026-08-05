import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react'
import { useEffect } from 'react'

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}

type Variant = 'primary' | 'ghost' | 'outline' | 'danger' | 'subtle'

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent text-ink-950 hover:bg-cyan-300 active:bg-cyan-400 font-semibold',
  subtle: 'bg-ink-800 text-ink-100 hover:bg-ink-700 active:bg-ink-700',
  ghost: 'text-ink-300 hover:text-ink-100 hover:bg-ink-800',
  outline: 'border border-ink-700 text-ink-100 hover:bg-ink-800',
  danger: 'bg-red-500/15 text-red-300 hover:bg-red-500/25 border border-red-500/30'
}

export function Button({
  variant = 'subtle', className, size = 'md', ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' | 'lg' }) {
  const sizes = { sm: 'h-8 px-3 text-sm', md: 'h-10 px-4 text-sm', lg: 'h-12 px-5 text-base' }
  return (
    <button
      {...props}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-xl transition-colors',
        'disabled:opacity-40 disabled:pointer-events-none',
        sizes[size], VARIANTS[variant], className
      )}
    />
  )
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cx('rounded-2xl bg-ink-900 border border-ink-800', className)}>{children}</div>
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cx(
        'h-10 rounded-xl bg-ink-850 border border-ink-700 px-3 text-ink-100 placeholder:text-ink-500',
        'outline-none focus:border-accent/60 focus:ring-2 focus:ring-accent/20 transition',
        className
      )}
    />
  )
}

export function Label({ children }: { children: ReactNode }) {
  return <span className="text-xs uppercase tracking-wide text-ink-500">{children}</span>
}

export function Empty({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <p className="text-ink-300">{title}</p>
      {hint && <p className="max-w-xs text-sm text-ink-500">{hint}</p>}
      {action}
    </div>
  )
}

export function Sheet({
  open, onClose, title, children, wide
}: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = '' }
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center sm:justify-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className={cx(
        'relative w-full rise rounded-t-3xl sm:rounded-3xl bg-ink-900 border border-ink-800',
        'max-h-[88vh] flex flex-col', wide ? 'sm:max-w-3xl' : 'sm:max-w-lg'
      )}>
        <div className="flex items-center justify-between border-b border-ink-800 px-5 py-4">
          <h2 className="font-semibold">{title}</h2>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Cerrar">✕</Button>
        </div>
        <div className="flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  )
}

export function Pill({ children, tone = 'default' }: { children: ReactNode; tone?: 'default' | 'accent' | 'warn' | 'good' }) {
  const tones = {
    default: 'bg-ink-800 text-ink-300',
    accent: 'bg-accent/15 text-accent',
    warn: 'bg-amber-500/15 text-amber-300',
    good: 'bg-emerald-500/15 text-emerald-300'
  }
  return <span className={cx('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium', tones[tone])}>{children}</span>
}
