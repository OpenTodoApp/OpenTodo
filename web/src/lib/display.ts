// Display mode's presentation options (OpenSpec change display-mode, design D2):
// read from the URL of a display route or a public link with `display=1`, never
// stored, never synced. `eink=1` presets high contrast, no motion and a clock
// without seconds; explicit parameters after it win.

export type DisplaySize = 'm' | 'l' | 'xl'

export interface DisplayOptions {
  size: DisplaySize
  contrast: 'normal' | 'high'
  motion: 'normal' | 'none'
  seconds: boolean
  /** Next-day columns on Today (1–7) and days on Upcoming. */
  days: number
}

export type DisplayTarget =
  | { kind: 'today' }
  | { kind: 'upcoming' }
  | { kind: 'project'; id: string }
  | { kind: 'view'; id: string }

export const DEFAULT_DISPLAY: DisplayOptions = { size: 'l', contrast: 'normal', motion: 'normal', seconds: true, days: 3 }
/** Upcoming shows a week by default. */
export const DEFAULT_UPCOMING_DAYS = 7

/** The type scale per size: body text at about 20, 24 and 32 px (design D4). */
export const DISPLAY_SCALE: Record<DisplaySize, number> = { m: 1.35, l: 1.6, xl: 2.15 }

export function parseDisplayOptions(query: string, target?: DisplayTarget): DisplayOptions {
  const q = new URLSearchParams(query)
  const o: DisplayOptions = { ...DEFAULT_DISPLAY, days: target?.kind === 'upcoming' ? DEFAULT_UPCOMING_DAYS : DEFAULT_DISPLAY.days }
  if (q.get('eink') === '1') Object.assign(o, { contrast: 'high', motion: 'none', seconds: false })
  const size = q.get('size')
  if (size === 'm' || size === 'l' || size === 'xl') o.size = size
  const contrast = q.get('contrast')
  if (contrast === 'high' || contrast === 'normal') o.contrast = contrast
  const motion = q.get('motion')
  if (motion === 'none' || motion === 'normal') o.motion = motion
  const seconds = q.get('seconds')
  if (seconds === '0' || seconds === '1') o.seconds = seconds === '1'
  const days = Number(q.get('days'))
  if (Number.isInteger(days) && days >= 1 && days <= 7) o.days = days
  return o
}

/** The query string for `o`, listing only what differs from the defaults ('' when nothing does). */
export function displayQuery(o: DisplayOptions, target?: DisplayTarget): string {
  const q = new URLSearchParams()
  const eink = o.contrast === 'high' && o.motion === 'none' && !o.seconds
  if (eink) q.set('eink', '1')
  if (o.size !== DEFAULT_DISPLAY.size) q.set('size', o.size)
  if (!eink) {
    if (o.contrast !== 'normal') q.set('contrast', o.contrast)
    if (o.motion !== 'normal') q.set('motion', o.motion)
    if (!o.seconds) q.set('seconds', '0')
  }
  const defaultDays = target?.kind === 'upcoming' ? DEFAULT_UPCOMING_DAYS : DEFAULT_DISPLAY.days
  if (o.days !== defaultDays) q.set('days', String(o.days))
  const s = q.toString()
  return s ? `?${s}` : ''
}

export function targetPath(t: DisplayTarget): string {
  switch (t.kind) {
    case 'today': return '/display'
    case 'upcoming': return '/display/upcoming'
    case 'project': return `/display/project/${encodeURIComponent(t.id)}`
    case 'view': return `/display/view/${encodeURIComponent(t.id)}`
  }
}

/** The route of a display target with default options (the "Display mode" entries). */
export function displayRoute(target: DisplayTarget): { view: 'display'; target: DisplayTarget; options: DisplayOptions } {
  return { view: 'display', target, options: parseDisplayOptions('', target) }
}
