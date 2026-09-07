import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { onAuthChange, type AuthState } from '../db/auth'

const AuthContext = createContext<AuthState>({ status: 'cargando' })

/** Estado de sesion compartido por toda la app. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'cargando' })

  useEffect(() => onAuthChange(setState), [])

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  return useContext(AuthContext)
}
