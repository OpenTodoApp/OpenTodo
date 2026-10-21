// The accent themes (OpenSpec change theming, design D6): the one ordered list the
// settings panel, the preference reader, the bar colour and the tests use. The
// values live in index.css ([data-accent="…"] blocks); theme.test.ts keeps the two
// in step. Emerald is the default. There is deliberately no red accent, so the
// accent is never confused with priority 1 or danger.
export const ACCENTS = [
  { id: 'emerald', label: 'Emerald', bar: '#047857' },
  { id: 'blue', label: 'Blue', bar: '#1d4ed8' },
  { id: 'indigo', label: 'Indigo', bar: '#4338ca' },
  { id: 'violet', label: 'Violet', bar: '#6d28d9' },
  { id: 'rose', label: 'Rose', bar: '#be123c' },
  { id: 'orange', label: 'Orange', bar: '#c2410c' },
  { id: 'teal', label: 'Teal', bar: '#0f766e' },
  { id: 'graphite', label: 'Graphite', bar: '#334155' },
] as const

export type AccentId = (typeof ACCENTS)[number]['id']

export const DEFAULT_ACCENT: AccentId = 'emerald'

/** The bar colour in dark mode: the dark canvas, whatever the accent. */
export const DARK_BAR = '#0c0f16'

export function isAccent(v: unknown): v is AccentId {
  return typeof v === 'string' && ACCENTS.some((a) => a.id === v)
}

/** The seven tokens an accent sets, in light and dark. */
export const ACCENT_TOKENS = ['accent', 'accent-hover', 'on-accent', 'accent-text', 'accent-soft', 'accent-soft-text', 'focus'] as const
