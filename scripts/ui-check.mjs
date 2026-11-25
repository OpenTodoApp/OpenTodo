// Design-system check (OpenSpec change ui-primitives, design D10), run by
// `make check`:
//   1. every component file in web/src/ui has a sibling *.stories.tsx,
//   2. no emoji or Unicode glyph is used as an icon in web/src/app (use <Icon>),
//   3. no user-facing text in web/src/app and web/src/ui bypasses the message layer
//      (OpenSpec change app-localization, design D8; scripts/i18n/untranslated.mjs,
//      exceptions in scripts/i18n/allow.txt),
//   4. "Learn more" is rendered only by the LearnMore element (settings-refresh D2),
//   5. no screen in web/src/app renders a raw radio input: use RadioGroup from web/src/ui
//      (OpenSpec change settings-foundation, design D7; files still being moved are in
//      RAW_RADIO_ALLOWED and leave it as they move),
//   6. a priority level is named only through web/src/lib/priority.ts (OpenSpec change
//      priority-names, design D3): no raw "Priority {n}" message elsewhere, so a renamed
//      level reads the same on every screen.
//   7. layout classes name the start and end of the line, not left and right (OpenSpec
//      change arabic-rtl, design D3): `ms-2`, `ps-4`, `inset-s-0`, `text-start`,
//      `border-e`, `rounded-s-control`. A box placed by screen coordinates keeps
//      `left-0` with a `// physical: <reason>` comment on the line or the line above;
//      a centring `left-1/2` is fine.
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

// "Learn more" (OpenSpec change settings-refresh, design D2; settings-navigation
// "Learn more links") comes only from the LearnMore element, which points like a link.
export function learnMoreProblems(file, text) {
  if (file.endsWith('web/src/ui/LearnMore.tsx')) return []
  const out = []
  text.split('\n').forEach((line, i) => {
    const code = line.replace(/\/\/.*$/, '').replace(/^\s*\*.*$/, '')
    if (/t\(\s*['"]Learn more['"]\s*\)|>\s*Learn more\s*</.test(code)) out.push(`${file}:${i + 1}: "Learn more" outside the LearnMore element: ${line.trim().slice(0, 100)}`)
  })
  return out
}

// Raw radio inputs (OpenSpec change settings-foundation, design D7; design-system
// "Form controls"): a screen chooses one of several options with RadioGroup, whose
// mark takes the accent and whose group carries its label. The files below still
// render their own and are moved one by one; the list only shrinks.
export const RAW_RADIO_ALLOWED = new Set([
  'web/src/app/NewBoardDialog.tsx',
  'web/src/app/task-detail/TaskPageDialog.tsx',
])

export function rawRadioProblems(file, text) {
  if (RAW_RADIO_ALLOWED.has(file)) return []
  const out = []
  text.split('\n').forEach((line, i) => {
    const code = line.replace(/\/\/.*$/, '').replace(/^\s*\*.*$/, '')
    if (/<input\b[^>]*\btype=(?:"radio"|'radio'|\{\s*['"]radio['"]\s*\})/.test(code)) out.push(`${file}:${i + 1}: a raw radio input (use RadioGroup from web/src/ui)`)
  })
  return out
}

// A level's name (OpenSpec change priority-names, design D3): the raw message
// "Priority {n}" (any one placeholder) is used only by lib/priority.ts, whose
// priorityName, priorityShort and priorityAccessibleName read the person's names.
export const PRIORITY_NAME_HELPER = 'web/src/lib/priority.ts'

export function rawPriorityNameProblems(file, text) {
  if (file === PRIORITY_NAME_HELPER) return []
  const out = []
  text.split('\n').forEach((line, i) => {
    const code = line.replace(/\/\/.*$/, '').replace(/^\s*\*.*$/, '')
    if (/\b(?:t|msg)\(\s*(['"`])Priority \{\w+\}\1/.test(code)) out.push(`${file}:${i + 1}: a raw "Priority {n}" message (use priorityName from lib/priority.ts)`)
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

// illustrations-v2: two stroke weights (the main line and the fine detail line), shape
// fills from three surface tokens only, and at most one accent shape per drawing.
export const ILLUSTRATION_STROKES = ['1.75', '1']
const ILLUSTRATION_FILLS = ['none', 'var(--color-surface)', 'var(--color-sunken)', 'var(--color-accent)']

export function illustrationProblems(file, text) {
  const out = []
  if (Buffer.byteLength(text, 'utf8') > ILLUSTRATION_MAX_BYTES) out.push(`${file}: over ${ILLUSTRATION_MAX_BYTES} bytes`)
  let accents = 0
  text.split('\n').forEach((line, i) => {
    const code = line.replace(/\/\/.*$/, '')
    for (const [re, what] of ILLUSTRATION_RULES) if (re.test(code)) out.push(`${file}:${i + 1}: ${what}`)
    for (const [, w] of code.matchAll(/strokeWidth="([^"]*)"/g)) {
      if (!ILLUSTRATION_STROKES.includes(w)) out.push(`${file}:${i + 1}: stroke width ${w} (use ${ILLUSTRATION_STROKES.join(' or ')})`)
    }
    for (const [, f] of code.matchAll(/\bfill="([^"]*)"/g)) {
      if (!ILLUSTRATION_FILLS.includes(f)) out.push(`${file}:${i + 1}: fill ${f} (use the surface, the sunken surface or the accent)`)
      if (f === 'var(--color-accent)') accents++
    }
  })
  if (accents > 1) out.push(`${file}: ${accents} accent shapes (at most one)`)
  return out
}

// Physical direction utilities (rule 7): the ones with a logical twin in Tailwind.
const PHYSICAL = new RegExp(String.raw`(?:^|[\s"'\x60{])(?:[\w\-\[\]&>*=.:/@()]+?:)*!?-?(` +
  String.raw`(?:ml|mr|pl|pr|scroll-ml|scroll-mr|scroll-pl|scroll-pr|left|right)-(?:\d+(?:\.\d+)?(?:\/\d+)?|px|auto|full|safe|\[[^\]\s]+\]|\([^)\s]+\))` +
  String.raw`|border-[lr](?:-[\w\[\]().%/-]+)?|rounded-(?:tl|tr|bl|br|l|r)(?:-[\w\[\]()-]+)?|text-(?:left|right)` +
  String.raw`|float-(?:left|right)|clear-(?:left|right)|origin-(?:left|right|top-left|top-right|bottom-left|bottom-right)` +
  String.raw`|bg-(?:linear|gradient)-to-(?:l|r|tl|tr|bl|br)|object-(?:left|right)(?:-top|-bottom)?|bg-(?:left|right)(?:-top|-bottom)?` +
  String.raw`)(?=$|[\s"'\x60!};])`, 'g')
// A horizontal translate moves the same way in both directions: it needs an `rtl:` twin
// on the line, or it is a centring `-translate-x-1/2` with `left-1/2`.
const TRANSLATE_X = /(?:^|[\s"'\x60{])(?:[\w\-\[\]&>*=.:/@()]+?:)*!?-?translate-x-[\w.\[\]/()-]+/g
// Inline styles with a physical side.
const STYLE_SIDE = /\b(left|right|marginLeft|marginRight|paddingLeft|paddingRight)\s*:\s*[^,}\s]|\btextAlign\s*:\s*['"](?:left|right)['"]/
const PHYSICAL_NOTE = /(\/\/|\/\*)\s*physical:/

export function physicalDirectionProblems(file, text) {
  const out = []
  // A box drawn from coordinates and kept left to right (arabic-rtl D8) says so once, near the top.
  if (/^\/\/ physical-file:/m.test(text.split('\n').slice(0, 40).join('\n'))) return out
  const lines = text.split('\n')
  const hint = 'use its start/end twin (ms, me, ps, pe, inset-s, inset-e, text-start, border-s, rounded-s, ps-safe) so right to left mirrors'
  lines.forEach((line, i) => {
    if (PHYSICAL_NOTE.test(line) || PHYSICAL_NOTE.test(lines[i - 1] ?? '')) return
    if (/^\s*(\/\/|\*|\/\*)/.test(line)) return
    for (const m of line.matchAll(PHYSICAL)) {
      if (/^-?(left|right)-1\/2$/.test(m[1])) continue
      out.push(`${file}:${i + 1}: \`${m[1]}\` is a physical direction; ${hint}`)
    }
    const translates = [...line.matchAll(TRANSLATE_X)].map((m) => m[0].trim().replace(/^["'\x60{]/, ''))
    const moving = translates.filter((x) => !/^(?:[\w\-\[\]&>*=.:/@()]+?:)*!?-translate-x-1\/2$/.test(x))
    if (moving.length && !/\brtl:/.test(line)) {
      out.push(`${file}:${i + 1}: \`${moving[0]}\` moves the same way right to left; add its \`rtl:\` twin, or say \`// physical: <reason>\``)
    }
    if (/style=\{\{|style:\s*\{/.test(line)) {
      const m = line.match(STYLE_SIDE)
      if (m) out.push(`${file}:${i + 1}: inline style \`${m[0].trim()}\` is a physical side; use insetInlineStart/End, marginInline*, paddingInline*, textAlign 'start'/'end', or say \`// physical: <reason>\``)
    }
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
    ...[...walk(app), ...walk(join(repo, 'web/src/ui'))].filter((f) => /\.tsx?$/.test(f) && !/\.(test|stories)\.tsx?$/.test(f))
      .flatMap((f) => learnMoreProblems(relative(repo, f), readFileSync(f, 'utf8'))),
    ...walk(app).filter((f) => f.endsWith('.tsx') && !/\.(test|stories)\.tsx$/.test(f))
      .flatMap((f) => rawRadioProblems(relative(repo, f), readFileSync(f, 'utf8'))),
    ...[...walk(app), ...walk(join(repo, 'web/src/lib')), ...walk(join(repo, 'web/src/ui'))].filter((f) => /\.tsx?$/.test(f) && !/\.(test|stories)\.tsx?$/.test(f))
      .flatMap((f) => rawPriorityNameProblems(relative(repo, f), readFileSync(f, 'utf8'))),
    ...[...walk(app), ...walk(join(repo, 'web/src/lib')), ...walk(join(repo, 'web/src/ui'))].filter((f) => /\.tsx?$/.test(f) && !/\.(test|stories)\.tsx?$/.test(f) && !/\/icons\//.test(f))
      .flatMap((f) => physicalDirectionProblems(relative(repo, f), readFileSync(f, 'utf8'))),
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
