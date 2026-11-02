// The published colours of the built-in palettes and where each goes (OpenSpec change
// theme-catalogue, design D1, D3; web/src/lib/theme/builtin/MAPPING.md is the same
// mapping in prose). Every value here is copied from the palette's own project, as
// published; generate.ts turns each entry into a theme document in builtin/, moving
// only the lightness of a value that misses a contrast pair and recording the
// published value under notes.adapted. Test and generator only: the app never
// imports this file (the documents are the shipped form).
import type { ThemeKind } from '../format'
import type { Hue } from '../tokens'

export interface Project {
  /** The author credited on the card (theme document `author`). */
  author: string
  /** The copyright line of the project's licence file, verbatim. */
  copyright: string
  /** The project's address, shown as text. */
  source: string
  /** The licence file the notice was copied from, and the date it was checked. */
  licenceFile: string
  checked: string
}

export interface Palette {
  id: string
  name: string
  kind: ThemeKind
  /** The family (a light and dark pair share one) and the other side's id. */
  family: string
  counterpart?: string
  project: Project
  /** Seeds as published: canvas, surface, text, accent, and the four status colours. */
  seeds: { canvas: string; surface: string; text: string; accent: string; success: string; warning: string; danger: string; info: string }
  /** Explicit tokens as published (design D3), label hues by their document name. */
  tokens: Partial<Record<string, string>>
  /** The label hues the palette has, by nearest hue; the others are derived (MAPPING.md). */
  hues: Partial<Record<Hue, string>>
}

const CHECKED = '2026-11-01'

export const PROJECTS = {
  solarized: { author: 'Ethan Schoonover', copyright: 'Copyright (c) 2011 Ethan Schoonover', source: 'https://github.com/altercation/solarized', licenceFile: 'LICENSE', checked: CHECKED },
  gruvbox: { author: 'Pavel Pertsev', copyright: 'Copyright (c) 2018 Pavel Pertsev', source: 'https://github.com/morhetz/gruvbox', licenceFile: 'LICENSE.md of github.com/gruvbox-community/gruvbox (the original README states MIT/X11)', checked: CHECKED },
  catppuccin: { author: 'Catppuccin', copyright: 'Copyright (c) 2021 Catppuccin', source: 'https://github.com/catppuccin/catppuccin', licenceFile: 'LICENSE', checked: CHECKED },
  rosePine: { author: 'Rosé Pine', copyright: 'Copyright (c) 2023 Rosé Pine', source: 'https://github.com/rose-pine/rose-pine-theme', licenceFile: 'LICENSE', checked: CHECKED },
  tokyoNight: { author: 'Enkia', copyright: 'Copyright (c) 2018-present Enkia', source: 'https://github.com/enkia/tokyo-night-vscode-theme', licenceFile: 'LICENSE.txt', checked: CHECKED },
  oneLight: { author: 'GitHub Inc.', copyright: 'Copyright (c) 2016 GitHub Inc.', source: 'https://github.com/atom/one-light-syntax', licenceFile: 'LICENSE.md', checked: CHECKED },
  oneDark: { author: 'GitHub Inc.', copyright: 'Copyright (c) 2016 GitHub Inc.', source: 'https://github.com/atom/one-dark-syntax', licenceFile: 'LICENSE.md', checked: CHECKED },
  nord: { author: 'Sven Greb', copyright: 'Copyright (c) 2016-present Sven Greb <development@svengreb.de> (https://www.svengreb.de)', source: 'https://github.com/nordtheme/nord', licenceFile: 'license', checked: CHECKED },
  dracula: { author: 'Dracula Theme', copyright: 'Copyright (c) 2023 Dracula Theme', source: 'https://github.com/dracula/dracula-theme', licenceFile: 'LICENSE', checked: CHECKED },
} satisfies Record<string, Project>

// Solarized: base03..base3 and the eight accents of the project's README.
const SOL = { base03: '#002b36', base02: '#073642', base01: '#586e75', base00: '#657b83', base0: '#839496', base1: '#93a1a1', base2: '#eee8d5', base3: '#fdf6e3', yellow: '#b58900', orange: '#cb4b16', red: '#dc322f', magenta: '#d33682', violet: '#6c71c4', blue: '#268bd2', cyan: '#2aa198', green: '#859900' }
const solHues = { red: SOL.red, orange: SOL.orange, yellow: SOL.yellow, lime: SOL.green, teal: SOL.cyan, blue: SOL.blue, indigo: SOL.violet, pink: SOL.magenta }

// Gruvbox: the dark mode's bright and the light mode's faded colours of the README palette.
const GRUV_D = { bg0h: '#1d2021', bg0: '#282828', bg1: '#3c3836', bg2: '#504945', fg1: '#ebdbb2', fg0: '#fbf1c7', fg3: '#bdae93', fg4: '#a89984', gray: '#928374', red: '#fb4934', green: '#b8bb26', yellow: '#fabd2f', blue: '#83a598', purple: '#d3869b', aqua: '#8ec07c', orange: '#fe8019' }
const GRUV_L = { bg0s: '#f2e5bc', bg0: '#fbf1c7', bg1: '#ebdbb2', bg2: '#d5c4a1', fg1: '#3c3836', fg0: '#282828', fg3: '#665c54', fg4: '#7c6f64', gray: '#928374', red: '#9d0006', green: '#79740e', yellow: '#b57614', blue: '#076678', purple: '#8f3f71', aqua: '#427b58', orange: '#af3a03' }

// Catppuccin: the Latte and Mocha flavours of the palette.
const LATTE = { rosewater: '#dc8a78', flamingo: '#dd7878', pink: '#ea76cb', mauve: '#8839ef', red: '#d20f39', maroon: '#e64553', peach: '#fe640b', yellow: '#df8e1d', green: '#40a02b', teal: '#179299', sky: '#04a5e5', sapphire: '#209fb5', blue: '#1e66f5', lavender: '#7287fd', text: '#4c4f69', subtext1: '#5c5f77', subtext0: '#6c6f85', overlay2: '#7c7f93', overlay1: '#8c8fa1', overlay0: '#9ca0b0', surface2: '#acb0be', surface1: '#bcc0cc', surface0: '#ccd0da', base: '#eff1f5', mantle: '#e6e9ef', crust: '#dce0e8' }
const MOCHA = { rosewater: '#f5e0dc', flamingo: '#f2cdcd', pink: '#f5c2e7', mauve: '#cba6f7', red: '#f38ba8', maroon: '#eba0ac', peach: '#fab387', yellow: '#f9e2af', green: '#a6e3a1', teal: '#94e2d5', sky: '#89dceb', sapphire: '#74c7ec', blue: '#89b4fa', lavender: '#b4befe', text: '#cdd6f4', subtext1: '#bac2de', subtext0: '#a6adc8', overlay2: '#9399b2', overlay1: '#7f849c', overlay0: '#6c7086', surface2: '#585b70', surface1: '#45475a', surface0: '#313244', base: '#1e1e2e', mantle: '#181825', crust: '#11111b' }

// Rosé Pine: the main variant and Dawn.
const RP = { base: '#191724', surface: '#1f1d2e', overlay: '#26233a', muted: '#6e6a86', subtle: '#908caa', text: '#e0def4', love: '#eb6f92', gold: '#f6c177', rose: '#ebbcba', pine: '#31748f', foam: '#9ccfd8', iris: '#c4a7e7', hlLow: '#21202e', hlMed: '#403d52', hlHigh: '#524f67' }
const DAWN = { base: '#faf4ed', surface: '#fffaf3', overlay: '#f2e9e1', muted: '#9893a5', subtle: '#797593', text: '#575279', love: '#b4637a', gold: '#ea9d34', rose: '#d7827e', pine: '#286983', foam: '#56949f', iris: '#907aa9', hlLow: '#f4ede8', hlMed: '#dfdad9', hlHigh: '#cecacd' }

// Tokyo Night: the editor colours of the project's VS Code themes (themes/*.json).
const TN = { sidebar: '#16161e', editor: '#1a1b26', fg: '#a9b1d6', fgStrong: '#c0caf5', sidebarFg: '#787c99', comment: '#565f89', selection: '#202330', border: '#101014', red: '#f7768e', orange: '#ff9e64', yellow: '#e0af68', green: '#9ece6a', teal: '#73daca', cyan: '#7dcfff', blue: '#7aa2f7', magenta: '#bb9af7', purple: '#9d7cd8' }
const TNL = { sidebar: '#d6d8df', editor: '#e6e7ed', fg: '#343b59', description: '#707280', lineNumber: '#9da0ab', hover: '#e1e2e8', border: '#c1c2c7', red: '#8c4351', orange: '#965027', yellow: '#8f5e15', green: '#385f0d', teal: '#33635c', cyan: '#006c86', blue: '#2959aa', magenta: '#7b43ba', purple: '#65359d' }

// One Light and One Dark: styles/colors.less and syntax-variables.less of the Atom
// syntax themes, their hsl() values written as hex.
const ONE_L = { bg: '#fafafa', selection: '#e5e5e6', mono1: '#383a42', mono2: '#696c77', mono3: '#a0a1a7', cyan: '#0184bc', blue: '#4078f2', purple: '#a626a4', green: '#50a14f', red: '#e45649', red2: '#ca1243', orange: '#986801', orange2: '#c18401' }
const ONE_D = { bg: '#282c34', selection: '#3e4451', mono1: '#abb2bf', mono2: '#828997', mono3: '#5c6370', cyan: '#56b6c2', blue: '#61afef', purple: '#c678dd', green: '#98c379', red: '#e06c75', red2: '#be5046', orange: '#d19a66', orange2: '#e5c07b' }

// Nord: nord0 to nord15.
const NORD = ['#2e3440', '#3b4252', '#434c5e', '#4c566a', '#d8dee9', '#e5e9f0', '#eceff4', '#8fbcbb', '#88c0d0', '#81a1c1', '#5e81ac', '#bf616a', '#d08770', '#ebcb8b', '#a3be8c', '#b48ead']

// Dracula: the colour palette of the specification.
const DRAC = { background: '#282a36', currentLine: '#44475a', foreground: '#f8f8f2', comment: '#6272a4', cyan: '#8be9fd', green: '#50fa7b', orange: '#ffb86c', pink: '#ff79c6', purple: '#bd93f9', red: '#ff5555', yellow: '#f1fa8c' }

export const PALETTES: readonly Palette[] = [
  {
    id: 'solarized-light', name: 'Solarized Light', kind: 'light', family: 'solarized', counterpart: 'solarized-dark', project: PROJECTS.solarized,
    seeds: { canvas: SOL.base2, surface: SOL.base3, text: SOL.base00, accent: SOL.blue, success: SOL.green, warning: SOL.yellow, danger: SOL.red, info: SOL.cyan },
    tokens: { 'text-strong': SOL.base01, faint: SOL.base1, selected: SOL.base2 },
    hues: { ...solHues, slate: SOL.base1 },
  },
  {
    id: 'solarized-dark', name: 'Solarized Dark', kind: 'dark', family: 'solarized', counterpart: 'solarized-light', project: PROJECTS.solarized,
    seeds: { canvas: SOL.base03, surface: SOL.base03, text: SOL.base0, accent: SOL.blue, success: SOL.green, warning: SOL.yellow, danger: SOL.red, info: SOL.cyan },
    tokens: { 'text-strong': SOL.base1, faint: SOL.base01, raised: SOL.base02, selected: SOL.base02 },
    hues: { ...solHues, slate: SOL.base01 },
  },
  {
    id: 'gruvbox-light', name: 'Gruvbox Light', kind: 'light', family: 'gruvbox', counterpart: 'gruvbox-dark', project: PROJECTS.gruvbox,
    seeds: { canvas: GRUV_L.bg0s, surface: GRUV_L.bg0, text: GRUV_L.fg1, accent: GRUV_L.aqua, success: GRUV_L.green, warning: GRUV_L.yellow, danger: GRUV_L.red, info: GRUV_L.blue },
    tokens: { 'text-strong': GRUV_L.fg0, muted: GRUV_L.fg3, faint: GRUV_L.fg4, selected: GRUV_L.bg1 },
    hues: { red: GRUV_L.red, orange: GRUV_L.orange, yellow: GRUV_L.yellow, lime: GRUV_L.green, teal: GRUV_L.aqua, cyan: GRUV_L.blue, pink: GRUV_L.purple, slate: GRUV_L.gray },
  },
  {
    id: 'gruvbox-dark', name: 'Gruvbox Dark', kind: 'dark', family: 'gruvbox', counterpart: 'gruvbox-light', project: PROJECTS.gruvbox,
    seeds: { canvas: GRUV_D.bg0h, surface: GRUV_D.bg0, text: GRUV_D.fg1, accent: GRUV_D.aqua, success: GRUV_D.green, warning: GRUV_D.yellow, danger: GRUV_D.red, info: GRUV_D.blue },
    tokens: { 'text-strong': GRUV_D.fg0, muted: GRUV_D.fg3, faint: GRUV_D.gray, raised: GRUV_D.bg1, selected: GRUV_D.bg2 },
    hues: { red: GRUV_D.red, orange: GRUV_D.orange, yellow: GRUV_D.yellow, lime: GRUV_D.green, teal: GRUV_D.aqua, cyan: GRUV_D.blue, pink: GRUV_D.purple, slate: GRUV_D.gray },
  },
  {
    id: 'catppuccin-latte', name: 'Catppuccin Latte', kind: 'light', family: 'catppuccin', counterpart: 'catppuccin-mocha', project: PROJECTS.catppuccin,
    seeds: { canvas: LATTE.mantle, surface: LATTE.base, text: LATTE.text, accent: LATTE.mauve, success: LATTE.green, warning: LATTE.yellow, danger: LATTE.red, info: LATTE.blue },
    tokens: { muted: LATTE.subtext0, faint: LATTE.overlay1 },
    hues: { red: LATTE.red, orange: LATTE.peach, yellow: LATTE.yellow, green: LATTE.green, teal: LATTE.teal, cyan: LATTE.sky, blue: LATTE.blue, indigo: LATTE.lavender, violet: LATTE.mauve, pink: LATTE.pink, slate: LATTE.overlay2 },
  },
  {
    id: 'catppuccin-mocha', name: 'Catppuccin Mocha', kind: 'dark', family: 'catppuccin', counterpart: 'catppuccin-latte', project: PROJECTS.catppuccin,
    seeds: { canvas: MOCHA.mantle, surface: MOCHA.base, text: MOCHA.text, accent: MOCHA.mauve, success: MOCHA.green, warning: MOCHA.yellow, danger: MOCHA.red, info: MOCHA.blue },
    tokens: { muted: MOCHA.subtext0, faint: MOCHA.overlay1, raised: MOCHA.surface0, selected: MOCHA.surface1 },
    hues: { red: MOCHA.red, orange: MOCHA.peach, yellow: MOCHA.yellow, green: MOCHA.green, teal: MOCHA.teal, cyan: MOCHA.sky, blue: MOCHA.blue, indigo: MOCHA.lavender, violet: MOCHA.mauve, pink: MOCHA.pink, slate: MOCHA.overlay2 },
  },
  {
    id: 'rose-pine-dawn', name: 'Rosé Pine Dawn', kind: 'light', family: 'rose-pine', counterpart: 'rose-pine', project: PROJECTS.rosePine,
    seeds: { canvas: DAWN.base, surface: DAWN.surface, text: DAWN.text, accent: DAWN.iris, success: DAWN.pine, warning: DAWN.gold, danger: DAWN.love, info: DAWN.foam },
    tokens: { muted: DAWN.subtle, faint: DAWN.muted, raised: DAWN.overlay, selected: DAWN.hlMed },
    hues: { red: DAWN.love, yellow: DAWN.gold, pink: DAWN.rose, blue: DAWN.pine, cyan: DAWN.foam, violet: DAWN.iris, slate: DAWN.muted },
  },
  {
    id: 'rose-pine', name: 'Rosé Pine', kind: 'dark', family: 'rose-pine', counterpart: 'rose-pine-dawn', project: PROJECTS.rosePine,
    seeds: { canvas: RP.base, surface: RP.surface, text: RP.text, accent: RP.iris, success: RP.pine, warning: RP.gold, danger: RP.love, info: RP.foam },
    tokens: { muted: RP.subtle, faint: RP.muted, raised: RP.overlay, hover: RP.hlLow, selected: RP.hlMed },
    hues: { red: RP.love, yellow: RP.gold, pink: RP.rose, blue: RP.pine, cyan: RP.foam, violet: RP.iris, slate: RP.muted },
  },
  {
    id: 'tokyo-night-light', name: 'Tokyo Night Light', kind: 'light', family: 'tokyo-night', counterpart: 'tokyo-night', project: PROJECTS.tokyoNight,
    seeds: { canvas: TNL.sidebar, surface: TNL.editor, text: TNL.fg, accent: TNL.blue, success: TNL.green, warning: TNL.yellow, danger: TNL.red, info: TNL.cyan },
    tokens: { muted: TNL.description, faint: TNL.lineNumber, hover: TNL.hover, border: TNL.border },
    hues: { red: TNL.red, orange: TNL.orange, yellow: TNL.yellow, lime: TNL.green, teal: TNL.teal, cyan: TNL.cyan, blue: TNL.blue, violet: TNL.magenta, indigo: TNL.purple, slate: TNL.description },
  },
  {
    id: 'tokyo-night', name: 'Tokyo Night', kind: 'dark', family: 'tokyo-night', counterpart: 'tokyo-night-light', project: PROJECTS.tokyoNight,
    seeds: { canvas: TN.sidebar, surface: TN.editor, text: TN.fg, accent: TN.blue, success: TN.green, warning: TN.yellow, danger: TN.red, info: TN.cyan },
    tokens: { 'text-strong': TN.fgStrong, muted: TN.sidebarFg, faint: TN.comment, selected: TN.selection },
    hues: { red: TN.red, orange: TN.orange, yellow: TN.yellow, lime: TN.green, teal: TN.teal, cyan: TN.cyan, blue: TN.blue, violet: TN.magenta, indigo: TN.purple, slate: TN.comment },
  },
  {
    id: 'one-light', name: 'One Light', kind: 'light', family: 'one', counterpart: 'one-dark', project: PROJECTS.oneLight,
    seeds: { canvas: ONE_L.bg, surface: ONE_L.bg, text: ONE_L.mono1, accent: ONE_L.blue, success: ONE_L.green, warning: ONE_L.orange2, danger: ONE_L.red, info: ONE_L.cyan },
    tokens: { muted: ONE_L.mono2, faint: ONE_L.mono3, selected: ONE_L.selection },
    hues: { red: ONE_L.red, orange: ONE_L.orange, yellow: ONE_L.orange2, green: ONE_L.green, cyan: ONE_L.cyan, blue: ONE_L.blue, violet: ONE_L.purple, pink: ONE_L.red2, slate: ONE_L.mono3 },
  },
  {
    id: 'one-dark', name: 'One Dark', kind: 'dark', family: 'one', counterpart: 'one-light', project: PROJECTS.oneDark,
    seeds: { canvas: ONE_D.bg, surface: ONE_D.bg, text: ONE_D.mono1, accent: ONE_D.blue, success: ONE_D.green, warning: ONE_D.orange2, danger: ONE_D.red, info: ONE_D.cyan },
    tokens: { muted: ONE_D.mono2, faint: ONE_D.mono3, selected: ONE_D.selection },
    hues: { red: ONE_D.red, orange: ONE_D.orange, yellow: ONE_D.orange2, green: ONE_D.green, cyan: ONE_D.cyan, blue: ONE_D.blue, violet: ONE_D.purple, pink: ONE_D.red2, slate: ONE_D.mono3 },
  },
  {
    id: 'nord', name: 'Nord', kind: 'dark', family: 'nord', project: PROJECTS.nord,
    seeds: { canvas: NORD[0], surface: NORD[0], text: NORD[4], accent: NORD[8], success: NORD[14], warning: NORD[13], danger: NORD[11], info: NORD[9] },
    tokens: { 'text-strong': NORD[6], faint: NORD[3], raised: NORD[1], selected: NORD[2] },
    hues: { red: NORD[11], orange: NORD[12], yellow: NORD[13], lime: NORD[14], teal: NORD[7], cyan: NORD[8], blue: NORD[9], pink: NORD[15], slate: NORD[3] },
  },
  {
    id: 'dracula', name: 'Dracula', kind: 'dark', family: 'dracula', project: PROJECTS.dracula,
    seeds: { canvas: DRAC.background, surface: DRAC.background, text: DRAC.foreground, accent: DRAC.purple, success: DRAC.green, warning: DRAC.orange, danger: DRAC.red, info: DRAC.cyan },
    tokens: { faint: DRAC.comment, selected: DRAC.currentLine },
    hues: { red: DRAC.red, orange: DRAC.orange, yellow: DRAC.yellow, green: DRAC.green, cyan: DRAC.cyan, violet: DRAC.purple, pink: DRAC.pink, slate: DRAC.comment },
  },
]
