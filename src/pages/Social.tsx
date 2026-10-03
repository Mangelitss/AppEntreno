// ---------------------------------------------------------------------------
// Social: los entrenos que van terminando tus amigos.
//
// Los posts de cada amigo cuelgan de su propia cuenta, asi que se piden por
// separado, una pagina de cada uno, y se mezclan por fecha con mergeFeed. Solo
// salen tus amigos: lo tuyo ya lo tienes en el historial.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { isCloudEnabled } from '../db/firebase'
import { fetchPosts } from '../db/social'
import { mergeFeed, type FeedStream } from '../lib/social'
import { useAuth } from '../components/AuthProvider'
import { useSocial } from '../components/SocialProvider'
import { AddFriend, FriendCode, FriendRequests, FriendsSheet } from '../components/Friends'
import PostCard from '../components/PostCard'
import { PageHeader } from '../components/Layout'
import { Button, Card, Empty, Label } from '../components/ui'

interface Stream extends FeedStream {
  /** donde seguir en la siguiente pagina de este amigo */
  cursor: unknown
  failed: boolean
}

/** Una pagina de un amigo. Si falla (por ejemplo, porque acabais de dejar de ser amigos), cuenta como vacia. */
async function loadPage(owner: string, cursor: unknown): Promise<Stream> {
  try {
    return { owner, ...(await fetchPosts(owner, cursor)), failed: false }
  } catch (error) {
    console.error('[social] no se pudieron leer los posts de', owner, error)
    return { owner, posts: [], cursor, exhausted: true, failed: true }
  }
}

/** El feed de varios amigos, por paginas. */
function useFeed(owners: string[]) {
  const key = [...owners].sort().join('|')
  const [streams, setStreams] = useState<Stream[]>([])
  const [loading, setLoading] = useState(false)
  // Si la lista de amigos cambia mientras se carga, lo que llegue tarde se tira.
  const generation = useRef(0)

  const reload = useCallback(async () => {
    const run = ++generation.current
    setLoading(true)
    const pages = await Promise.all((key ? key.split('|') : []).map(owner => loadPage(owner, null)))
    if (run !== generation.current) return
    setStreams(pages)
    setLoading(false)
  }, [key])

  const more = useCallback(async () => {
    const run = generation.current
    setLoading(true)
    const next = await Promise.all(streams.map(async stream => {
      if (stream.exhausted) return stream
      const page = await loadPage(stream.owner, stream.cursor)
      return { ...page, posts: [...stream.posts, ...page.posts] }
    }))
    if (run !== generation.current) return
    setStreams(next)
    setLoading(false)
  }, [streams])

  useEffect(() => { void reload() }, [reload])

  const feed = useMemo(() => mergeFeed(streams), [streams])
  const failed = streams.length > 0 && streams.every(stream => stream.failed)
  return { ...feed, loading, failed, reload, more }
}

export default function Social() {
  const navigate = useNavigate()
  const auth = useAuth()
  const social = useSocial()
  const [managing, setManaging] = useState(false)
  const friends = useMemo(() => social.lists.friends.map(entry => entry.uid), [social.lists.friends])
  const feed = useFeed(friends)
  const pending = social.lists.incoming.length

  // Nombres y fotos al dia cada vez que se entra: tus amigos pueden cambiarlos.
  useEffect(() => {
    if (social.enabled) void social.refreshProfiles()
  }, [social.enabled])

  const header = (
    <PageHeader
      title="Social"
      subtitle="Los entrenos de tus amigos"
      action={social.enabled ? (
        <div className="flex shrink-0 gap-1">
          <Button
            variant="ghost" aria-label="Actualizar" disabled={feed.loading}
            onClick={() => { void feed.reload(); void social.refreshProfiles() }}
          >
            ↻
          </Button>
          <Button variant="ghost" onClick={() => setManaging(true)}>
            Amigos{pending > 0 ? ` · ${pending}` : ''}
          </Button>
        </div>
      ) : undefined}
    />
  )

  if (!isCloudEnabled()) {
    return (
      <div className="mx-auto max-w-2xl">
        {header}
        <Empty
          title="Social necesita la nube"
          hint="Esta copia funciona en modo local, sin cuentas. Con Firebase configurado podrás añadir amigos y ver sus entrenos."
        />
      </div>
    )
  }

  if (auth.status !== 'dentro') {
    return (
      <div className="mx-auto max-w-2xl">
        {header}
        <Empty
          title="Inicia sesión para ver a tus amigos"
          hint="Social va con tu cuenta: tus amigos te añaden con tu código y ven los entrenos que terminas."
          action={<Button variant="primary" onClick={() => navigate('/entrar')}>Iniciar sesión</Button>}
        />
      </div>
    )
  }

  const warning = social.error ?? social.publishError

  return (
    <div className="mx-auto max-w-2xl">
      {header}

      <div className="space-y-4 px-4 pb-8 md:px-8">
        {warning && (
          <Card className="border-amber-500/30 bg-amber-500/5 p-4 text-sm text-amber-200">{warning}</Card>
        )}

        {pending > 0 && <Card className="p-4"><FriendRequests /></Card>}

        {social.loading ? (
          <p className="animate-pulse py-16 text-center text-ink-500">Cargando…</p>
        ) : friends.length === 0 ? (
          <Card className="space-y-5 p-5">
            <div>
              <p className="font-medium">Todavía no tienes amigos</p>
              <p className="mt-1 text-sm text-ink-500">
                Cuando alguien acepte tu solicitud, aquí irán saliendo los entrenos que termine, y
                a esa persona le saldrán los tuyos.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Tu código</Label>
              <FriendCode code={social.code} />
            </div>
            <div className="space-y-2">
              <Label>Añadir amigo</Label>
              <AddFriend />
            </div>
          </Card>
        ) : feed.items.length === 0 ? (
          feed.loading ? (
            <p className="animate-pulse py-16 text-center text-ink-500">Cargando entrenos…</p>
          ) : feed.failed ? (
            <Empty
              title="No se pudieron cargar los entrenos"
              hint="Comprueba la conexión y pulsa ↻ para volver a intentarlo."
            />
          ) : (
            <Empty
              title="Nada por aquí todavía"
              hint="Tus amigos aún no han terminado ningún entreno desde que usan Social. Saldrán aquí en cuanto lo hagan."
            />
          )
        ) : (
          <>
            {feed.items.map(item => (
              <PostCard
                key={`${item.owner}/${item.post.workoutId}`}
                post={item.post}
                profile={social.profiles.get(item.owner)}
                onOpenProfile={() => navigate(`/social/amigo/${item.owner}`)}
              />
            ))}
            {feed.hasMore && (
              <Button variant="outline" className="w-full" disabled={feed.loading} onClick={() => void feed.more()}>
                {feed.loading ? 'Cargando…' : 'Ver más'}
              </Button>
            )}
          </>
        )}
      </div>

      <FriendsSheet open={managing} onClose={() => setManaging(false)} />
    </div>
  )
}
