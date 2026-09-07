import { useEffect, useMemo, useRef, useState } from 'react'
import { normalize } from '../lib/stats'
import { Label, cx } from './ui'

/**
 * Campo de eleccion con busqueda.
 *
 * Los valores se guardan tal cual estan en el dataset (en ingles): escribirlos
 * a mano es la forma mas facil de descuadrar la app, asi que lo normal es
 * elegir de la lista. Aun asi se puede escribir uno nuevo, y entonces se avisa
 * de que no existia para que veas si te has equivocado.
 *
 * `hint` devuelve la traduccion al espanol, que se muestra en gris al lado de
 * cada opcion pero no se guarda en ningun sitio.
 */
export function Combobox({
  label, value, options, onChange, hint, placeholder, allowEmpty
}: {
  label?: string
  value: string
  options: string[]
  onChange: (value: string) => void
  hint?: (value: string) => string
  placeholder?: string
  allowEmpty?: boolean
}) {
  const [draft, setDraft] = useState(value)
  const [open, setOpen] = useState(false)
  const container = useRef<HTMLDivElement>(null)

  useEffect(() => { setDraft(value) }, [value])

  useEffect(() => {
    if (!open) return
    const onClickOutside = (event: MouseEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [open])

  const matches = useMemo(() => {
    const query = normalize(draft.trim())
    if (!query) return options.slice(0, 60)
    return options
      .filter(option => normalize(option).includes(query) || normalize(hint?.(option) ?? '').includes(query))
      .slice(0, 60)
  }, [options, draft, hint])

  const typed = draft.trim().toLowerCase()
  const isNew = typed !== '' && !options.some(o => o.toLowerCase() === typed)
  const currentIsNew = value.trim() !== '' && !options.some(o => o.toLowerCase() === value.trim().toLowerCase())

  function commit(next: string) {
    const clean = next.trim().toLowerCase()
    setDraft(clean)
    setOpen(false)
    onChange(clean)
  }

  return (
    <div ref={container} className="relative">
      {label && <Label>{label}</Label>}
      <input
        value={draft}
        placeholder={placeholder}
        onFocus={() => setOpen(true)}
        onChange={e => { setDraft(e.target.value); setOpen(true) }}
        onKeyDown={e => {
          if (e.key === 'Enter') { e.preventDefault(); commit(matches[0] && !isNew ? matches[0] : draft) }
          if (e.key === 'Escape') { setDraft(value); setOpen(false) }
        }}
        onBlur={() => { if (!open) commit(draft) }}
        className={cx(
          'mt-1 h-10 w-full rounded-xl border bg-ink-850 px-3 text-ink-100 placeholder:text-ink-500',
          'outline-none transition focus:ring-2 focus:ring-accent/20',
          currentIsNew ? 'border-amber-500/50' : 'border-ink-700 focus:border-accent/60'
        )}
      />

      {currentIsNew && !open && (
        <p className="mt-1 text-[11px] text-amber-300">
          «{value}» no estaba en la lista. Se guardara como valor nuevo.
        </p>
      )}
      {!currentIsNew && value && hint?.(value) && !open && (
        <p className="mt-1 text-[11px] text-ink-500">{hint(value)}</p>
      )}

      {open && (
        <div className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-ink-700 bg-ink-900 shadow-xl">
          {isNew && (
            <button
              onMouseDown={e => e.preventDefault()}
              onClick={() => commit(draft)}
              className="flex w-full items-center gap-2 border-b border-ink-800 px-3 py-2.5 text-left text-sm hover:bg-ink-850"
            >
              <span className="text-amber-300">+</span>
              <span className="truncate">Usar «{draft.trim()}»</span>
              <span className="ml-auto shrink-0 text-[10px] uppercase tracking-wide text-amber-300">nuevo</span>
            </button>
          )}

          {allowEmpty && (
            <button
              onMouseDown={e => e.preventDefault()}
              onClick={() => commit('')}
              className="w-full px-3 py-2 text-left text-sm text-ink-500 hover:bg-ink-850"
            >
              Sin definir
            </button>
          )}

          {matches.map(option => (
            <button
              key={option}
              onMouseDown={e => e.preventDefault()}
              onClick={() => commit(option)}
              className={cx(
                'flex w-full items-baseline gap-2 px-3 py-2 text-left text-sm hover:bg-ink-850',
                option === value && 'bg-ink-850 text-accent'
              )}
            >
              <span className="truncate">{option}</span>
              {hint?.(option) && (
                <span className="ml-auto shrink-0 text-xs text-ink-500">{hint(option)}</span>
              )}
            </button>
          ))}

          {matches.length === 0 && !isNew && (
            <p className="px-3 py-4 text-center text-sm text-ink-500">Nada coincide</p>
          )}
        </div>
      )}
    </div>
  )
}

/** Varios valores de la misma lista, como etiquetas que se anaden y se quitan. */
export function TagCombobox({
  label, values, options, onChange, hint, placeholder
}: {
  label?: string
  values: string[]
  options: string[]
  onChange: (values: string[]) => void
  hint?: (value: string) => string
  placeholder?: string
}) {
  const available = options.filter(o => !values.includes(o))

  return (
    <div>
      {label && <Label>{label}</Label>}

      {values.length > 0 && (
        <div className="mb-2 mt-1 flex flex-wrap gap-1.5">
          {values.map(value => {
            const isNew = !options.some(o => o.toLowerCase() === value.toLowerCase())
            return (
              <span
                key={value}
                className={cx(
                  'inline-flex items-center gap-1.5 rounded-full py-1 pl-3 pr-1 text-xs',
                  isNew ? 'bg-amber-500/15 text-amber-300' : 'bg-ink-800 text-ink-300'
                )}
              >
                {value}
                {hint?.(value) && <span className="text-ink-500">{hint(value)}</span>}
                <button
                  onClick={() => onChange(values.filter(v => v !== value))}
                  className="flex h-5 w-5 items-center justify-center rounded-full hover:bg-ink-700"
                  aria-label={`Quitar ${value}`}
                >
                  ✕
                </button>
              </span>
            )
          })}
        </div>
      )}

      <Combobox
        value=""
        options={available}
        hint={hint}
        placeholder={placeholder ?? 'Anadir…'}
        onChange={value => { if (value && !values.includes(value)) onChange([...values, value]) }}
      />
    </div>
  )
}
