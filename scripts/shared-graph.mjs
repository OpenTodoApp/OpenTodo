// The import graph of web modules from a set of entries (OpenSpec change
// native-app-foundation, D2): every local module an entry reaches through its static
// and dynamic imports, read with the TypeScript compiler web/ already has
// (ts.preProcessFile, no type check). Type-only imports count too: they cost nothing
// at run time, but a shared module should not name a DOM-only one. The app's
// generator (task 4.1) reuses sharedGraph; run directly, it prints the graph of the
// sync path and the browser globals each module still names:
//
//   node scripts/shared-graph.mjs [entry.ts ...]   (after npm ci in web/)
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { browserGlobals } from './shared-boundary.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const SYNC_PATH = ['web/src/lib/sync.ts', 'web/src/lib/ops.ts']

// Web's TypeScript, or the app's (mobile/app's app-check job installs only the app).
const requirers = ['web/package.json', 'mobile/app/package.json'].map((p) => createRequire(path.join(root, p)))
const requireTS = () => {
  for (const r of requirers) {
    try {
      return r(r.resolve('typescript'))
    } catch { /* the next one */ }
  }
  throw new Error('shared-graph: needs TypeScript (npm ci in web/ or mobile/app)')
}

/** Whether web's or the app's TypeScript is installed. */
export function hasTypeScript() {
  return requirers.some((r) => {
    try {
      r.resolve('typescript')
      return true
    } catch {
      return false
    }
  })
}

const EXTENSIONS = ['.ts', '.tsx', '/index.ts', '/index.tsx']

function resolve(fromFile, spec) {
  if (!spec.startsWith('.')) return null // a package
  const base = path.resolve(path.dirname(fromFile), spec)
  if (/\.(json|css|svg|png|woff2?)$/.test(base) || base.includes('?')) return null
  for (const ext of ['', ...EXTENSIONS]) {
    const f = base + ext
    if (existsSync(f) && /\.tsx?$/.test(f)) return f
  }
  return null
}

/** The repo-relative paths of every local module the entries reach, sorted. */
export function sharedGraph(entries = SYNC_PATH, repo = root) {
  const ts = requireTS()
  const seen = new Set()
  const queue = entries.map((e) => path.join(repo, e))
  while (queue.length) {
    const file = queue.pop()
    if (seen.has(file)) continue
    seen.add(file)
    const info = ts.preProcessFile(readFileSync(file, 'utf8'), true, true)
    for (const { fileName } of info.importedFiles) {
      const next = resolve(file, fileName)
      if (next && !seen.has(next)) queue.push(next)
    }
  }
  return [...seen].map((f) => path.relative(repo, f).split(path.sep).join('/')).sort()
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const entries = process.argv.length > 2 ? process.argv.slice(2) : SYNC_PATH
  for (const rel of sharedGraph(entries)) {
    const found = browserGlobals(readFileSync(path.join(root, rel), 'utf8'))
    console.log(found.length ? `${rel}  ${found.map((g) => `${g.global}:${g.line}`).join(' ')}` : rel)
  }
}
