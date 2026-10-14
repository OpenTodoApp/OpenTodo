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
  ...ui('focus', ['canvas', 'surface', 'raised']),
  ...['p1', 'p2', 'p3', 'p4'].flatMap((p) => ui(p, ['canvas', 'surface'])),
  ...HUE_NAMES.flatMap((h): Pair[] => [
    ...ui(`hue-${h}-solid`, ['surface']),
    { fg: `hue-${h}-text`, bg: `hue-${h}-soft`, min: 4.5, kind: 'chip' },
  ]),
]
