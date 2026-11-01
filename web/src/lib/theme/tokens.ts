// The closed list of semantic tokens a theme may set (OpenSpec change theme-engine,
// design D1), grouped as the editor will show them. A document names a label hue
// `hue-<name>` (its solid step); the stylesheet's own name is `hue-<name>-solid`,
// and the soft and text steps of a hue are always derived. Internal tokens (the
// --ot-mix-* ratios, the accent inputs, the support button's coffee) are not part
// of a theme. Small and dependency-free: the first load uses it to serialise a
// resolved theme (apply.ts), the lazy chunk to validate and derive one.

export const HUES = ['red', 'orange', 'yellow', 'lime', 'green', 'teal', 'cyan', 'blue', 'indigo', 'violet', 'pink', 'slate'] as const
export type Hue = (typeof HUES)[number]

const STATUS = ['success', 'warning', 'danger', 'info'] as const

export const TOKEN_GROUPS = {
  surfaces: ['canvas', 'surface', 'raised', 'sunken', 'pop', 'hover', 'selected', 'selected-row', 'sidebar'],
  text: ['text-strong', 'text', 'muted', 'faint'],
  lines: ['border', 'border-soft', 'border-input', 'line-strong'],
  accent: ['accent', 'accent-hover', 'on-accent', 'accent-text', 'accent-soft', 'accent-soft-text', 'focus'],
  status: STATUS.flatMap((s) => [s, `${s}-soft`, `${s}-soft-text`]),
  priorities: ['p1', 'p2', 'p3', 'p4'].flatMap((p) => [p, `${p}-soft`]),
  labels: HUES.map((h) => `hue-${h}`),
  other: ['scrim', 'highlight', 'highlight-text', 'chart-base', 'chart-seq-1', 'chart-seq-2', 'chart-seq-3', 'chart-seq-4', 'chart-seq-5'],
} as const satisfies Record<string, readonly string[]>

/** Every token name a document may set explicitly, in group order. */
export const THEME_TOKENS: readonly string[] = Object.values(TOKEN_GROUPS).flat()

/** The only token that may be translucent in a document. */
export const ALPHA_TOKEN = 'scrim'

/**
 * Every custom property a resolved theme sets, without the `--ot-` prefix, in
 * stylesheet names: the document tokens (a hue as its solid step) and the two
 * derived steps of each hue.
 */
export const CSS_TOKENS: readonly string[] = [
  ...THEME_TOKENS.filter((t) => !t.startsWith('hue-')),
  ...HUES.flatMap((h) => [`hue-${h}-solid`, `hue-${h}-soft`, `hue-${h}-text`]),
]

/** The stylesheet name of a document token (`hue-red` is `hue-red-solid`). */
export function cssName(token: string): string {
  return token.startsWith('hue-') && !/-(solid|soft|text)$/.test(token) ? `${token}-solid` : token
}

/** The five radius steps a theme may set (design D1), in px; today's scale. */
export const RADIUS_STEPS = ['chip', 'control', 'card', 'surface', 'popover'] as const
export type RadiusStep = (typeof RADIUS_STEPS)[number]
export const DEFAULT_RADIUS: Record<RadiusStep, number> = { chip: 6, control: 7, card: 8, surface: 10, popover: 12 }

/** The list text sizes a theme may choose, in px (design-system "Comfortable reading scale"). */
export const LIST_SIZES = [13, 14, 15] as const

/** The font stacks of the type families other than the bundled Inter (design D1). */
export const FONT_STACKS = {
  system: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  serif: 'ui-serif, Georgia, Cambria, "Times New Roman", Times, serif',
  mono: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
} as const

/** A font installed on the device, named by letters, digits, spaces and hyphens. */
export const LOCAL_FONT = /^[A-Za-z0-9][A-Za-z0-9 -]{0,63}$/
