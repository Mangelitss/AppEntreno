// ---------------------------------------------------------------------------
// Conexion con Firebase.
//
// La nube es opcional a proposito. Sin credenciales configuradas la app
// funciona exactamente igual que siempre, con todo en el dispositivo: es el
// "modo local" con el que se entrena sin cuenta y con el que un amigo puede
// probarla antes de registrarse.
//
// Que la apiKey viaje en el navegador no es un descuido: en Firebase no es un
// secreto, solo identifica el proyecto. Lo que protege los datos son las
// reglas de firestore.rules, que no dejan leer una fila que no sea tuya.
// ---------------------------------------------------------------------------

import type { FirebaseApp } from 'firebase/app'
import type { Auth } from 'firebase/auth'
import type { Firestore } from 'firebase/firestore'

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string | undefined,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string | undefined,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined,
  appId: import.meta.env.VITE_FIREBASE_APP_ID as string | undefined
}

/** true si hay credenciales y por tanto se puede usar cuenta y sincronizacion. */
export function isCloudEnabled(): boolean {
  return Boolean(config.apiKey && config.projectId && config.appId)
}

let appPromise: Promise<FirebaseApp> | null = null

/**
 * El SDK se importa solo cuando hace falta: son cientos de KB que no tiene
 * sentido descargar en el gimnasio si entrenas sin cuenta.
 */
async function getApp(): Promise<FirebaseApp | null> {
  if (!isCloudEnabled()) return null

  appPromise ??= import('firebase/app').then(({ initializeApp, getApps, getApp: existing }) =>
    getApps().length ? existing() : initializeApp(config as Required<typeof config>)
  )

  return appPromise
}

export async function getFirebaseAuth(): Promise<Auth | null> {
  const app = await getApp()
  if (!app) return null
  const { getAuth } = await import('firebase/auth')
  return getAuth(app)
}

export async function getFirestore(): Promise<Firestore | null> {
  const app = await getApp()
  if (!app) return null
  const { getFirestore: firestore } = await import('firebase/firestore')
  return firestore(app)
}

/**
 * Traduce los codigos de Firebase a algo que se entienda en pantalla.
 * Llegan como "auth/invalid-credential" o dentro de un mensaje largo.
 */
export function authErrorEs(raw: string): string {
  const code = raw.toLowerCase()

  if (code.includes('invalid-credential') || code.includes('wrong-password') || code.includes('user-not-found')) {
    return 'Email o contrasena incorrectos'
  }
  if (code.includes('email-already-in-use')) return 'Ya hay una cuenta con ese email'
  if (code.includes('weak-password')) return 'La contrasena necesita al menos 6 caracteres'
  if (code.includes('invalid-email')) return 'Ese email no parece valido'
  if (code.includes('missing-password')) return 'Falta la contrasena'
  if (code.includes('too-many-requests')) return 'Demasiados intentos, espera un poco'
  if (code.includes('network-request-failed')) return 'Sin conexion con el servidor'
  if (code.includes('requires-recent-login')) {
    return 'Por seguridad, vuelve a iniciar sesion antes de cambiar esto'
  }
  if (code.includes('operation-not-allowed')) {
    return 'Falta activar este metodo de acceso en la consola de Firebase: Authentication > Sign-in method'
  }
  // Pasa cuando el proyecto existe pero nadie ha pulsado "Comenzar" en
  // Authentication, asi que el servicio ni siquiera esta creado.
  if (code.includes('configuration-not-found')) {
    return 'Falta activar Authentication en la consola de Firebase: Compilacion > Authentication > Comenzar, y habilitar Correo electronico/contrasena'
  }
  if (code.includes('api-key-not-valid') || code.includes('invalid-api-key')) {
    return 'La clave de Firebase no es valida, revisa el fichero .env'
  }
  if (code.includes('unauthorized-domain')) {
    return 'Este dominio no esta autorizado en Authentication > Settings > Dominios autorizados'
  }
  if (code.includes('account-exists-with-different-credential')) {
    return 'Ya tienes una cuenta con ese email creada con otro metodo. Entra con el que usaste la primera vez'
  }
  if (code.includes('popup-blocked')) {
    return 'El navegador ha bloqueado la ventana de Google. Permite las ventanas emergentes y vuelve a intentarlo'
  }
  return raw
}

/**
 * Traduce los fallos de Firestore y Storage al sincronizar.
 *
 * Casi todos son de configuracion pendiente en la consola, asi que el mensaje
 * dice donde hay que ir en vez de limitarse a decir que algo fallo.
 */
export function cloudErrorEs(raw: string): string {
  const code = raw.toLowerCase()

  if (code.includes('service firestore is not available') || code.includes('firestore/unavailable-service')) {
    return 'Falta crear la base de datos: consola de Firebase > Firestore Database > Crear base de datos'
  }
  if (code.includes('permission-denied') || code.includes('insufficient permissions')) {
    return 'Las reglas no dejan escribir. Ejecuta: firebase deploy --only firestore:rules'
  }
  if (code.includes('requires an index')) {
    return 'Falta un indice en Firestore. Abre el enlace que aparece en la consola del navegador'
  }
  if (code.includes('unavailable') || code.includes('network') || code.includes('offline')) {
    return 'Sin conexion. Se reintentara solo cuando vuelva'
  }
  if (code.includes('resource-exhausted') || code.includes('quota')) {
    return 'Se ha agotado la cuota diaria de Firebase. Vuelve a intentarlo manana'
  }
  if (code.includes('unauthenticated')) {
    return 'La sesion ha caducado. Vuelve a iniciar sesion'
  }
  return raw
}
