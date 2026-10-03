// ---------------------------------------------------------------------------
// Gestion de amigos: tu codigo, anadir a alguien por el suyo, contestar
// solicitudes y la lista de amigos con su contador.
//
// La amistad es mutua: cuando alguien acepta tu solicitud, los dos veis los
// entrenos y los rangos del otro. Dejar de ser amigos lo corta para ambos.
// ---------------------------------------------------------------------------

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  acceptFriendRequest, findByCode, removeFriendship, sendFriendRequest, socialErrorEs
} from '../db/social'
import {
  formatFriendCode, isValidFriendCode, normalizeFriendCode, relationWith,
  type FriendEntry, type PublicProfile
} from '../lib/social'
import Avatar from './Avatar'
import { useSocial } from './SocialProvider'
import { Button, Card, Input, Label, Sheet } from './ui'

/** Copia al portapapeles, tambien sin https (la app abierta por la IP de la red local). */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    const area = document.createElement('textarea')
    area.value = text
    area.style.position = 'fixed'
    area.style.opacity = '0'
    document.body.appendChild(area)
    area.select()
    const ok = document.execCommand('copy')
    area.remove()
    return ok
  }
}

/** El enlace que abre la app con tu codigo ya puesto para mandarte la solicitud. */
export function friendLink(code: string): string {
  return `${window.location.origin}/amigo/${code}`
}

/** Tu codigo en grande, con Copiar y Compartir enlace. */
export function FriendCode({ code }: { code: string | null }) {
  const social = useSocial()
  const [note, setNote] = useState('')

  if (!code) {
    return (
      <p className="text-sm text-ink-500">
        {social.publishError ?? 'Se genera en cuanto la app sincroniza con la nube…'}
      </p>
    )
  }

  const pretty = formatFriendCode(code)

  async function copy() {
    setNote((await copyText(pretty)) ? 'Código copiado' : 'No se pudo copiar')
  }

  async function share() {
    const link = friendLink(code!)
    if (navigator.share) {
      try {
        await navigator.share({ title: 'AppEntreno', text: `Agrégame en AppEntreno con mi código ${pretty}`, url: link })
      } catch {
        // Cerrar el menu de compartir tambien llega como error: no es un fallo.
      }
      return
    }
    setNote((await copyText(link)) ? 'Enlace copiado' : 'No se pudo copiar')
  }

  return (
    <div>
      <p className="font-mono text-2xl font-semibold tracking-[0.2em] tabular-nums">{pretty}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => void copy()}>Copiar</Button>
        <Button variant="outline" size="sm" onClick={() => void share()}>Compartir enlace</Button>
      </div>
      {note && <p className="mt-2 text-xs text-accent">{note}</p>}
    </div>
  )
}

/** Busca a alguien por su codigo y le manda la solicitud (o acepta la suya). */
export function AddFriend({ initialCode = '', autoSearch = false }: { initialCode?: string; autoSearch?: boolean }) {
  const social = useSocial()
  const navigate = useNavigate()
  const [input, setInput] = useState(initialCode)
  const [found, setFound] = useState<PublicProfile | null>(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  async function search(raw: string) {
    setFound(null)
    setMessage('')
    const code = normalizeFriendCode(raw)
    if (!isValidFriendCode(code)) {
      setMessage('Un código son 8 letras y números, como K7Q2-XM9P')
      return
    }
    if (code === social.code) {
      setMessage('Ese es tu propio código')
      return
    }

    setBusy(true)
    try {
      const profile = await findByCode(code)
      if (!profile) setMessage('No hay nadie con ese código')
      else if (profile.uid === social.me) setMessage('Ese es tu propio código')
      else setFound(profile)
    } catch (error) {
      setMessage(socialErrorEs(error))
    } finally {
      setBusy(false)
    }
  }

  // Al llegar desde un enlace compartido, el codigo ya viene puesto.
  useEffect(() => {
    if (autoSearch && initialCode && social.enabled) void search(initialCode)
  }, [autoSearch, initialCode, social.enabled])

  const relation = found ? relationWith(social.lists, found.uid) : null

  async function act() {
    if (!found || !social.me || !relation) return
    setBusy(true)
    try {
      if (relation.kind === 'recibida') {
        await acceptFriendRequest(relation.friendship)
        setMessage('¡Ya sois amigos!')
      } else {
        await sendFriendRequest(social.me, found.uid)
        setMessage('Solicitud enviada. Cuando la acepte, veréis los entrenos del otro.')
      }
    } catch (error) {
      setMessage(socialErrorEs(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      <form
        className="flex gap-2"
        onSubmit={e => { e.preventDefault(); void search(input) }}
      >
        <Input
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Código de tu amigo"
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          className="min-w-0 flex-1 font-mono uppercase tracking-wider"
        />
        <Button type="submit" variant="subtle" disabled={busy || !input.trim()}>Buscar</Button>
      </form>

      {found && relation && (
        <div className="flex items-center gap-3 rounded-xl bg-ink-850 p-3">
          <Avatar name={found.displayName} url={found.avatarUrl} size={44} />
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{found.displayName ?? 'Sin nombre'}</p>
            <p className="text-xs text-ink-500">
              {relation.kind === 'amigos' ? 'Ya sois amigos'
                : relation.kind === 'enviada' ? 'Solicitud enviada, falta que la acepte'
                : relation.kind === 'recibida' ? 'Te ha enviado una solicitud'
                : 'Te verá cuando acepte tu solicitud'}
            </p>
          </div>
          {relation.kind === 'amigos' ? (
            <Button variant="outline" size="sm" onClick={() => navigate(`/social/amigo/${found.uid}`)}>Ver perfil</Button>
          ) : relation.kind === 'enviada' ? null : (
            <Button variant="primary" size="sm" disabled={busy} onClick={() => void act()}>
              {relation.kind === 'recibida' ? 'Aceptar' : 'Enviar solicitud'}
            </Button>
          )}
        </div>
      )}

      {message && <p className="text-xs text-accent">{message}</p>}
    </div>
  )
}

/** Una persona en una lista: foto, nombre, una linea de contexto y sus botones. */
function PersonRow({
  entry, hint, onOpen, children
}: {
  entry: FriendEntry
  hint?: string
  onOpen?: () => void
  children?: React.ReactNode
}) {
  const social = useSocial()
  const profile = social.profiles.get(entry.uid)
  const name = profile?.displayName ?? 'Sin nombre'

  const body = (
    <>
      <Avatar name={name} url={profile?.avatarUrl} size={40} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{name}</p>
        {hint && <p className="truncate text-xs text-ink-500">{hint}</p>}
      </div>
    </>
  )

  return (
    <li className="flex items-center gap-3 py-2">
      {onOpen ? (
        <button onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3 text-left">{body}</button>
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-3">{body}</div>
      )}
      <div className="flex shrink-0 gap-1.5">{children}</div>
    </li>
  )
}

function sinceLabel(timestamp: number | null): string | undefined {
  if (!timestamp) return undefined
  return `Desde el ${new Date(timestamp).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}`
}

/** Las solicitudes que te han mandado, con Aceptar y Rechazar. */
export function FriendRequests({ title = 'Solicitudes de amistad' }: { title?: string }) {
  const social = useSocial()
  const [error, setError] = useState('')

  if (social.lists.incoming.length === 0) return null

  async function run(action: () => Promise<void>) {
    setError('')
    try { await action() } catch (e) { setError(socialErrorEs(e)) }
  }

  return (
    <div>
      <Label>{title}</Label>
      <ul className="mt-1 divide-y divide-ink-850">
        {social.lists.incoming.map(entry => (
          <PersonRow key={entry.uid} entry={entry} hint="Quiere ser tu amigo">
            <Button variant="primary" size="sm" onClick={() => void run(() => acceptFriendRequest(entry.friendship))}>
              Aceptar
            </Button>
            <Button
              variant="ghost" size="sm" aria-label="Rechazar"
              onClick={() => void run(() => removeFriendship(entry.friendship))}
            >
              ✕
            </Button>
          </PersonRow>
        ))}
      </ul>
      {error && <p className="mt-1 text-xs text-amber-300">{error}</p>}
    </div>
  )
}

/** Todo lo de amigos en una hoja: tu codigo, anadir, solicitudes y la lista. */
export function FriendsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const social = useSocial()
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const { friends, outgoing } = social.lists

  async function run(action: () => Promise<void>) {
    setError('')
    try { await action() } catch (e) { setError(socialErrorEs(e)) }
  }

  function remove(entry: FriendEntry) {
    const name = social.profiles.get(entry.uid)?.displayName ?? 'esta persona'
    if (!confirm(`¿Eliminar a ${name} de tus amigos? Dejaréis de ver los entrenos del otro.`)) return
    void run(() => removeFriendship(entry.friendship))
  }

  return (
    <Sheet open={open} onClose={onClose} title="Amigos">
      <div className="space-y-6 p-5">
        <section className="space-y-2">
          <Label>Tu código</Label>
          <FriendCode code={social.code} />
        </section>

        <section className="space-y-2">
          <Label>Añadir amigo</Label>
          <AddFriend />
        </section>

        <FriendRequests title="Solicitudes recibidas" />

        {outgoing.length > 0 && (
          <section>
            <Label>Enviadas</Label>
            <ul className="mt-1 divide-y divide-ink-850">
              {outgoing.map(entry => (
                <PersonRow key={entry.uid} entry={entry} hint="Pendiente de que la acepte">
                  <Button variant="ghost" size="sm" onClick={() => void run(() => removeFriendship(entry.friendship))}>
                    Cancelar
                  </Button>
                </PersonRow>
              ))}
            </ul>
          </section>
        )}

        <section>
          <Label>Tus amigos ({friends.length})</Label>
          {friends.length === 0 ? (
            <p className="mt-2 text-sm text-ink-500">
              Todavía no tienes amigos. Pásale tu código a alguien o busca el suyo arriba.
            </p>
          ) : (
            <ul className="mt-1 divide-y divide-ink-850">
              {friends.map(entry => (
                <PersonRow
                  key={entry.uid}
                  entry={entry}
                  hint={sinceLabel(entry.friendship.acceptedAt)}
                  onOpen={() => { onClose(); navigate(`/social/amigo/${entry.uid}`) }}
                >
                  <Button variant="ghost" size="sm" onClick={() => remove(entry)}>Eliminar</Button>
                </PersonRow>
              ))}
            </ul>
          )}
        </section>

        {error && <p className="text-xs text-amber-300">{error}</p>}
      </div>
    </Sheet>
  )
}

/** La tarjeta del perfil: contador de amigos, tu codigo y el acceso a gestionarlos. */
export function FriendsCard() {
  const social = useSocial()
  const [open, setOpen] = useState(false)
  const count = social.lists.friends.length
  const pending = social.lists.incoming.length

  return (
    <Card className="p-5">
      <div className="flex items-center gap-4">
        <button
          onClick={() => setOpen(true)}
          className="w-20 shrink-0 rounded-2xl bg-ink-850 py-3 text-center transition-colors hover:bg-ink-800"
          aria-label="Gestionar amigos"
        >
          <p className="text-2xl font-semibold tabular-nums">{count}</p>
          <p className="text-xs text-ink-500">{count === 1 ? 'amigo' : 'amigos'}</p>
        </button>
        <div className="min-w-0 flex-1">
          <p className="mb-1 text-xs uppercase tracking-wide text-ink-500">Tu código de amigo</p>
          <FriendCode code={social.code} />
        </div>
      </div>

      {pending > 0 && (
        <button
          onClick={() => setOpen(true)}
          className="mt-4 w-full rounded-xl bg-accent/10 px-3 py-2 text-left text-sm text-accent transition-colors hover:bg-accent/15"
        >
          {pending === 1 ? 'Tienes 1 solicitud de amistad' : `Tienes ${pending} solicitudes de amistad`}
        </button>
      )}

      <div className="mt-4">
        <Button variant="outline" size="sm" onClick={() => setOpen(true)}>Gestionar amigos</Button>
      </div>

      <FriendsSheet open={open} onClose={() => setOpen(false)} />
    </Card>
  )
}
