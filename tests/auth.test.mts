// Traduccion de los errores de autenticacion y forma del perfil.
import 'fake-indexeddb/auto'
import assert from 'node:assert/strict'
import test, { beforeEach } from 'node:test'
import { authErrorEs, cloudErrorEs } from '../src/db/firebase.ts'
import { db, EMPTY_PROFILE, getProfile, saveProfile } from '../src/db/db.ts'
import { displayNameOf } from '../src/db/auth.ts'

test('los codigos de Firebase se cuentan en cristiano', () => {
  assert.equal(authErrorEs('auth/invalid-credential'), 'Email o contrasena incorrectos')
  assert.equal(authErrorEs('auth/wrong-password'), 'Email o contrasena incorrectos')
  assert.equal(authErrorEs('auth/user-not-found'), 'Email o contrasena incorrectos')
  assert.equal(authErrorEs('auth/email-already-in-use'), 'Ya hay una cuenta con ese email')
  assert.match(authErrorEs('auth/weak-password'), /6 caracteres/)
  assert.match(authErrorEs('auth/invalid-email'), /no parece valido/)
  assert.match(authErrorEs('auth/network-request-failed'), /Sin conexion/)
})

test('los fallos de configuracion dicen que hay que tocar y donde', () => {
  assert.match(
    authErrorEs('auth/configuration-not-found'),
    /Authentication en la consola/,
    'el proyecto existe pero falta pulsar Comenzar en Authentication'
  )
  assert.match(authErrorEs('auth/api-key-not-valid'), /\.env/)
  assert.match(authErrorEs('auth/unauthorized-domain'), /Dominios autorizados/)
})

test('los errores que necesitan explicacion la dan', () => {
  assert.match(authErrorEs('auth/requires-recent-login'), /vuelve a iniciar sesion/)
  assert.match(
    authErrorEs('auth/operation-not-allowed'),
    /consola de Firebase/,
    'si se olvida activar el metodo de acceso, hay que decir donde'
  )
})

test('un error que no conocemos se muestra tal cual en vez de tragarselo', () => {
  assert.equal(authErrorEs('Algo raro del servidor'), 'Algo raro del servidor')
})

test('el nombre del alta se lee del usuario, y aguanta que no lo haya', () => {
  assert.equal(displayNameOf({ displayName: 'Miguel' } as never), 'Miguel')
  assert.equal(displayNameOf({ displayName: '   ' } as never), null)
  assert.equal(displayNameOf({ displayName: null } as never), null)
  assert.equal(displayNameOf(null), null)
})

test('los fallos de la nube dicen el comando o el sitio exacto', () => {
  assert.match(
    cloudErrorEs('Service firestore is not available'),
    /Crear base de datos/,
    'el proyecto existe pero no hay base de datos'
  )
  assert.match(cloudErrorEs('permission-denied'), /firebase deploy --only firestore:rules/)
  assert.match(cloudErrorEs('The query requires an index'), /indice/)
  assert.match(cloudErrorEs('unauthenticated'), /Vuelve a iniciar sesion/)
})

test('un fallo pasajero de red no suena a que hayas roto algo', () => {
  assert.match(cloudErrorEs('unavailable'), /Se reintentara solo/)
})

beforeEach(async () => {
  await db.delete()
  await db.open()
})

test('sin perfil guardado se devuelve uno vacio, no un fallo', async () => {
  const profile = await getProfile()
  assert.equal(profile.id, 'profile')
  assert.equal(profile.displayName, null)
  assert.equal(profile.heightCm, null)
  assert.deepEqual(profile, EMPTY_PROFILE)
})

test('el perfil junta cuenta y cuerpo en una sola fila', async () => {
  await saveProfile({ displayName: 'Miguel Angel', heightCm: 180 })
  await saveProfile({ sex: 'hombre' })

  const profile = await getProfile()
  assert.equal(profile.displayName, 'Miguel Angel', 'guardar el sexo no borra el nombre')
  assert.equal(profile.heightCm, 180)
  assert.equal(profile.sex, 'hombre')
  assert.ok(profile.updatedAt > 0, 'lleva marca de sync para cuando toque subirlo')
})

test('el avatar se guarda con el resto del perfil', async () => {
  await saveProfile({ avatarUrl: 'data:image/jpeg;base64,AAAA' })
  assert.equal((await getProfile()).avatarUrl, 'data:image/jpeg;base64,AAAA')
  assert.equal(await db.profile.count(), 1, 'siempre una unica fila')
})
