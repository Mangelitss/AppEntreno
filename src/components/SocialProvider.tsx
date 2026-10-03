// ---------------------------------------------------------------------------
// Estado de Social compartido por toda la app: tus amistades en directo, los
// perfiles de la gente que sale en ellas y tu codigo de amigo.
//
// Las amistades se escuchan en directo (son pocas y cambian poco) para que una
// solicitud nueva aparezca sin recargar, con su aviso en la barra de abajo.
// Los perfiles se piden una vez y se refrescan al abrir Social.
// ---------------------------------------------------------------------------

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { isCloudEnabled } from '../db/firebase'
import { fetchProfile, watchFriendships } from '../db/social'
import { NO_FRIENDS, partitionFriendships, type FriendLists, type Friendship, type PublicProfile } from '../lib/social'
import { useAuth } from './AuthProvider'

interface SocialContextValue {
  /** hay nube y sesion iniciada: Social se puede usar */
  enabled: boolean
  me: string | null
  /** tu codigo, cuando ya se ha reservado en la nube */
  code: string | null
  lists: FriendLists
  /** true hasta que llega la primera lista de amistades */
  loading: boolean
  /** fallo al escuchar las amistades */
  error: string | null
  /** el ultimo fallo al publicar lo tuyo, si lo hubo */
  publishError: string | null
  profiles: Map<string, PublicProfile>
  /** vuelve a pedir los perfiles indicados, o los de todos si no se indica */
  refreshProfiles: (uids?: string[]) => Promise<void>
}

const SocialContext = createContext<SocialContextValue>({
  enabled: false,
  me: null,
  code: null,
  lists: NO_FRIENDS,
  loading: false,
  error: null,
  publishError: null,
  profiles: new Map(),
  refreshProfiles: async () => {}
})

/** Todos los que aparecen en tus listas: amigos y solicitudes en los dos sentidos. */
function everyone(lists: FriendLists): string[] {
  return [...lists.friends, ...lists.incoming, ...lists.outgoing].map(entry => entry.uid)
}

export function SocialProvider({ children }: { children: ReactNode }) {
  const auth = useAuth()
  const me = auth.status === 'dentro' ? auth.user.uid : null
  const enabled = isCloudEnabled() && me !== null

  const [rows, setRows] = useState<Friendship[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [profiles, setProfiles] = useState<Map<string, PublicProfile>>(new Map())
  const requested = useRef(new Set<string>())

  const state = useLiveQuery(() => (me ? db.socialState.get(me) : undefined), [me])

  useEffect(() => {
    setRows(null)
    setError(null)
    setProfiles(new Map())
    requested.current = new Set()
    if (!me || !isCloudEnabled()) return

    return watchFriendships(me, list => { setRows(list); setError(null) }, setError)
  }, [me])

  const lists = useMemo(() => (me && rows ? partitionFriendships(rows, me) : NO_FRIENDS), [rows, me])

  const load = useCallback(async (uids: string[]) => {
    const found = await Promise.all(uids.map(uid => fetchProfile(uid).catch(() => null)))
    setProfiles(current => {
      const next = new Map(current)
      found.forEach((profile, i) => { if (profile) next.set(uids[i], profile) })
      return next
    })
  }, [])

  // Cada persona nueva que aparece en las listas se pide una sola vez.
  useEffect(() => {
    const missing = everyone(lists).filter(uid => !requested.current.has(uid))
    if (missing.length === 0) return
    for (const uid of missing) requested.current.add(uid)
    void load(missing)
  }, [lists, load])

  const refreshProfiles = useCallback(
    (uids?: string[]) => load(uids ?? everyone(lists)),
    [lists, load]
  )

  const value = useMemo<SocialContextValue>(() => ({
    enabled,
    me,
    code: state?.friendCode ?? null,
    lists,
    loading: enabled && rows === null && error === null,
    error,
    publishError: state?.lastError ?? null,
    profiles,
    refreshProfiles
  }), [enabled, me, state, lists, rows, error, profiles, refreshProfiles])

  return <SocialContext.Provider value={value}>{children}</SocialContext.Provider>
}

export function useSocial(): SocialContextValue {
  return useContext(SocialContext)
}
