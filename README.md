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

## Datos de prueba

*Ajustes → Datos de prueba → Cargar rutinas de ejemplo* crea **Push, Pull, Pierna A y Pierna B**
con sus series y repeticiones, y las asigna a lunes, martes, miércoles y viernes.
Ejecutarlo dos veces no duplica nada.

Cada ejercicio se busca en el catálogo por palabras clave (el catálogo está en inglés) y se le
cuelga un alias en español, que es el nombre que verás en la app. Si alguno no aparece —por
ejemplo si aún no has descargado el catálogo completo— se crea como ejercicio propio con sus
músculos, así que la distribución muscular sigue saliendo bien.

Las repeticiones se guardan como rango de 2 (un `3 × 9` queda como `3 × 9-11`) para que la
progresión doble tenga margen: primero cierras el rango, después sube el peso.

## Ejercicios

La pestaña **Ejercicios** es el catálogo completo: lo importado del dataset y lo que crees tú,
agrupado en secciones plegables por grupo muscular, con buscador y filtros (fuerza, cardio,
solo míos, archivados, material).

Al abrir un ejercicio se puede editar **todo**: nombre mostrado, nombre original, grupo,
material, músculo objetivo y secundarios, incremento de progresión, y en cardio su tipo y
unidad de ritmo. También:

- **Imagen y GIF propios**, subiendo un fichero o pegando una URL. Las fotos se comprimen a
  400 px antes de guardarse; los GIF se guardan tal cual con un límite de 3 MB porque pasarlos
  por canvas les quitaría la animación. Lo tuyo siempre manda sobre el media del dataset.
- **Anotaciones libres**: pares nombre/valor que te inventas ("Altura asiento: 4",
  "Pin: 3er agujero") y que aparecen en la pantalla de entreno como recordatorio.
- **Archivar**: lo esconde de buscadores y listas sin borrar nada. Tus rutinas y tu historial
  quedan intactos, y se recupera desde el filtro *Archivados*.
- **Ver progreso**, que lleva a Progreso con ese ejercicio ya seleccionado.

En **Rutinas**, cada una se ve como una portada: foto de fondo que subes tú (o un degradado con
el color del músculo que más trabaja, si no le pones ninguna), los días de la semana arriba,
y el nombre con su duración y número de ejercicios. Tocar el panel entra a modificarla; una
flecha abajo despliega la distribución muscular con porcentajes y la lista de ejercicios.

**Los días se asignan desde el calendario horizontal.** Tocas un día, eliges una rutina de la
lista (o Descanso) y queda pendiente: los días con cambios sin guardar se marcan en ámbar y no
se aplican hasta darle a *Guardar*. Cada día admite una sola rutina. Los chips L-D de cada
panel son informativos y reflejan lo que llevas elegido, aunque no lo hayas guardado aún.

La foto de la rutina se pone desde su editor, junto al nombre, y se comprime a 800 px de ancho
(más que las miniaturas de ejercicio, porque aquí ocupa toda la tarjeta). El editor muestra
además la distribución muscular **viva**: los porcentajes se recalculan mientras añades y
quitas ejercicios, antes de guardar.

Los cambios **no se aplican solos**: tanto la ficha de un ejercicio como el editor de rutinas
trabajan sobre un borrador local. Mientras haya algo pendiente aparece una barra ámbar con el
botón *Guardar*, y si intentas salir la app avisa antes de descartar. En rutinas eso incluye
añadir, quitar y reordenar, así que puedes reorganizarla entera y arrepentirte sin dejarla a
medias; hay un botón *Deshacer* que la devuelve a como estaba. En la ficha de un ejercicio del
catálogo hay además *Restaurar los valores originales del catálogo*, que rellena el formulario
con lo que traía el dataset — se aplica al guardar, como todo lo demás.

Grupo, material y músculos **no se escriben a mano**: son campos con buscador y lista. Es
donde más fácil era romper algo — escribir "hombro" en vez de `shoulders` habría dejado ese
ejercicio fuera de su grupo y fuera de la distribución muscular, sin avisar. La lista sale de
una taxonomía canónica (`src/lib/taxonomy.ts`) más todo lo que ya use tu catálogo, y cada
opción muestra su traducción al español en gris como pista: los valores se siguen guardando en
inglés, como el dataset. Puedes escribir uno que no exista, pero la app lo marca en ámbar
avisando de que es nuevo.

Cada campo del dataset que cambies a mano queda marcado. Al reimportar el catálogo, si hay
ejercicios editados la app pregunta si conservar tus cambios o dejar que el dataset los
sustituya. Lo que es tuyo —favoritos, incrementos, anotaciones, imágenes propias y el
archivado— se conserva siempre, elijas lo que elijas.

## Cardio y deportes

Una rutina puede mezclar fuerza y cardio, o ser solo cardio. Las actividades traen su propio
catálogo (HIIT, bici, carrera, natación, remo, tenis, pádel, fútbol, escalada…) y **cada tipo
pide los campos que le corresponden**:

| Tipo | Campos |
|---|---|
| HIIT / intervalos | duración, kcal, FC media y máxima |
| Distancia (bici, carrera, natación) | duración, distancia, kcal, FC media y máxima |
| Deporte (tenis, pádel, fútbol) | duración, kcal, FC media y máxima |

**El cardio no se cronometra dentro de la app.** Si la rutina del día es solo cardio, el botón
de Hoy pasa a ser *Registrar cardio* y abre un formulario en vez de la pantalla de entreno:
sales a rodar y lo apuntas cuando te venga bien. Solo la duración está a la vista; distancia,
kcal y pulsaciones viven detrás de *+ añadir*, así que registrar una salida son dos toques si
no te apetece detallar. Puedes fecharlo hasta 7 días atrás y cuenta para la racha igual que
cualquier otro entreno. Las rutinas que mezclan hierro y cardio siguen yendo por el
entreno en directo.

El ritmo no se teclea: sale de dividir tiempo entre distancia, y en la unidad de cada deporte
—min/km corriendo, km/h en bici, min/100m nadando—. El motor de progresión ignora el cardio
por completo (no hay carga que subir) y el volumen en kg tampoco lo cuenta: correr 8 km no
son kilos levantados.

### Sobre sincronizar con Strava

De momento el registro es manual, que para HIIT es lo único que hace falta. La API de Strava
no es viable todavía en esta app por dos motivos: desde el 30 de junio de 2026 el nivel
Standard exige una suscripción de Strava activa, y Strava no soporta PKCE, así que el
intercambio de tokens necesita un servidor con el client secret — algo que podría resolverse
con una Cloud Function de Firebase. Mientras tanto lo razonable es grabar en Strava y, cuando toque, importar
el GPX/TCX o el `activities.csv` del archivo de la cuenta.

## Cuentas y perfil

El backend es **Firebase** (proyecto `appentreno-31a7d`), y es **opcional**. Sin credenciales
configuradas la app funciona exactamente igual que siempre: todo en el dispositivo, sin cuentas.
Con ellas aparecen el registro y el inicio de sesión.

### Ponerlo en marcha

1. En la consola de Firebase → **Authentication** → *Sign-in method* → habilitar
   **Correo electrónico/contraseña**.
2. **Firestore Database** → crear la base de datos (región `eur3` o `europe-west1`).
3. Copiar `.env.example` a `.env` y rellenar las claves de *Configuración del proyecto → Tus apps*.
4. Desplegar las reglas y la app:

```bash
npm install -g firebase-tools
firebase login
firebase deploy --only firestore:rules
npm run build && firebase deploy --only hosting
```

**Storage no hace falta**: exige plan de pago y no lo usamos, por eso las fotos no se
sincronizan. `storage.rules` se conserva por si algún día se activa.

Que la `apiKey` viaje en el navegador no es un descuido: en Firebase no es un secreto, solo
identifica el proyecto. Lo que protege los datos son las reglas de `firestore.rules`.

El SDK de Firebase se carga en fragmentos aparte y solo si hay credenciales, así que el arranque
en modo local pesa lo mismo que antes de existir las cuentas.

### Cómo se organizan los datos

Todo lo tuyo cuelga de `users/{uid}`, así que la regla de seguridad es una sola línea en vez de
una política por tabla. El catálogo de 1.324 ejercicios **no se sube**: es idéntico para todos y
cada móvil se lo descarga del JSON. Solo viajan los ejercicios que creas tú y los que hayas
editado.

### Sincronización

La base local manda: la app siempre lee y escribe en Dexie, y el motor de `src/db/sync.ts` va
por detrás subiendo y bajando cambios. Se sincroniza al entrar, al recuperar la conexión, cada
cinco minutos y con el botón del perfil.

Cómo funciona, en corto:

- **Se sube antes de bajar**, y `lastPushedAt` empieza en cero. De ahí sale gratis el
  "al registrarte se sube lo que ya tenías": la primera pasada envía todo tu historial.
- **Gana la escritura más reciente** comparando `updatedAt`. Como cada uno solo edita lo suyo,
  no hay conflictos de verdad que resolver.
- **Los borrados viajan** porque son lógicos. Si se borrara la fila, al sincronizar reaparecería.
- **El catálogo no se sube.** Solo viajan los ejercicios que creas tú y los que hayas tocado
  —editado, marcado como favorito, archivado, con anotaciones o con foto propia—. Los otros 1.300
  son idénticos para todos y cada móvil se los descarga del JSON.
- **Las imágenes no se sincronizan.** Firebase Storage exige plan de pago, y meterlas dentro del
  documento chocaría con el límite de 1 MiB de Firestore y se pagaría en cada lectura. Así que
  las fotos que subes —avatares, portadas de rutina, imágenes de ejercicios propios— se quedan
  en el dispositivo. Al recibir un documento del servidor **se conserva la foto local** en vez de
  borrarla, que es lo que pasaría si viajara vacía.
- **Si en el mismo móvil entra otra persona**, se detecta por `ownerUid` y se limpia la base local
  antes de bajar nada, para que no se mezclen dos historiales.

### Perfil

La pestaña **Perfil** reúne nombre y avatar, un resumen de tu actividad (entrenos, racha, mejor
racha y tiempo acumulado, todo calculado), tus datos corporales —los mismos que usa Medidas— y
los ajustes de cuenta. Los ajustes de la app se abren desde el botón de arriba.

### Sobre lo social

Las reglas ya contemplan `friendships`, `sharedRoutines` y `publicStats`, aunque no haya pantalla
todavía. Ese último merece explicación: en Firestore no hay `JOIN`, así que para comparar
estadísticas con un amigo no se leen sus entrenos crudos —sería caro y expondría de más— sino un
documento pequeño con unas pocas cifras ya calculadas que cada uno publica.

## Medidas

La sección guarda dos cosas distintas y a propósito separadas:

- **Perfil** — altura, sexo y fecha de nacimiento. Se pone una vez. La altura no es una medida
  más: si se guardara fechada habría que reescribirla en cada registro y la gráfica saldría plana.
- **Historial** — peso, % de grasa y contornos (pecho, cintura, cadera, brazo, muslo), con fecha.

Cruzando ambos salen métricas que ninguno da por separado, y **ninguna se guarda: se calculan**,
así que corregir la altura o un peso antiguo recalcula todo el historial sin descuadrarlo:

| Métrica | De dónde sale | Para qué |
|---|---|---|
| IMC | peso y altura | El clásico. Avisa de que con músculo marca sobrepeso siendo falso |
| Cintura / altura | cintura y altura | Bajo 0,50 es saludable. Más fiable que el IMC si entrenas |
| Masa magra y grasa | peso y % graso | En definición, distingue si pierdes grasa o músculo |

## Rangos musculares

*Progreso → Rangos* muestra un cuerpo de frente y espalda con cada músculo coloreado por su
rango, y debajo los seis grupos desplegables. La idea clave: **mide progreso acumulado, no
fuerza máxima**. Los puntos van por mejora relativa, así que subir el curl de 40 a 42 kg vale
exactamente lo mismo que la sentadilla de 100 a 105 — un novato y alguien con años entrenando
pueden llegar los dos a Diamante.

Cada semana, cada músculo suma hasta 100 puntos:

| Fuente | Máx | Cómo |
|---|---|---|
| Progreso | 60 | Superar tu referencia, según cuánto la superes en % |
| Constancia | 30 | Series efectivas, con tope para que el volumen basura no cuente |
| Intensidad | 10 | Proporción de series con RIR ≤ 2 |

Y puede restar: hasta 40 por **regresión** (rendir por debajo de lo que ya habías demostrado) y
un **8 % semanal por abandono** de cada semana sin tocar ese músculo.

Dos detalles que evitan que el sistema sea injusto:

- La referencia no es tu récord histórico sino la ventana de las **últimas 16 semanas**. Una
  marca de hace dos años no te persigue, y volver de vacaciones o cumplir años no te condena.
- Hay **dos referencias distintas**: para *progreso* cuenta tu mejor marca de la ventana —superar
  tu mejor día es progreso y punto—; para *regresión* cuenta la **segunda mejor**. Así un pico
  aislado, o un dedazo escribiendo 500 en vez de 50, no te bloquea el rango durante meses.

Escalera: **Sin rango → Calibrando → Bronce → Plata → Oro → Platino → Diamante → Élite**, con
tres divisiones cada uno (III a I). *Calibrando* son las dos primeras semanas con datos: sin
referencia no se puede medir progreso, y poner un rango antes sería inventárselo.

El rango del grupo es la **media de puntos** de sus músculos con datos, no la media de sus
rangos —promediar rangos pierde precisión—. Al lado se ve `3/6`: cuántos de sus músculos tienen
rango ya. Nada de esto se guarda: se recalcula del historial, así que corregir un entreno
antiguo también corrige los rangos.

## Racha

En *Hoy* se ve la racha de días entrenados. Aguanta hasta **dos días seguidos de descanso**;
al tercer día sin entrenar se rompe. Dicho al revés: entre dos entrenos puede haber como
mucho 3 días de diferencia. La tarjeta avisa cuando queda un solo día para perderla, y
recuerda tu mejor racha histórica.

Si se te olvidó apuntar un entreno, *Se me olvidó apuntar un entreno* deja registrarlo hasta
**7 días atrás**: eliges el día, la rutina y cuánto duró, y después rellenas las series como
en un entreno normal. La racha se recalcula sola a partir de los días entrenados, así que si
el hueco era ese, vuelve a estar donde la tenías. Como un entreno pasado no se puede
cronometrar, la duración que indiques es la que queda en el historial.

### Historial de prueba

El mismo apartado de *Ajustes* tiene **Generar 30 semanas de entrenos**. Hace falta para ver
funcionando los rangos, las gráficas y la racha, porque con dos entrenos sueltos no se aprecia
nada.

Lo generado imita a una persona real, no datos perfectos: la progresión se frena con el tiempo
(logarítmica, no lineal), hay una semana de descarga, se salta días sueltos, y las piernas
acaban por delante del pecho porque el plan tiene dos días de pierna y uno de empuje. Esa
desigualdad es justo lo que hace útil el muñeco.

Pasa por las acciones reales de la app —`startWorkout`, rellenar series, `commitWorkout`—, así
que también deja estado del motor de progresión y sirve para probar ese camino entero. Al lado
está **Borrar historial**, que se lleva entrenos y pesajes pero deja las rutinas y el catálogo.

## Dónde se empieza a entrenar

Solo desde **Hoy**. Ahí está la rutina que toca hoy según el calendario, y también un selector
para lanzar cualquier otra rutina o un entreno libre. La pantalla de Rutinas es para montarlas y
consultarlas: qué músculos trabajan, cuánto duran y qué días están asignadas.

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

Al pulsar *Terminar* no se guarda nada todavia: primero ves el resumen con los ejercicios
que suben, de cuanto a cuanto, y puedes ajustar el incremento o ponerlo a 0. Si lo cambias,
esa cantidad pasa a ser el incremento por defecto de ese ejercicio. Si lo pones a 0 no sube
y te lo vuelve a proponer la proxima sesion en la que cumplas el criterio.

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
y los borrados son lógicos. Eso es justo lo que hace falta para enchufar la nube después
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
