#!/usr/bin/env node
// The web app's size budget (M9 of the 2026-10 audit). Reads the built app in
// internal/web/dist and measures, gzip-compressed, the entry chunk index.html loads and
// everything it imports statically (what a first visit downloads before the first screen;
// lazy chunks such as the help bundle, the map and the locales are not counted). Fails when
// either is over its budget in web/bundle-budget.json.
//
//   node scripts/bundle-budget.mjs           check (CI: after `npm run build` in the Web build job)
//   node scripts/bundle-budget.mjs --json    print the sizes as JSON
//
// To raise a budget on purpose, run it, set the new numbers in web/bundle-budget.json with a
// few KB of headroom, and say why in the pull request (AGENTS.md: report bundle size impact).

import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, posix } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gzipSync } from 'node:zlib'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DIST = join(ROOT, 'internal/web/dist')

/** Relative paths a built chunk imports statically: `import … from"./x.js"`, `import"./x.js"`, `export … from"./x.js"`. */
export function staticImports(code) {
  const out = new Set()
  for (const m of code.matchAll(/(?:\bimport|\bexport)\s*(?:[\w*{}\s,$]+?\s*from\s*)?["'](\.{1,2}\/[^"']+\.js)["']/g)) out.add(m[1])
  return [...out]
}

/** The entry chunk, its static closure and their gzip sizes, in bytes. */
export function measure(dist = DIST) {
  const html = readFileSync(join(dist, 'index.html'), 'utf8')
  const entry = /<script type="module"[^>]*\ssrc="\/([^"]+)"/.exec(html)?.[1]
  if (!entry) throw new Error('index.html has no module entry: build the web app first (make web)')
  const gz = (rel) => gzipSync(readFileSync(join(dist, rel)), { level: 9 }).length
  const seen = new Set([entry])
  const queue = [entry]
  while (queue.length) {
    const rel = queue.shift()
    for (const imp of staticImports(readFileSync(join(dist, rel), 'utf8'))) {
      const next = posix.normalize(posix.join(posix.dirname(rel), imp))
      if (!seen.has(next)) { seen.add(next); queue.push(next) }
    }
  }
  let initial = 0
  for (const rel of seen) initial += gz(rel)
  return { entry, entryGzip: gz(entry), initialGzip: initial, initialChunks: seen.size }
}

const kb = (n) => `${(n / 1024).toFixed(1)} KB`

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!existsSync(join(DIST, 'index.html'))) {
    console.error('bundle-budget: internal/web/dist/index.html is missing; run make web first')
    process.exit(1)
  }
  const m = measure()
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(m, null, 2))
    process.exit(0)
  }
  const budget = JSON.parse(readFileSync(join(ROOT, 'web/bundle-budget.json'), 'utf8'))
  const rows = [
    ['entry chunk', m.entryGzip, budget.entryGzipKB],
    [`entry and its ${m.initialChunks - 1} static imports`, m.initialGzip, budget.initialGzipKB],
  ]
  let over = false
  for (const [name, size, limitKB] of rows) {
    const ok = size <= limitKB * 1024
    over ||= !ok
    console.log(`${ok ? 'ok  ' : 'OVER'} ${name}: ${kb(size)} gzip, budget ${limitKB} KB`)
  }
  if (over) {
    console.error('bundle-budget: the first load grew past its budget (web/bundle-budget.json). Load the new code lazily,')
    console.error('or raise the budget on purpose and say why in the pull request (see the comment in scripts/bundle-budget.mjs).')
    process.exit(1)
  }
}
