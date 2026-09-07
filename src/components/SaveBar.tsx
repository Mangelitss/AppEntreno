import { Button, cx } from './ui'

/**
 * Barra fija de guardado.
 *
 * Aparece solo cuando hay algo pendiente, para que el resto del tiempo no
 * estorbe. Deja claro que hasta darle a Guardar no se ha aplicado nada, que es
 * justo lo que despista de los formularios que guardan solos.
 */
export default function SaveBar({
  dirty, saving, onSave, secondary
}: {
  dirty: boolean
  saving?: boolean
  onSave: () => void
  secondary?: React.ReactNode
}) {
  if (!dirty) return null

  return (
    <div className="safe-bottom fixed inset-x-0 bottom-[68px] z-40 border-y border-amber-500/30 bg-ink-900/97 backdrop-blur md:bottom-0 md:border-b-0">
      <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3 md:px-8">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-amber-300">Cambios sin guardar</p>
          <p className="truncate text-xs text-ink-500">Si sales sin guardar se descartan</p>
        </div>
        {secondary}
        <Button variant="primary" disabled={saving} onClick={onSave} className={cx(saving && 'opacity-60')}>
          {saving ? 'Guardando…' : 'Guardar'}
        </Button>
      </div>
    </div>
  )
}
