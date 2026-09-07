import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, getProfile, saveProfile } from '../db/db'
import { dateKey } from '../db/repo'
import { displayNameOf, signOut, updateDisplayName, updateEmail, updatePassword } from '../db/auth'
import { isCloudEnabled } from '../db/firebase'
import { ageFrom } from '../lib/body'
import { computeStreak } from '../lib/streak'
import { formatDuration } from '../lib/stats'
import { dataUrlSizeKb, fileToStoredImage, ImageTooLargeError } from '../lib/image'
import { useAuth } from '../components/AuthProvider'
import { useSync } from '../components/SyncProvider'
import { PageHeader } from '../components/Layout'
import { Button, Card, Input, Label, Pill, Sheet } from '../components/ui'
import type { Profile as ProfileRow } from '../db/types'

/** Una cifra del resumen de actividad. */
function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="text-center">
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
      <p className="mt-0.5 text-xs text-ink-500">{label}</p>
    </div>
  )
}

export default function Profile() {
  const navigate = useNavigate()
  const auth = useAuth()
  const cloud = useSync()
  const [editing, setEditing] = useState(false)
  const [account, setAccount] = useState(false)
  const [form, setForm] = useState({ name: '', height: '', sex: '', birthDate: '' })
  const [accountForm, setAccountForm] = useState({ email: '', password: '' })
  const [status, setStatus] = useState('')
  const avatarInput = useRef<HTMLInputElement>(null)

  const profile = useLiveQuery(() => getProfile(), [])

  /** Todo el resumen sale de lo que ya hay guardado; no se almacena nada. */
  const activity = useLiveQuery(async () => {
    const workouts = (await db.workouts.toArray()).filter(w => !w.deletedAt && w.finishedAt)
    const totalMs = workouts.reduce((acc, w) => acc + ((w.finishedAt ?? 0) - w.startedAt), 0)
    return {
      count: workouts.length,
      totalMs,
      streak: computeStreak(workouts.map(w => w.dateKey), dateKey())
    }
  }, [], null)

  useEffect(() => {
    if (!profile) return
    setForm({
      name: profile.displayName ?? displayNameOf(auth.status === 'dentro' ? auth.user : null) ?? '',
      height: profile.heightCm != null ? String(profile.heightCm) : '',
      sex: profile.sex ?? '',
      birthDate: profile.birthDate ?? ''
    })
  }, [profile, auth])

  const age = ageFrom(profile?.birthDate ?? null)
  const email = auth.status === 'dentro' ? auth.user.email ?? '' : ''
  const name = profile?.displayName
    ?? displayNameOf(auth.status === 'dentro' ? auth.user : null)
    ?? 'Sin nombre'

  const initials = useMemo(
    () => name.split(/\s+/).slice(0, 2).map(w => w.charAt(0).toUpperCase()).join(''),
    [name]
  )

  async function saveForm() {
    const height = Number(form.height)
    await saveProfile({
      displayName: form.name.trim() || null,
      heightCm: form.height.trim() === '' || !Number.isFinite(height) ? null : height,
      sex: (form.sex || null) as ProfileRow['sex'],
      birthDate: form.birthDate || null
    })

    // El nombre tambien vive en la cuenta, que es lo que veran tus amigos.
    if (auth.status === 'dentro') await updateDisplayName(form.name)

    setEditing(false)
  }

  async function pickAvatar(file: File) {
    try {
      setStatus('Procesando foto…')
      const dataUrl = await fileToStoredImage(file, 256)
      await saveProfile({ avatarUrl: dataUrl })
      setStatus(`Guardada (${dataUrlSizeKb(dataUrl)} KB)`)
    } catch (error) {
      setStatus(error instanceof ImageTooLargeError ? error.message : 'No se pudo procesar la foto')
    }
  }

  async function saveAccount() {
    setStatus('')
    if (accountForm.email.trim() && accountForm.email.trim() !== email) {
      const result = await updateEmail(accountForm.email)
      if (!result.ok) { setStatus(result.error ?? 'No se pudo cambiar el email'); return }
      setStatus('Te hemos enviado un correo para confirmar el cambio')
    }
    if (accountForm.password) {
      const result = await updatePassword(accountForm.password)
      if (!result.ok) { setStatus(result.error ?? 'No se pudo cambiar la contrasena'); return }
      setStatus('Contrasena actualizada')
    }
    setAccountForm({ email: '', password: '' })
    setAccount(false)
  }

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Perfil"
        action={<Button variant="ghost" onClick={() => navigate('/ajustes')}>Ajustes</Button>}
      />

      <div className="space-y-4 px-4 pb-8 md:px-8">
        <Card className="p-5">
          <div className="flex items-center gap-4">
            <button
              onClick={() => avatarInput.current?.click()}
              className="relative h-20 w-20 shrink-0 overflow-hidden rounded-2xl bg-ink-800"
              aria-label="Cambiar foto"
            >
              {profile?.avatarUrl ? (
                <img src={profile.avatarUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="flex h-full w-full items-center justify-center text-2xl font-semibold text-ink-500">
                  {initials || '?'}
                </span>
              )}
              <span className="absolute inset-x-0 bottom-0 bg-black/60 py-0.5 text-[10px] text-white/80">
                Cambiar
              </span>
            </button>

            <div className="min-w-0 flex-1">
              <p className="truncate text-xl font-semibold">{name}</p>
              <p className="truncate text-sm text-ink-500">
                {email || (isCloudEnabled() ? 'Sin cuenta' : 'Modo local')}
              </p>
              <p className="mt-1 text-xs text-ink-500">
                {[
                  profile?.heightCm ? `${profile.heightCm} cm` : null,
                  profile?.sex ? profile.sex.charAt(0).toUpperCase() + profile.sex.slice(1) : null,
                  age !== null ? `${age} anos` : null
                ].filter(Boolean).join(' · ') || 'Sin datos corporales'}
              </p>
            </div>
          </div>

          <input
            ref={avatarInput} type="file" accept="image/*" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) void pickAvatar(f) }}
          />

          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>Editar perfil</Button>
            <Button variant="ghost" size="sm" onClick={() => navigate('/medidas')}>Ver medidas</Button>
          </div>

          {status && <p className="mt-3 text-xs text-accent">{status}</p>}
        </Card>

        {activity && (
          <Card className="p-5">
            <p className="mb-4 text-sm text-ink-500">Tu actividad</p>
            <div className="grid grid-cols-4 gap-2">
              <Stat value={String(activity.count)} label="entrenos" />
              <Stat value={String(activity.streak.days)} label="racha" />
              <Stat value={String(activity.streak.best)} label="mejor racha" />
              <Stat value={formatDuration(activity.totalMs)} label="acumulado" />
            </div>
          </Card>
        )}

        {/* Cuenta: cambia segun haya nube configurada y segun hayas entrado o no. */}
        {!isCloudEnabled() ? (
          <Card className="space-y-2 p-5">
            <div className="flex items-center gap-2">
              <h2 className="font-medium">Cuenta</h2>
              <Pill>modo local</Pill>
            </div>
            <p className="text-sm text-ink-500">
              Esta copia no tiene la nube configurada. Todo funciona, pero los datos viven solo
              en este dispositivo. Para activar cuentas hay que rellenar el fichero
              <code className="mx-1 rounded bg-ink-850 px-1">.env</code> con las credenciales de Firebase.
            </p>
          </Card>
        ) : auth.status === 'dentro' ? (
          <Card className="space-y-3 p-5">
            <div className="flex items-center gap-2">
              <h2 className="font-medium">Cuenta</h2>
              <Pill tone="good">sesion iniciada</Pill>
            </div>
            <p className="text-sm text-ink-500">{email}</p>

            <div className="rounded-xl bg-ink-850 p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm">
                    {cloud.busy ? 'Sincronizando…'
                      : cloud.pending > 0 ? `${cloud.pending} cambios por subir`
                      : 'Todo sincronizado'}
                  </p>
                  <p className="mt-0.5 text-xs text-ink-500">
                    {cloud.lastSyncAt
                      ? `Ultima vez ${new Date(cloud.lastSyncAt).toLocaleString('es-ES', {
                          day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
                        })}`
                      : 'Todavia no se ha sincronizado'}
                  </p>
                </div>
                <Button
                  variant="outline" size="sm" disabled={cloud.busy}
                  onClick={() => void cloud.syncNow()}
                >
                  Sincronizar
                </Button>
              </div>
              {cloud.error && <p className="mt-2 text-xs text-amber-300">{cloud.error}</p>}
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline" size="sm"
                onClick={() => { setAccountForm({ email, password: '' }); setAccount(true) }}
              >
                Email y contrasena
              </Button>
              <Button variant="ghost" size="sm" onClick={() => void signOut()}>Cerrar sesion</Button>
            </div>
          </Card>
        ) : (
          <Card className="space-y-3 p-5">
            <h2 className="font-medium">Crea tu cuenta</h2>
            <p className="text-sm text-ink-500">
              Ahora mismo entrenas sin cuenta y todo se guarda en este dispositivo. Con una
              cuenta tendras los mismos datos en el movil y en el ordenador, y no los perderas
              si cambias de telefono.
            </p>
            <Button variant="primary" onClick={() => navigate('/entrar')}>Registrarme o entrar</Button>
          </Card>
        )}
      </div>

      <Sheet open={editing} onClose={() => setEditing(false)} title="Editar perfil">
        <div className="space-y-4 p-5">
          <label className="block space-y-1">
            <Label>Nombre</Label>
            <Input
              autoFocus value={form.name} className="w-full"
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            />
          </label>

          <label className="block space-y-1">
            <Label>Altura (cm)</Label>
            <Input
              type="number" inputMode="numeric" min={80} max={250}
              value={form.height} className="w-32"
              onChange={e => setForm(f => ({ ...f, height: e.target.value }))}
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block space-y-1">
              <Label>Sexo</Label>
              <select
                value={form.sex}
                onChange={e => setForm(f => ({ ...f, sex: e.target.value }))}
                className="h-10 w-full rounded-xl border border-ink-700 bg-ink-850 px-2 text-sm"
              >
                <option value="">Sin indicar</option>
                <option value="hombre">Hombre</option>
                <option value="mujer">Mujer</option>
                <option value="otro">Otro</option>
              </select>
            </label>
            <label className="block space-y-1">
              <Label>Fecha de nacimiento</Label>
              <Input
                type="date" value={form.birthDate} className="w-full"
                onChange={e => setForm(f => ({ ...f, birthDate: e.target.value }))}
              />
            </label>
          </div>

          <p className="text-xs text-ink-500">
            La altura y el sexo son los mismos que usa la seccion de Medidas para el IMC y el
            resto de calculos.
          </p>

          <Button variant="primary" className="w-full" onClick={() => void saveForm()}>Guardar</Button>
        </div>
      </Sheet>

      <Sheet open={account} onClose={() => setAccount(false)} title="Email y contrasena">
        <div className="space-y-4 p-5">
          <label className="block space-y-1">
            <Label>Email</Label>
            <Input
              type="email" inputMode="email" value={accountForm.email} className="w-full"
              onChange={e => setAccountForm(f => ({ ...f, email: e.target.value }))}
            />
            <span className="block text-xs text-ink-500">
              Cambiarlo requiere confirmar desde el correo nuevo
            </span>
          </label>

          <label className="block space-y-1">
            <Label>Contrasena nueva</Label>
            <Input
              type="password" autoComplete="new-password" placeholder="Dejar vacio para no cambiarla"
              value={accountForm.password} className="w-full"
              onChange={e => setAccountForm(f => ({ ...f, password: e.target.value }))}
            />
          </label>

          <Button variant="primary" className="w-full" onClick={() => void saveAccount()}>Guardar</Button>
        </div>
      </Sheet>
    </div>
  )
}
