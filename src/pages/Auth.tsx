import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { resetPassword, signIn, signUp } from '../db/auth'
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

export default function Auth() {
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
