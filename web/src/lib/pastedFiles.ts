// Files on a clipboard or a drop (OpenSpec change attachments, design D7): read by the
// task panel, the comment composers, the notes and quick add (quick-add-files D2).
import { t } from './i18n'

/** "Pasted image 2026-10-15 14.03.27.png": the name a pasted image gets. */
export function pastedName(now = new Date(), ext = 'png'): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${t('Pasted image')} ${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())} ${p(now.getHours())}.${p(now.getMinutes())}.${p(now.getSeconds())}.${ext}`
}

/** A screenshot's clipboard name: "image.png", or none at all. */
const unnamedImage = (f: File) => f.type.startsWith('image/') && (!f.name || f.name === 'image.png')

/**
 * Text with only a picture of it, as Excel, Numbers, PowerPoint and LibreOffice copy
 * rows or a slide: the paste is the text (quick-add-files D2).
 */
export function isTextWithPicture(data: DataTransfer | null): boolean {
  if (!data?.files.length || !data.getData('text/plain').trim()) return false
  return Array.from(data.files).every(unnamedImage)
}

/** Files on a clipboard or a drop, with pasted images named by date. */
export function filesFrom(data: DataTransfer | null): File[] {
  if (!data) return []
  const out: File[] = []
  for (const f of Array.from(data.files)) {
    // A pasted screenshot arrives as "image.png" (or with no name at all).
    if (unnamedImage(f)) {
      out.push(new File([f], pastedName(new Date(), f.type.split('/')[1]?.replace('jpeg', 'jpg') || 'png'), { type: f.type }))
    } else out.push(f)
  }
  return out
}
