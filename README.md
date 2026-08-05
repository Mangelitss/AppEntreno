# AppEntreno

App de entrenamiento personal: rutinas propias, registro de series en el gimnasio,
progresión automática de cargas por RIR, historial y control del peso corporal.

Funciona como PWA: se instala en el móvil desde el navegador y funciona sin cobertura.
Todos los datos viven en tu dispositivo (IndexedDB); no hay servidor todavía.

## Arrancar

```bash
npm install
npm run dev
```

La primera vez, `npm run dev` descarga solo el catálogo de ejercicios (`predev`).
Abre la URL `Network` que imprime Vite desde el móvil para probarla en el gym —
el móvil y el ordenador tienen que estar en el mismo wifi.

Otros comandos:

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo, accesible desde la red local |
| `npm run build` | Build de producción en `dist/` |
| `npm run preview` | Sirve el build, útil para probar la PWA de verdad |
| `npm test` | Pruebas del motor de progresión |
| `npm run fetch-exercises` | Vuelve a descargar el catálogo de ejercicios |

## Instalarla en el móvil

1. Levanta `npm run dev` (o despliega el build).
2. Abre la URL en Chrome/Safari del móvil.
3. Menú del navegador → *Añadir a pantalla de inicio*.

A partir de ahí se abre a pantalla completa y funciona offline. Las animaciones de los
ejercicios se descargan bajo demanda y quedan cacheadas, así que las de tus rutinas
habituales acaban estando disponibles sin red.

## Cómo funciona la progresión automática

Al terminar un entreno, cada ejercicio se evalúa:

1. ¿Llegaste al **tope del rango de reps** en todas las series efectivas
   (las que no son calentamiento)?
2. ¿Te sobraban reps, es decir **RIR ≥ 2** en todas ellas?

Si se cumplen las dos, esa sesión cuenta para la racha. Cuando la racha llega a
**2 sesiones seguidas**, la próxima vez que hagas el ejercicio el peso aparece ya subido
y la racha vuelve a cero. Una sesión que no cumple corta la racha.

El incremento se deduce del material del ejercicio:

| Material | Incremento |
|---|---|
| Barra, tren inferior | +5 kg |
| Barra / multipower, tren superior | +2,5 kg |
| Mancuernas, kettlebell | +2 kg |
| Polea, máquina | +5 kg |
| Peso corporal, gomas | +1 repetición |

Todo es configurable: los umbrales en *Ajustes*, y el incremento de cada ejercicio en
el editor de rutinas.

## Estructura

```
src/
├── db/
│   ├── types.ts      Modelo de datos
│   ├── db.ts         Dexie (IndexedDB) y ajustes
│   ├── repo.ts       Helpers de id, fechas y borrado lógico
│   ├── catalog.ts    Importación del catálogo de ejercicios
│   └── actions.ts    Operaciones: crear rutinas, entrenar, cerrar sesión
├── lib/
│   ├── progression.ts  Motor de progresión por RIR
│   └── stats.ts        1RM estimado, volumen, formatos
├── components/       Layout, buscador de ejercicios, cronómetro, gráfica SVG
└── pages/            Hoy, Entreno, Rutinas, Progreso, Peso, Ajustes
```

### Sobre el sync

Todas las entidades llevan `id` (uuid), `updatedAt` y `deletedAt` desde el primer día,
y los borrados son lógicos. Eso es justo lo que hace falta para enchufar Supabase después
sin tocar ninguna pantalla: el push manda lo que tenga `updatedAt` posterior al último
envío y el pull aplica lo que llegue. Como cada usuario solo edita sus propios datos,
no hay conflictos reales que resolver.

Mientras tanto, *Ajustes → Copia de seguridad* exporta e importa un JSON con todo,
que sirve de puente entre el móvil y el ordenador.

## Datos de ejercicios

Catálogo de 1.324 ejercicios de
[hasaneyldrm/exercises-dataset](https://github.com/hasaneyldrm/exercises-dataset) (MIT).

Las imágenes y GIFs son **© [Gym visual](https://gymvisual.com/)** y se sirven desde
jsDelivr sin copiarse al repositorio. Uso personal manteniendo la atribución; si algún día
esto se publica de cara al público hay que licenciar la media con ellos.
