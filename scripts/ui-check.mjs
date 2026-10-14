// Design-system check (OpenSpec change ui-primitives, design D10), run by
// `make check`:
//   1. every component file in web/src/ui has a sibling *.stories.tsx,
//   2. no emoji or Unicode glyph is used as an icon in web/src/app (use <Icon>).
// A glyph counts as an icon when it stands alone in a string or JSX text, starts or
// ends a label ("✓ Complete", "Next ›"), or is a trigger=/icon= prop. Typography
// inside copy ("Settings → Integrations", "2 × 3") is fine.
//
//   node scripts/ui-check.mjs            (exit 1 with file:line for each problem)
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

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
  ]
  if (problems.length) {
    console.error(`ui-check: ${problems.length} problem(s)\n${problems.map((p) => `  - ${p}`).join('\n')}`)
    process.exit(1)
  }
  console.log('ui-check: ok')
}
