// Turning a chosen image into the 256×256 JPEG the server accepts (OpenSpec
// change settings-refresh, design D10). The browser decodes PNG, JPEG and WebP;
// the crop is drawn into a canvas, so WebP never reaches the server.

export const PICTURE_SIZE = 256
export const PICTURE_TYPES = ['image/png', 'image/jpeg', 'image/webp']
export const PICTURE_MAX_BYTES = 10 * 1024 * 1024

export interface CropArea { x: number; y: number; width: number; height: number }

/** Why a chosen file can't be used, or null. */
export function pictureFileProblem(file: Pick<File, 'type' | 'size'>): 'type' | 'size' | null {
  if (!PICTURE_TYPES.includes(file.type)) return 'type'
  if (file.size > PICTURE_MAX_BYTES) return 'size'
  return null
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('image'))
    img.src = src
  })
}

/** Draws the crop of `src` into a 256×256 canvas and encodes it as JPEG. */
export async function cropToJpeg(src: string, area: CropArea): Promise<Blob> {
  const img = await loadImage(src)
  const canvas = document.createElement('canvas')
  canvas.width = PICTURE_SIZE
  canvas.height = PICTURE_SIZE
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas')
  ctx.drawImage(img, area.x, area.y, area.width, area.height, 0, 0, PICTURE_SIZE, PICTURE_SIZE)
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('encode'))), 'image/jpeg', 0.9))
}
