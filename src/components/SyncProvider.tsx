import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { getSyncState } from '../db/db'
import { pendingCount, sync } from '../db/sync'
import { useAuth } from './AuthProvider'

interface SyncContextValue {
  lastSyncAt: number | null
  pending: number
  busy: boolean
  error: string | null
  syncNow: () => Promise<void>
}

const SyncContext = createContext<SyncContextValue>({
  lastSyncAt: null, pending: 0, busy: false, error: null, syncNow: async () => {}
})

/** Cada cuanto se reintenta por su cuenta, estando la app abierta. */
const INTERVAL_MS = 5 * 60 * 1000

export function SyncProvider({ children }: { children: ReactNode }) {
  const auth = useAuth()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const uid = auth.status === 'dentro' ? auth.user.uid : null
  const uidRef = useRef<string | null>(null)
  uidRef.current = uid

  const state = useLiveQuery(() => getSyncState(), [])
  const pending = useLiveQuery(() => (uid ? pendingCount() : Promise.resolve(0)), [uid, state], 0)

  const syncNow = useCallback(async () => {
    const current = uidRef.current
    if (!current) return

    setBusy(true)
    const report = await sync(current)
    setBusy(false)
    setError(report.ok ? null : report.error ?? 'Error al sincronizar')
  }, [])

  // Al entrar, al volver la conexion y cada pocos minutos.
  useEffect(() => {
    if (!uid) return

    void syncNow()
    const onOnline = () => void syncNow()
    window.addEventListener('online', onOnline)
    const timer = setInterval(() => { if (navigator.onLine) void syncNow() }, INTERVAL_MS)

    return () => {
      window.removeEventListener('online', onOnline)
      clearInterval(timer)
    }
  }, [uid, syncNow])

  return (
    <SyncContext.Provider
      value={{
        lastSyncAt: state?.lastSyncAt ?? null,
        pending: pending ?? 0,
        busy,
        error: error ?? state?.lastError ?? null,
        syncNow
      }}
    >
      {children}
    </SyncContext.Provider>
  )
}

export function useSync(): SyncContextValue {
  return useContext(SyncContext)
}
