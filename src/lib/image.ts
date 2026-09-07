// ---------------------------------------------------------------------------
// Imagenes propias de un ejercicio.
//
// Se guardan como data URL dentro de IndexedDB, junto al resto de sus datos.
// Las fotos se reducen a 400 px antes de guardarlas: en la app nunca se ven
// mas grandes que eso, y una foto de movil sin tocar son varios megas que
// acabarian en la base de datos local.
//
// Los GIF no pasan por el canvas porque perderian la animacion, asi que se
// guardan tal cual y por eso llevan un limite de tamano mas estricto.
// ---------------------------------------------------------------------------

export const MAX_SIZE_PX = 400
/** Las portadas de rutina ocupan toda la tarjeta, necesitan mas resolucion. */
export const HERO_SIZE_PX = 800
export const MAX_GIF_BYTES = 3 * 1024 * 1024

export class ImageTooLargeError extends Error {
  constructor(public readonly megabytes: number) {
    super(`El GIF ocupa ${megabytes.toFixed(1)} MB y el limite son 3 MB`)
    this.name = 'ImageTooLargeError'
  }
}

const readAsDataUrl = (file: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('No se pudo leer el fichero'))
    reader.readAsDataURL(file)
  })

/**
 * Convierte un fichero elegido por el usuario en algo guardable.
 * Devuelve una data URL lista para meter en `imageData` o `gifData`.
 */
export async function fileToStoredImage(file: File, maxSize = MAX_SIZE_PX): Promise<string> {
  if (file.type === 'image/gif') {
    if (file.size > MAX_GIF_BYTES) throw new ImageTooLargeError(file.size / 1024 / 1024)
    return readAsDataUrl(file)
  }
  return compressImage(file, maxSize)
}

/** Reduce la imagen al lado mayor indicado y la devuelve como JPEG. */
export async function compressImage(file: Blob, maxSize = MAX_SIZE_PX): Promise<string> {
  const source = await readAsDataUrl(file)

  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const element = new Image()
    element.onload = () => resolve(element)
    element.onerror = () => reject(new Error('El fichero no parece una imagen'))
    element.src = source
  })

  const scale = Math.min(1, maxSize / Math.max(image.width, image.height))
  const width = Math.round(image.width * scale)
  const height = Math.round(image.height * scale)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const context = canvas.getContext('2d')
  if (!context) return source

  // Fondo oscuro: un PNG con transparencia quedaria con fondo negro puro al
  // pasar a JPEG, y asi encaja con el resto de la interfaz.
  context.fillStyle = '#1f1f23'
  context.fillRect(0, 0, width, height)
  context.drawImage(image, 0, 0, width, height)

  return canvas.toDataURL('image/jpeg', 0.82)
}

/** Tamano aproximado en KB de una data URL, para poder avisar de lo que ocupa. */
export function dataUrlSizeKb(dataUrl: string | null | undefined): number {
  if (!dataUrl) return 0
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1)
  return Math.round((base64.length * 3) / 4 / 1024)
}
