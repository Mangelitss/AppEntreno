#!/usr/bin/env node
// Empaqueta las pruebas con esbuild (para que resuelvan los imports de src)
// y las ejecuta con el runner de Node.
import { build } from 'esbuild'
import { spawn } from 'node:child_process'
import { mkdtemp, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const TESTS = resolve(ROOT, 'tests')

const entries = (await readdir(TESTS))
  .filter(f => f.endsWith('.test.mts'))
  .map(f => join(TESTS, f))

if (!entries.length) {
  console.log('No hay pruebas.')
  process.exit(0)
}

const outdir = await mkdtemp(join(tmpdir(), 'appentreno-tests-'))

await build({
  entryPoints: entries,
  outdir,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  outExtension: { '.js': '.mjs' },
  // `import.meta.env` lo inyecta Vite al compilar y en Node no existe. Se
  // sustituye por un objeto vacio para que los modulos que leen credenciales
  // se comporten como en modo local.
  define: {
    'import.meta.env.VITE_FIREBASE_API_KEY': '""',
    'import.meta.env.VITE_FIREBASE_AUTH_DOMAIN': '""',
    'import.meta.env.VITE_FIREBASE_PROJECT_ID': '""',
    'import.meta.env.VITE_FIREBASE_STORAGE_BUCKET': '""',
    'import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID': '""',
    'import.meta.env.VITE_FIREBASE_APP_ID': '""'
  },
  logLevel: 'error'
})

const files = (await readdir(outdir)).map(f => join(outdir, f))
const child = spawn(process.execPath, ['--test', ...files], { stdio: 'inherit' })
child.on('exit', code => process.exit(code ?? 1))
