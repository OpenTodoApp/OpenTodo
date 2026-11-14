// Keeps a screenshot file when a new render looks the same (docs-screenshot-growth).
// Every write of a new copy adds a full image to Git history, even when the only
// difference is anti-aliasing or encoder noise. Both renders are decoded in the
// browser page the generator already uses for WebP encoding, so no image library
// is needed: the new image is written only when its size differs or more than
// RATIO of its pixels differ by more than TOLERANCE in some channel.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'

export const TOLERANCE = 24 // per channel, 0-255: above lossy WebP noise, below any real text or colour change
export const RATIO = 0.001 // 0.1 % of the pixels, about a 30 x 30 px patch of a 1440 x 900 screen

const MIME = { webp: 'image/webp', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg' }
const mime = (file) => MIME[file.split('.').pop().toLowerCase()] ?? 'image/png'

/** Compares two encoded images in `page`; true when they look the same. */
export async function looksSame(page, a, b, type = 'image/png', tolerance = TOLERANCE, ratio = RATIO) {
  return page.evaluate(async ([a, b, type, tolerance, ratio]) => {
    const load = async (b64) => { const img = new Image(); img.src = `data:${type};base64,${b64}`; await img.decode(); return img }
    const [x, y] = await Promise.all([load(a), load(b)])
    if (x.naturalWidth !== y.naturalWidth || x.naturalHeight !== y.naturalHeight) return false
    const px = (img) => {
      const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight
      const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0)
      return ctx.getImageData(0, 0, c.width, c.height).data
    }
    const p = px(x), q = px(y)
    const limit = Math.floor((p.length / 4) * ratio)
    let off = 0
    for (let i = 0; i < p.length; i += 4) {
      if (Math.abs(p[i] - q[i]) > tolerance || Math.abs(p[i + 1] - q[i + 1]) > tolerance
        || Math.abs(p[i + 2] - q[i + 2]) > tolerance || Math.abs(p[i + 3] - q[i + 3]) > tolerance) {
        if (++off > limit) return false
      }
    }
    return true
  }, [a.toString('base64'), b.toString('base64'), type, tolerance, ratio])
}

/** Writes `buf` to `file` unless the file there already looks the same. Returns true when it wrote. */
export async function writeIfChanged(page, file, buf) {
  if (existsSync(file)) {
    const old = readFileSync(file)
    if (old.equals(buf) || await looksSame(page, old, buf, mime(file))) return false
  }
  writeFileSync(file, buf)
  return true
}
