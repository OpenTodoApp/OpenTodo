// The names people read for the theme format's tokens and groups (OpenSpec change
// theme-editor, design D6, D14): translated; the ids stay as written. The filter
// matches a token by its name in the user's language, its English name and its id.
import { msg, t, translatedMap } from '../../lib/i18n'
import { hueName } from '../../lib/colourNames'
import { TOKEN_GROUPS, type HUES } from '../../lib/theme/tokens'

export type TokenGroup = keyof typeof TOKEN_GROUPS

export const GROUP_NAME = translatedMap<TokenGroup>({
  surfaces: msg('Surfaces'), text: msg('Text'), lines: msg('Lines'), accent: msg('Accent'), status: msg('Status'),
  priorities: msg('Priorities'), labels: msg('Labels'), other: msg('Other'),
})

/** English names of the tokens other than the label hues; the hues are named "Red label" and so on. */
const ENGLISH: Record<string, string> = {
  canvas: msg('Canvas'), surface: msg('Surface'), raised: msg('Raised surface'), sunken: msg('Sunken surface'), pop: msg('Popover'),
  hover: msg('Hover'), selected: msg('Selected item'), 'selected-row': msg('Selected row'), sidebar: msg('Sidebar'),
  'text-strong': msg('Strong text'), text: msg('Text'), muted: msg('Muted text'), faint: msg('Faint text'),
  border: msg('Border'), 'border-soft': msg('Soft border'), 'border-input': msg('Input border'), 'line-strong': msg('Strong line'),
  accent: msg('Accent'), 'accent-hover': msg('Accent hover'), 'on-accent': msg('Text on accent'), 'accent-text': msg('Accent text'),
  'accent-soft': msg('Soft accent'), 'accent-soft-text': msg('Text on soft accent'), focus: msg('Focus ring'),
  success: msg('Success'), 'success-soft': msg('Soft success'), 'success-soft-text': msg('Text on soft success'),
  warning: msg('Warning'), 'warning-soft': msg('Soft warning'), 'warning-soft-text': msg('Text on soft warning'),
  danger: msg('Danger'), 'danger-soft': msg('Soft danger'), 'danger-soft-text': msg('Text on soft danger'),
  info: msg('Info'), 'info-soft': msg('Soft info'), 'info-soft-text': msg('Text on soft info'),
  p1: msg('Priority 1'), 'p1-soft': msg('Soft priority 1'), p2: msg('Priority 2'), 'p2-soft': msg('Soft priority 2'),
  p3: msg('Priority 3'), 'p3-soft': msg('Soft priority 3'), p4: msg('Priority 4'), 'p4-soft': msg('Soft priority 4'),
  scrim: msg('Scrim'), highlight: msg('Search highlight'), 'highlight-text': msg('Highlighted text'), 'chart-base': msg('Chart'),
  'chart-seq-1': msg('Chart step 1'), 'chart-seq-2': msg('Chart step 2'), 'chart-seq-3': msg('Chart step 3'), 'chart-seq-4': msg('Chart step 4'), 'chart-seq-5': msg('Chart step 5'),
}

/** The stylesheet steps a check may name that are not document tokens: a label's soft, text and past steps. */
const STEP = /^hue-([a-z]+)-(solid|soft|text|past)$/

/** A token's English name ("Muted text"), for the filter. */
export function englishTokenName(token: string): string {
  const hue = /^hue-([a-z]+)$/.exec(token)
  if (hue) return `${hue[1][0].toUpperCase()}${hue[1].slice(1)} label`
  const step = STEP.exec(token)
  if (step) return `${step[1]} label ${step[2]}`
  return ENGLISH[token] ?? token
}

/** A token's name in the user's language; also takes the stylesheet's label steps a contrast pair names. */
export function tokenName(token: string): string {
  const hue = /^hue-([a-z]+)$/.exec(token)
  if (hue) return t('{colour} label', { colour: hueName(hue[1] as (typeof HUES)[number]) })
  const step = STEP.exec(token)
  if (step) {
    const colour = hueName(step[1])
    if (step[2] === 'solid') return t('{colour} label', { colour })
    if (step[2] === 'soft') return t('{colour} label fill', { colour })
    if (step[2] === 'text') return t('{colour} label text', { colour })
    return t('{colour} past block', { colour })
  }
  return ENGLISH[token] ? t(ENGLISH[token]) : token
}

/** Whether a token matches the filter: its name, its English name or its id, ignoring case. */
export function matchesFilter(token: string, q: string): boolean {
  const s = q.trim().toLocaleLowerCase()
  if (!s) return true
  return [tokenName(token), englishTokenName(token), token].some((x) => x.toLocaleLowerCase().includes(s))
}

/** The group of each document token. */
export const GROUP_OF: Record<string, TokenGroup> = Object.fromEntries(
  (Object.entries(TOKEN_GROUPS) as [TokenGroup, readonly string[]][]).flatMap(([g, list]) => list.map((tok) => [tok, g])),
)

/** The seed rows (design D5): the four required, then the optional status hues. */
export const SEEDS = ['canvas', 'surface', 'text', 'accent'] as const
export const STATUS_SEEDS = ['success', 'warning', 'danger', 'info'] as const
