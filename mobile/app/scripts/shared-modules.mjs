// The shared modules the app reaches (OpenSpec change native-app-foundation D2): the
// import graph (scripts/shared-graph.mjs) of the sync path the app will run and of
// every @shared/* module the app's code, tests and performance run import. Prints the list; `--check`
// fails when mobile/app/shared-modules.json differs from it; `--write` rewrites the
// file's list. A shared module that names a browser-only package (react-dom,
// dexie-react-hooks, prosemirror-*, maplibre-gl) is reported. It does not fail yet:
// modules of the sync path's graph still import dexie-react-hooks, and which of them
// the app runs is settled with sync in the app (task 4.5).
//
//   node mobile/app/scripts/shared-modules.mjs [--check | --write]
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { sharedGraph, SYNC_PATH } from '../../../scripts/shared-graph.mjs'

const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const repo = path.resolve(app, '../..')
const LIST = path.join(app, 'shared-modules.json')
const IMPORT = /^\s*(?:import|export)\s[^'"]*?from\s+['"]([^'"]+)['"]|^\s*import\s+['"]([^'"]+)['"]/gm
// Value imports only: `import type` is erased and pulls no package into the bundle.
const VALUE_IMPORT = /^\s*import\s+(?!type\s)[^'"]*?from\s+['"]([^'"]+)['"]|^\s*import\s+['"]([^'"]+)['"]|^\s*export\s+(?!type\s)[^'"]*?from\s+['"]([^'"]+)['"]/gm
const BROWSER_ONLY = /^(react-dom|dexie-react-hooks|maplibre-gl|prosemirror-[\w-]+)(\/|$)/

function appFiles() {
  const files = [path.join(app, 'index.ts')]
  const walk = (dir) => {
    for (const n of readdirSync(dir)) {
      const p = path.join(dir, n)
      if (statSync(p).isDirectory()) walk(p)
      else if (/\.tsx?$/.test(n) && !n.endsWith('.d.ts')) files.push(p)
    }
  }
  walk(path.join(app, 'src'))
  walk(path.join(app, 'test'))
  walk(path.join(app, 'perf'))
  return files
}

/** web/src/lib/<x>.ts for every @shared/<x> the app's code and tests import. */
function appEntries() {
  const entries = new Set()
  for (const f of appFiles()) {
    for (const m of readFileSync(f, 'utf8').matchAll(IMPORT)) {
      const spec = m[1] ?? m[2]
      if (!spec.startsWith('@shared/')) continue
      const rel = `web/src/lib/${spec.slice('@shared/'.length)}`
      const hit = ['.ts', '.tsx', '/index.ts'].map((e) => rel + e).find(exists)
      if (!hit) throw new Error(`${path.relative(repo, f)}: cannot resolve ${spec}`)
      entries.add(hit)
    }
  }
  return [...entries]
}

function exists(rel) {
  try { return statSync(path.join(repo, rel)).isFile() } catch { return false }
}

export function appSharedModules() {
  const modules = sharedGraph([...new Set([...SYNC_PATH, ...appEntries()])])
  const problems = []
  for (const rel of modules) {
    for (const m of readFileSync(path.join(repo, rel), 'utf8').matchAll(VALUE_IMPORT)) {
      const spec = m[1] ?? m[2] ?? m[3]
      if (BROWSER_ONLY.test(spec)) problems.push(`${rel} imports ${spec}, a browser-only package the app must not reach (design D2)`)
    }
  }
  return { modules, problems }
}

function main(args) {
  const { modules, problems } = appSharedModules()
  for (const p of problems) console.error(`shared-modules: note: ${p}`)
  const current = JSON.parse(readFileSync(LIST, 'utf8'))
  if (args.includes('--write')) {
    writeFileSync(LIST, JSON.stringify({ ...current, modules }, null, 2) + '\n')
    console.log(`shared-modules: wrote ${modules.length} modules to mobile/app/shared-modules.json`)
    return 0
  }
  if (!args.includes('--check')) {
    console.log(modules.join('\n'))
    return 0
  }
  const listed = new Set(current.modules)
  const missing = modules.filter((m) => !listed.has(m))
  const extra = current.modules.filter((m) => !modules.includes(m))
  for (const m of missing) console.error(`shared-modules: the app reaches ${m}, which shared-modules.json does not list`)
  for (const m of extra) console.error(`shared-modules: shared-modules.json lists ${m}, which the app does not reach`)
  if (missing.length || extra.length) console.error('shared-modules: the list is stale; `node mobile/app/scripts/shared-modules.mjs --write` rewrites it')
  else console.log(`shared-modules: the list matches the app's import graph (${modules.length} modules)`)
  return missing.length || extra.length ? 1 : 0
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exit(main(process.argv.slice(2)))
