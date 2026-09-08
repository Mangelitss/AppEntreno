import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { resetPassword, signIn, signInWithGoogle, signUp } from '../db/auth'
import { isCloudEnabled } from '../db/firebase'
import { useAuth } from '../components/AuthProvider'
import { PageHeader } from '../components/Layout'
import { Button, Card, Input, Label, cx } from '../components/ui'

type Mode = 'entrar' | 'registro' | 'recuperar'

const TITLES: Record<Mode, string> = {
  entrar: 'Iniciar sesion',
  registro: 'Crear cuenta',
  recuperar: 'Recuperar contrasena'
}

export default function Auth({ onSkip }: { onSkip?: () => void } = {}) {
  const navigate = useNavigate()
  const auth = useAuth()
  const [mode, setMode] = useState<Mode>('entrar')
  const [form, setForm] = useState({ name: '', email: '', password: '' })
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [busy, setBusy] = useState(false)

  if (auth.status === 'dentro') {
    navigate('/perfil', { replace: true })
  }

  async function submit() {
    setError(''); setInfo(''); setBusy(true)

    const result = mode === 'registro'
      ? await signUp(form.email, form.password, form.name)
      : mode === 'entrar'
        ? await signIn(form.email, form.password)
        : await resetPassword(form.email)

    setBusy(false)

    if (!result.ok) { setError(result.error ?? 'Algo ha fallado'); return }

    if (mode === 'recuperar') {
      setInfo('Te hemos enviado un correo con el enlace para cambiarla')
      return
    }
    if (result.needsConfirmation) {
      setInfo('Cuenta creada. Confirma el email desde el enlace que te hemos enviado y ya podras entrar')
      setMode('entrar')
      return
    }
    navigate('/perfil', { replace: true })
  }

  async function google() {
    setError(''); setInfo(''); setBusy(true)
    const result = await signInWithGoogle()
    setBusy(false)

    // Si la ventana se cerro sin entrar, no hay error que mostrar. Y si arranco
    // una redireccion, la pagina ya se esta yendo: onAuthChange hara el resto.
    if (!result.ok && result.error) { setError(result.error); return }
    if (result.ok) navigate('/perfil', { replace: true })
  }

  if (!isCloudEnabled()) {
    return (
      <div className="mx-auto max-w-lg">
        <PageHeader title="Cuentas" />
        <div className="px-4 md:px-8">
          <Card className="space-y-3 p-5">
            <p className="text-sm text-ink-300">La nube no esta configurada en esta copia de la app.</p>
            <p className="text-sm text-ink-500">
              Todo funciona igual y tus datos estan a salvo en este dispositivo, pero no hay
              cuentas ni sincronizacion hasta que se rellenen las credenciales en el fichero
              <code className="mx-1 rounded bg-ink-850 px-1">.env</code>.
            </p>
            <Button variant="outline" onClick={() => navigate('/perfil')}>Volver al perfil</Button>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-lg">
      <PageHeader title={TITLES[mode]} />

      <div className="px-4 pb-8 md:px-8">
        <Card className="space-y-4 p-5">
          {mode !== 'recuperar' && (
            <div className="flex gap-1 rounded-xl bg-ink-850 p-1">
              {(['entrar', 'registro'] as const).map(m => (
                <button
                  key={m}
                  onClick={() => { setMode(m); setError(''); setInfo('') }}
                  className={cx(
                    'flex-1 rounded-lg py-2 text-sm transition-colors',
                    mode === m ? 'bg-ink-800 text-ink-100' : 'text-ink-500'
                  )}
                >
                  {m === 'entrar' ? 'Ya tengo cuenta' : 'Soy nuevo'}
                </button>
              ))}
            </div>
          )}

          {mode === 'registro' && (
            <label className="block space-y-1">
              <Label>Como te llamas</Label>
              <Input
                autoFocus value={form.name} className="w-full" placeholder="Miguel Angel"
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              />
            </label>
          )}

          <label className="block space-y-1">
            <Label>Email</Label>
            <Input
              type="email" inputMode="email" autoComplete="email"
              value={form.email} className="w-full" placeholder="tu@correo.com"
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
            />
          </label>

          {mode !== 'recuperar' && (
            <label className="block space-y-1">
              <Label>Contrasena</Label>
              <Input
                type="password"
                autoComplete={mode === 'registro' ? 'new-password' : 'current-password'}
                value={form.password} className="w-full"
                onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                onKeyDown={e => { if (e.key === 'Enter') void submit() }}
              />
              {mode === 'registro' && (
                <span className="block text-xs text-ink-500">Al menos 6 caracteres</span>
              )}
            </label>
          )}

          {error && <p className="text-sm text-red-300">{error}</p>}
          {info && <p className="text-sm text-emerald-300">{info}</p>}

          <Button variant="primary" size="lg" className="w-full" disabled={busy} onClick={() => void submit()}>
            {busy ? 'Un momento…' : TITLES[mode]}
          </Button>

          {mode !== 'recuperar' && (
            <>
              <div className="flex items-center gap-3">
                <span className="h-px flex-1 bg-ink-800" />
                <span className="text-xs text-ink-500">o</span>
                <span className="h-px flex-1 bg-ink-800" />
              </div>

              <Button
                variant="outline" size="lg" className="w-full gap-2"
                disabled={busy} onClick={() => void google()}
              >
                <GoogleIcon />
                Continuar con Google
              </Button>
            </>
          )}

          {mode === 'entrar' && (
            <button
              onClick={() => { setMode('recuperar'); setError(''); setInfo('') }}
              className="w-full text-center text-xs text-ink-500 hover:text-ink-300"
            >
              He olvidado la contrasena
            </button>
          )}
          {mode === 'recuperar' && (
            <button
              onClick={() => { setMode('entrar'); setError(''); setInfo('') }}
              className="w-full text-center text-xs text-ink-500 hover:text-ink-300"
            >
              Volver a iniciar sesion
            </button>
          )}

          {onSkip && (
            <>
              <div className="flex items-center gap-3">
                <span className="h-px flex-1 bg-ink-800" />
              </div>
              <button
                onClick={onSkip}
                className="w-full text-center text-xs text-ink-500 hover:text-ink-300"
              >
                Continuar sin cuenta
              </button>
            </>
          )}
        </Card>

        <p className="mt-4 px-1 text-xs leading-relaxed text-ink-500">
          Puedes seguir usando la app sin cuenta: todo lo que entrenes se guarda en este
          dispositivo. Al registrarte, esos datos se suben y podras verlos tambien desde el
          ordenador.
        </p>
      </div>
    </div>
  )
}

/** Logo oficial de Google, con sus cuatro colores. */
function GoogleIcon() {
  return (
    <svg viewBox="0 0 18 18" width="18" height="18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z" />
      <path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.47.9 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z" />
    </svg>
  )
}
