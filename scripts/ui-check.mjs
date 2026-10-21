// Design-system check (OpenSpec change ui-primitives, design D10), run by
// `make check`:
//   1. every component file in web/src/ui has a sibling *.stories.tsx,
//   2. no emoji or Unicode glyph is used as an icon in web/src/app (use <Icon>),
//   3. no user-facing text in web/src/app and web/src/ui bypasses the message layer
//      (OpenSpec change app-localization, design D8; scripts/i18n/untranslated.mjs,
//      exceptions in scripts/i18n/allow.txt).
// A glyph counts as an icon when it stands alone in a string or JSX text, starts or
// ends a label ("✓ Complete", "Next ›"), or is a trigger=/icon= prop. Typography
// inside copy ("Settings → Integrations", "2 × 3") is fine.
//
//   node scripts/ui-check.mjs            (exit 1 with file:line for each problem)
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { untranslated } from './i18n/untranslated.mjs'

const repo = fileURLToPath(new URL('..', import.meta.url))
const walk = (dir) => readdirSync(dir).flatMap((n) => {
  const p = join(dir, n)
  return statSync(p).isDirectory() ? walk(p) : [p]
})

export const GLYPHS = '⋯✕×▸▾›‹←→✓✔↻↳⏰☰○↶⌄▦≡↑↓⇧★☆✎✗'
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u
const G = `[${GLYPHS}]`
const ICON_PATTERNS = [
  new RegExp(`(['"\`])\\s*${G}+\\s*\\1`), // a string that is only glyphs: '✓', "⋯"
  new RegExp(`>\\s*${G}+\\s*<`), // JSX text that is only glyphs: >✕<
  new RegExp(`>\\s*${G}\\s+[\\p{L}{]`, 'u'), // a label starting with a glyph: >✓ Complete<
  new RegExp(`[\\p{L}}]\\s+${G}\\s*<`, 'u'), // a label ending with a glyph: Next ›<
  new RegExp(`(?:trigger|icon)=\\{?\\s*(['"\`])[^'"\`]*${G}`), // trigger="⋯"
  new RegExp(`(['"\`])${G}\\s+[\\p{L}]`, 'u'), // a string starting with a glyph: '✓ Done'
]

export function iconProblems(file, text) {
  const out = []
  text.split('\n').forEach((line, i) => {
    const code = line.replace(/\/\/.*$/, '').replace(/^\s*\*.*$/, '').replace(/\/\*.*?\*\//g, '')
    // A separator joined into text ("Work › Q3 plan") is typography.
    const typography = /\.join\(\s*(['"`])\s*\S\s*\1\s*\)/.test(code)
    if (EMOJI.test(code) || (!typography && ICON_PATTERNS.some((re) => re.test(code)))) out.push(`${file}:${i + 1}: ${line.trim().slice(0, 120)}`)
  })
  return out
}

// A due's wall time joined into text ("`${due.time}`", "{task.due.time}") skips the
// user's time format and the viewer's zone (OpenSpec change ux-feedback-2, D3): go
// through formatDueLong/describeDue/formatTime in lib/dates.ts instead.
const RAW_DUE_TIME = [
  /\$\{[^}]*\bdue\??\.time\b[^}]*\}/, // a template literal: `${task.due.time}`
  />\s*\{\s*[\w.?]*\bdue\??\.time\s*\}/, // JSX text: >{task.due.time}<
  /\+\s*[\w.?]*\bdue\??\.time\b|\bdue\??\.time\s*\+/, // string concatenation
]

export function rawDueTimeProblems(file, text) {
  const out = []
  text.split('\n').forEach((line, i) => {
    // A due time given to formatTime, or only tested (`due.time ?`, `due.time &&`), is not raw text.
    const code = line.replace(/\/\/.*$/, '').replace(/^\s*\*.*$/, '')
      .replace(/formatTime\(\s*[\w.?]*\bdue\??\.time\b/g, 'formatTime(t').replace(/\bdue\??\.time\s*(\?(?!\.)|&&)/g, 'cond $1')
    if (RAW_DUE_TIME.some((re) => re.test(code))) out.push(`${file}:${i + 1}: raw due time in text (use formatDueLong or formatTime): ${line.trim().slice(0, 100)}`)
  })
  return out
}

// Illustrations (OpenSpec change inbox-means-unplaced, design D9; design-system
// "Illustrations") use the design tokens only: no hard-coded colour, no raster or
// external image, no text, no gradient or filter, and at most 4 KB per file.
export const ILLUSTRATION_MAX_BYTES = 4096
const ILLUSTRATION_RULES = [
  [/#[0-9a-fA-F]{3,8}\b/, 'a hard-coded hex colour (use a token: currentColor or var(--color-…))'],
  [/\brgba?\(|\bhsla?\(|\boklch\(/, 'a hard-coded colour function (use a token)'],
  [/<image\b|xlinkHref|xlink:href|\bhref=|\.png\b|\.jpe?g\b|\.webp\b|data:image/, 'a raster or external image'],
  [/<text\b|<tspan\b/, 'text inside the drawing (the message belongs beside it)'],
  [/Gradient\b|<filter\b|<feDropShadow\b/, 'a gradient, filter or shadow'],
]

export function illustrationProblems(file, text) {
  const out = []
  if (Buffer.byteLength(text, 'utf8') > ILLUSTRATION_MAX_BYTES) out.push(`${file}: over ${ILLUSTRATION_MAX_BYTES} bytes`)
  text.split('\n').forEach((line, i) => {
    const code = line.replace(/\/\/.*$/, '')
    for (const [re, what] of ILLUSTRATION_RULES) if (re.test(code)) out.push(`${file}:${i + 1}: ${what}`)
  })
  return out
}

function storyProblems() {
  const ui = join(repo, 'web/src/ui')
  return walk(ui)
    .filter((f) => f.endsWith('.tsx') && !/\.(stories|test)\.tsx$/.test(f) && !/test-utils|\/tokens\//.test(f))
    .filter((f) => /export (function|const) [A-Z]/.test(readFileSync(f, 'utf8')))
    .filter((f) => {
      const dir = dirname(f)
      const stem = basename(f, '.tsx')
      const siblings = readdirSync(dir).filter((n) => n.endsWith('.stories.tsx'))
      const covers = (s) => readFileSync(join(dir, s), 'utf8').includes(`from './${stem}'`)
      return !siblings.some(covers)
    })
    .map((f) => `${relative(repo, f)}: no stories file imports this component`)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const app = join(repo, 'web/src/app')
  const problems = [
    ...storyProblems(),
    ...walk(app).filter((f) => f.endsWith('.tsx') && !/\.test\.tsx$/.test(f))
      .flatMap((f) => iconProblems(relative(repo, f), readFileSync(f, 'utf8'))),
    ...[...walk(app), ...walk(join(repo, 'web/src/ui'))].filter((f) => /\.tsx?$/.test(f) && !/\.(test|stories)\.tsx?$/.test(f))
      .flatMap((f) => rawDueTimeProblems(relative(repo, f), readFileSync(f, 'utf8'))),
    ...walk(join(repo, 'web/src/ui/illustrations')).filter((f) => f.endsWith('.tsx') && !/\.(test|stories)\.tsx$/.test(f))
      .flatMap((f) => illustrationProblems(relative(repo, f), readFileSync(f, 'utf8'))),
    ...untranslated().map((p) => `${p} (untranslated: wrap it in t() or add it to scripts/i18n/allow.txt)`),
  ]
  if (problems.length) {
    console.error(`ui-check: ${problems.length} problem(s)\n${problems.map((p) => `  - ${p}`).join('\n')}`)
    process.exit(1)
  }
  console.log('ui-check: ok')
}
