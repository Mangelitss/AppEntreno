// ---------------------------------------------------------------------------
// Cuentas.
//
// Firebase guarda la sesion en el navegador, asi que una vez dentro puedes
// abrir la app sin cobertura y sigues identificado. Nada de esto bloquea la
// app: sin cuenta se entrena igual, y los datos viven en el dispositivo hasta
// que decidas registrarte.
// ---------------------------------------------------------------------------

import type { User } from 'firebase/auth'
import { authErrorEs, getFirebaseAuth, isCloudEnabled } from './firebase'

export type AuthState =
  | { status: 'local' }            // sin nube configurada
  | { status: 'cargando' }
  | { status: 'invitado' }         // hay nube, pero no has entrado
  | { status: 'dentro'; user: User }

export interface AuthResult {
  ok: boolean
  error?: string
  /** true cuando el alta requiere confirmar algo antes de continuar */
  needsConfirmation?: boolean
}

/** Envuelve una llamada a Firebase y devuelve su error ya traducido. */
async function attempt(run: () => Promise<void>): Promise<AuthResult> {
  try {
    await run()
    return { ok: true }
  } catch (error) {
    const raw = error instanceof Error
      ? ((error as { code?: string }).code ?? error.message)
      : String(error)
    return { ok: false, error: authErrorEs(raw) }
  }
}

export async function signUp(email: string, password: string, displayName: string): Promise<AuthResult> {
  const auth = await getFirebaseAuth()
  if (!auth) return { ok: false, error: 'La nube no esta configurada' }

  const { createUserWithEmailAndPassword, updateProfile } = await import('firebase/auth')

  return attempt(async () => {
    const credential = await createUserWithEmailAndPassword(auth, email.trim(), password)
    const name = displayName.trim()
    if (name) await updateProfile(credential.user, { displayName: name })
  })
}

export async function signIn(email: string, password: string): Promise<AuthResult> {
  const auth = await getFirebaseAuth()
  if (!auth) return { ok: false, error: 'La nube no esta configurada' }

  const { signInWithEmailAndPassword } = await import('firebase/auth')
  return attempt(async () => { await signInWithEmailAndPassword(auth, email.trim(), password) })
}

export async function signOut(): Promise<void> {
  const auth = await getFirebaseAuth()
  if (!auth) return
  const { signOut: out } = await import('firebase/auth')
  await out(auth)
}

export async function resetPassword(email: string): Promise<AuthResult> {
  const auth = await getFirebaseAuth()
  if (!auth) return { ok: false, error: 'La nube no esta configurada' }

  const { sendPasswordResetEmail } = await import('firebase/auth')
  return attempt(async () => { await sendPasswordResetEmail(auth, email.trim()) })
}

export async function updatePassword(password: string): Promise<AuthResult> {
  const auth = await getFirebaseAuth()
  if (!auth?.currentUser) return { ok: false, error: 'No hay sesion iniciada' }

  const { updatePassword: update } = await import('firebase/auth')
  return attempt(async () => { await update(auth.currentUser!, password) })
}

/**
 * Cambiar el email manda antes un correo de verificacion a la direccion nueva.
 * Hasta que no se abra ese enlace, la cuenta sigue con el email anterior.
 */
export async function updateEmail(email: string): Promise<AuthResult> {
  const auth = await getFirebaseAuth()
  if (!auth?.currentUser) return { ok: false, error: 'No hay sesion iniciada' }

  const { verifyBeforeUpdateEmail } = await import('firebase/auth')
  const result = await attempt(async () => {
    await verifyBeforeUpdateEmail(auth.currentUser!, email.trim())
  })
  return result.ok ? { ...result, needsConfirmation: true } : result
}

export async function updateDisplayName(displayName: string): Promise<AuthResult> {
  const auth = await getFirebaseAuth()
  if (!auth?.currentUser) return { ok: false, error: 'No hay sesion iniciada' }

  const { updateProfile } = await import('firebase/auth')
  return attempt(async () => {
    await updateProfile(auth.currentUser!, { displayName: displayName.trim() || null })
  })
}

/**
 * Avisa de los cambios de sesion: al entrar, al salir y al refrescarse el
 * token. Devuelve la funcion para dejar de escuchar.
 */
export function onAuthChange(handler: (state: AuthState) => void): () => void {
  if (!isCloudEnabled()) {
    handler({ status: 'local' })
    return () => {}
  }

  handler({ status: 'cargando' })

  let unsubscribe: (() => void) | null = null
  let cancelled = false

  void (async () => {
    const auth = await getFirebaseAuth()
    if (!auth || cancelled) return

    const { onAuthStateChanged } = await import('firebase/auth')
    const stop = onAuthStateChanged(auth, user => {
      handler(user ? { status: 'dentro', user } : { status: 'invitado' })
    })

    if (cancelled) stop(); else unsubscribe = stop
  })()

  return () => { cancelled = true; unsubscribe?.() }
}

/** Nombre que puso al registrarse, si lo hay. */
export function displayNameOf(user: User | null): string | null {
  const name = user?.displayName
  return typeof name === 'string' && name.trim() ? name.trim() : null
}
