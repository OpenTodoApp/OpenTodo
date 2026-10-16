// OpenSpec design-system "Accessible contrast in both themes": every token pair the
// UI is allowed to use, with its WCAG minimum. contrast.test.ts checks them against
// the real values in index.css for light and dark. Add a pair here before using a
// new foreground/background combination in src/ui.
export type Pair = { fg: string; bg: string; min: number; kind: 'text' | 'ui' | 'chip' }

const SURFACES = ['canvas', 'surface', 'raised', 'sunken']
const TEXT = ['text-strong', 'text', 'muted', 'faint']
export const HUE_NAMES = ['red', 'orange', 'yellow', 'lime', 'green', 'teal', 'cyan', 'blue', 'indigo', 'violet', 'pink', 'slate'] as const

const text = (fg: string, bgs: string[]): Pair[] => bgs.map((bg) => ({ fg, bg, min: 4.5, kind: 'text' }))
const ui = (fg: string, bgs: string[]): Pair[] => bgs.map((bg) => ({ fg, bg, min: 3, kind: 'ui' }))

export const PAIRS: Pair[] = [
  ...TEXT.flatMap((fg) => text(fg, SURFACES)),
  ...text('accent-text', ['canvas', 'surface', 'raised']),
  ...text('on-accent', ['accent', 'accent-hover']),
  ...text('accent-soft-text', ['accent-soft']),
  ...['success', 'warning', 'danger', 'info'].flatMap((s) => [
    ...text(s, ['canvas', 'surface', 'raised']),
    ...text(`${s}-soft-text`, [`${s}-soft`]),
  ]),
  ...text('highlight-text', ['highlight']),
  ...ui('border-input', ['canvas', 'surface', 'sunken']),
  // The three surfaces and the board column (ux-overhaul task 8.6): a row, a card and
  // an overlay keep their text pairs on `sunken` and `raised` in dark too (covered by
  // TEXT × SURFACES above); the hairline that separates them in dark only needs to be visible.
  ...['canvas', 'surface', 'sunken', 'raised'].map((bg): Pair => ({ fg: 'border', bg, min: 1.1, kind: 'ui' })),
  ...ui('focus', ['canvas', 'surface', 'raised']),
  ...['p1', 'p2', 'p3', 'p4'].flatMap((p) => ui(p, ['canvas', 'surface'])),
  ...HUE_NAMES.flatMap((h): Pair[] => [
    ...ui(`hue-${h}-solid`, ['surface']),
    { fg: `hue-${h}-text`, bg: `hue-${h}-soft`, min: 4.5, kind: 'chip' },
  ]),
]

/** Minimums inside the high-contrast override: 7:1 for text and chips, 3:1 for everything else. */
const HIGH_TEXT = 7
const HIGH_UI = 3

/**
 * Token overrides measured on top of a mode (OpenSpec display-mode D4,
 * design-system "High-contrast and no-motion presentation"). In high contrast the
 * same pairs are checked with raised minimums, and the priority hues are also
 * text (the display's priority marks), so they need 7:1 on the surfaces too.
 */
export const OVERRIDE_PAIRS: Record<'contrast-high', Pair[]> = {
  'contrast-high': [
    ...PAIRS.map((p): Pair => ({ ...p, min: p.kind === 'ui' ? Math.max(p.min, HIGH_UI) : Math.max(p.min, HIGH_TEXT) })),
    ...['p1', 'p2', 'p3', 'p4'].flatMap((p) => ['canvas', 'surface'].map((bg): Pair => ({ fg: p, bg, min: HIGH_TEXT, kind: 'text' }))),
  ],
}
