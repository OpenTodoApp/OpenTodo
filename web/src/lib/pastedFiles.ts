// Files on a clipboard or a drop (OpenSpec change attachments, design D7): read by the
// task panel, the comment composers, the notes and quick add (quick-add-files D2).
import { t } from './i18n'

/** "Pasted image 2026-10-15 14.03.27.png": the name a pasted image gets. */
export function pastedName(now = new Date(), ext = 'png'): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${t('Pasted image')} ${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())} ${p(now.getHours())}.${p(now.getMinutes())}.${p(now.getSeconds())}.${ext}`
}

/** Files on a clipboard or a drop, with pasted images named by date. */
export function filesFrom(data: DataTransfer | null): File[] {
  if (!data) return []
  const out: File[] = []
  for (const f of Array.from(data.files)) {
    // A pasted screenshot arrives as "image.png" (or with no name at all).
    if (f.type.startsWith('image/') && (!f.name || f.name === 'image.png')) {
      out.push(new File([f], pastedName(new Date(), f.type.split('/')[1]?.replace('jpeg', 'jpg') || 'png'), { type: f.type }))
    } else out.push(f)
  }
  return out
}
