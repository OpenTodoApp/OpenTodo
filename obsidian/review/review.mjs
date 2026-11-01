// What Obsidian's community directory checks after each release of the plugin
// (its "Manifest", "Releases", "Source code" and "Build verification" sections),
// run on the release repository's contents before they are pushed (obsidian-plugin
// D14). Run after `make obsidian`, with obsidian/review's dependencies installed:
//
//   node obsidian/review/review.mjs
//
// 1. scripts/mirror.mjs fills an empty folder as the release job fills
//    OpenTodoApp/obsidian-opentodo.
// 2. Build verification: `npm ci` there, `npm audit` (no known vulnerability),
//    `npm run build`, and main.js and styles.css must be byte for byte the ones
//    in obsidian/dist, which the release attaches.
// 3. The sources there type-check on their own (web/'s TypeScript).
// 4. Source code: the directory's ESLint rules (eslint.config.mjs) report no error.
//    Warnings are printed; the directory does not block on them.
// The manifest and README rules are unit tests (test/review.test.ts).
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mirror } from '../scripts/mirror.mjs'

const here = (p) => fileURLToPath(new URL(p, import.meta.url))
const dist = here('../dist')
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'

function run(cmd, args, cwd) {
  execFileSync(cmd, args, { cwd, stdio: 'inherit' })
}

const version = JSON.parse(readFileSync(here('../manifest.json'), 'utf8')).version
const dir = mkdtempSync(join(tmpdir(), 'obsidian-opentodo-'))
let failed = false
try {
  mirror(version, dir)
  console.log(`review: release repository for ${version} in ${dir}`)

  run(npm, ['ci', '--no-fund', '--no-audit'], dir)
  run(npm, ['audit', '--audit-level=low'], dir)
  rmSync(join(dir, 'main.js'))
  rmSync(join(dir, 'styles.css'))
  run(npm, ['run', 'build'], dir)
  for (const f of ['main.js', 'styles.css']) {
    if (!readFileSync(join(dir, f)).equals(readFileSync(join(dist, f)))) {
      console.error(`review: ${f} built in the release repository differs from obsidian/dist/${f}`)
      failed = true
    }
  }
  if (!failed) console.log('review: npm run build in the release repository gives the released main.js and styles.css')

  run(here('../../web/node_modules/.bin/tsc'), ['-p', join(dir, 'tsconfig.json')], dir)
  console.log('review: the release repository type-checks')

  const eslint = spawnSync(here('./node_modules/.bin/eslint'), ['-c', here('./eslint.config.mjs'), '-f', 'json', '.'], { cwd: dir, encoding: 'utf8', maxBuffer: 64 << 20 })
  if (eslint.error || !eslint.stdout) throw eslint.error ?? new Error(eslint.stderr)
  const results = JSON.parse(eslint.stdout)
  let errors = 0
  let warnings = 0
  /** Warnings by file and rule, with the first message: the vocabulary files alone give dozens of one kind. */
  const grouped = new Map()
  for (const r of results) {
    for (const m of r.messages) {
      const where = `${relative(dir, r.filePath)}:${m.line ?? 0}:${m.column ?? 0}`
      const text = `${m.ruleId ?? ''} ${m.message.split('\n')[0]}`
      if (m.severity === 2) {
        errors++
        console.log(`  error ${where} ${text}`)
        continue
      }
      warnings++
      const key = `${relative(dir, r.filePath)} ${m.ruleId ?? ''}`
      const g = grouped.get(key) ?? { where, text, n: 0 }
      g.n++
      grouped.set(key, g)
    }
  }
  for (const g of grouped.values()) console.log(`  warning ${g.where} ${g.text}${g.n > 1 ? ` (${g.n} in this file)` : ''}`)
  console.log(`review: ${results.length} files linted with the directory's rules, ${errors} errors, ${warnings} warnings`)
  if (errors > 0) failed = true
} finally {
  rmSync(dir, { recursive: true, force: true })
}
if (failed) process.exit(1)
