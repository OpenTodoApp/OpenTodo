// Presentation options of a display (OpenSpec change `display-mode`, design D2).
// Every choice lives in the URL, so a kiosk bookmark or a start view reproduces it
// exactly: size, high contrast, no motion, clock seconds and the number of day
// columns. `eink=1` is a preset (high contrast, no motion, no seconds) applied
// before the explicit parameters, so `eink=1&contrast=normal` is possible.

export type DisplaySize = 'm' | 'l' | 'xl'

export interface DisplayOptions {
  size: DisplaySize
  contrast: 'normal' | 'high'
  motion: 'normal' | 'none'
  /** The clock shows seconds. */
  seconds: boolean
  /** Day columns (1–7); undefined is the target's default (3 for Today, 7 for Upcoming). */
  days?: number
}

export type DisplayTarget =
  | { kind: 'today' }
  | { kind: 'upcoming' }
  | { kind: 'project'; id: string }
  | { kind: 'view'; id: string }

export const DEFAULT_DISPLAY_OPTIONS: DisplayOptions = { size: 'l', contrast: 'normal', motion: 'normal', seconds: true }

/** The type scale factor per size (design D4): body text (15 px) lands at about 20, 24 and 32 px. */
export const DISPLAY_SCALE: Record<DisplaySize, number> = { m: 1.35, l: 1.6, xl: 2.15 }

/** Default number of day columns per target. */
export function defaultDays(target: DisplayTarget): number {
  return target.kind === 'upcoming' ? 7 : 3
}

/** The options from a query string; unknown or malformed values fall back to the defaults. */
export function parseDisplayOptions(query: string | URLSearchParams): DisplayOptions {
  const q = typeof query === 'string' ? new URLSearchParams(query) : query
  const o: DisplayOptions = { ...DEFAULT_DISPLAY_OPTIONS }
  if (q.get('eink') === '1') {
    o.contrast = 'high'
    o.motion = 'none'
    o.seconds = false
  }
  const size = q.get('size')
  if (size === 'm' || size === 'l' || size === 'xl') o.size = size
  const contrast = q.get('contrast')
  if (contrast === 'high' || contrast === 'normal') o.contrast = contrast
  const motion = q.get('motion')
  if (motion === 'none' || motion === 'normal') o.motion = motion
  const seconds = q.get('seconds')
  if (seconds === '0' || seconds === '1') o.seconds = seconds === '1'
  const days = q.get('days')
  if (days && /^[1-7]$/.test(days)) o.days = Number(days)
  return o
}

/** The query string (without `?`) for the options; defaults are left out, the e-ink preset is written as `eink=1`. */
export function serializeDisplayOptions(o: DisplayOptions): string {
  const q = new URLSearchParams()
  const eink = o.contrast === 'high' && o.motion === 'none' && !o.seconds
  if (o.size !== DEFAULT_DISPLAY_OPTIONS.size) q.set('size', o.size)
  if (eink) q.set('eink', '1')
  else {
    if (o.contrast !== DEFAULT_DISPLAY_OPTIONS.contrast) q.set('contrast', o.contrast)
    if (o.motion !== DEFAULT_DISPLAY_OPTIONS.motion) q.set('motion', o.motion)
    if (o.seconds !== DEFAULT_DISPLAY_OPTIONS.seconds) q.set('seconds', o.seconds ? '1' : '0')
  }
  if (o.days !== undefined) q.set('days', String(o.days))
  return q.toString()
}

/** The path of a display target, without options. */
export function displayTargetPath(item: DisplayTarget): string {
  switch (item.kind) {
    case 'today':
    case 'upcoming':
      return `/display/${item.kind}`
    case 'project':
    case 'view':
      return `/display/${item.kind}/${encodeURIComponent(item.id)}`
  }
}

/** The display target of the path segments after `display`, or null when they name none. */
export function parseDisplayTarget(parts: readonly string[]): DisplayTarget | null {
  switch (parts[0]) {
    case undefined:
    case 'today':
      return { kind: 'today' }
    case 'upcoming':
      return { kind: 'upcoming' }
    case 'project':
    case 'view':
      return parts[1] ? { kind: parts[0], id: safeDecode(parts[1]) } : null
    default:
      return null
  }
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s)
  } catch {
    return s
  }
}
