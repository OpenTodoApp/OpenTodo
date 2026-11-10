// The shared modules the app reaches (OpenSpec change native-app-foundation D2): walks
// the import graph from the app's code (index.ts and src/, not the tests) into
// web/src with the TypeScript compiler, following only imports that run (an
// `import type` is erased), @shared/* and relative paths, and the files an
// import.meta.glob names. Prints the list; `--check` compares it with
// mobile/app/shared-modules.json and fails on a difference; `--write` rewrites the
// file's list. A browser-only package (react-dom, dexie-react-hooks, prosemirror-*,
// maplibre-gl) in the graph always fails.
//
//   node mobile/app/scripts/shared-modules.mjs [--check [--advisory] | --write]
//
// TODO(native-app-foundation 4.1): `make app` runs `--check --advisory` (reports, does
// not fail) while the remaining sync-path modules move behind the platform port in
// their own pull request; make it a hard check when that lands.
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const repo = path.resolve(app, '../..')
const webSrc = path.join(repo, 'web/src') + path.sep
const LIST = path.join(app, 'shared-modules.json')
const BROWSER_ONLY = /^(react-dom|dexie-react-hooks|maplibre-gl|prosemirror-[\w-]+)(\/|$)/

const require = createRequire(import.meta.url)
function loadTypeScript() {
  for (const dir of [app, path.join(repo, 'web')]) {
    try { return createRequire(path.join(dir, 'package.json'))('typescript') } catch { /* next */ }
  }
  throw new Error('shared-modules: needs TypeScript (npm ci in mobile/app or web)')
}
const ts = loadTypeScript()
const { globFiles } = require('../babel/vite-import-meta.js')

const EXTS = ['.ts', '.tsx', '/index.ts', '/index.tsx']
function resolveFile(base) {
  if (/\.(json|ts|tsx)$/.test(base) && existsSync(base)) return base
  for (const e of EXTS) if (existsSync(base + e)) return base + e
  return null
}

/** The imports of one file that run: [{ spec, glob? }]. */
function runtimeImports(file) {
  const text = readFileSync(file, 'utf8')
  if (file.endsWith('.json')) return []
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, false, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const out = []
  const typeOnly = (clause) => {
    if (!clause) return false
    if (clause.isTypeOnly) return true
    if (clause.name) return false
    const b = clause.namedBindings
    return !!b && ts.isNamedImports(b) && b.elements.length > 0 && b.elements.every((e) => e.isTypeOnly)
  }
  const visit = (node) => {
    if (ts.isImportDeclaration(node) && !typeOnly(node.importClause)) out.push({ spec: node.moduleSpecifier.text })
    else if (ts.isExportDeclaration(node) && node.moduleSpecifier && !node.isTypeOnly) out.push({ spec: node.moduleSpecifier.text })
    else if (ts.isCallExpression(node)) {
      const [arg] = node.arguments
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword && arg && ts.isStringLiteral(arg)) out.push({ spec: arg.text })
      const callee = node.expression
      if (ts.isPropertyAccessExpression(callee) && callee.name.text === 'glob' && ts.isMetaProperty(callee.expression) && arg) {
        const pats = ts.isStringLiteral(arg) ? [arg.text] : ts.isArrayLiteralExpression(arg) ? arg.elements.filter(ts.isStringLiteral).map((e) => e.text) : []
        for (const f of globFiles(path.dirname(file), pats, file)) out.push({ spec: f })
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return out
}

function appEntries() {
  const files = [path.join(app, 'index.ts')]
  const walk = (dir) => {
    for (const n of readdirSync(dir)) {
      const p = path.join(dir, n)
      if (statSync(p).isDirectory()) walk(p)
      else if (/\.tsx?$/.test(n) && !/\.d\.ts$/.test(n)) files.push(p)
    }
  }
  walk(path.join(app, 'src'))
  walk(path.join(app, 'test'))
  return files
}

export function sharedGraph() {
  const seen = new Set()
  const shared = new Set()
  const problems = []
  const queue = appEntries()
  while (queue.length) {
    const file = queue.pop()
    if (seen.has(file)) continue
    seen.add(file)
    if (file.startsWith(webSrc)) shared.add(path.relative(repo, file).split(path.sep).join('/'))
    for (const { spec } of runtimeImports(file)) {
      let target = null
      if (spec.startsWith('@shared/')) target = resolveFile(path.join(webSrc, 'lib', spec.slice('@shared/'.length)))
      else if (spec.startsWith('.')) target = resolveFile(path.resolve(path.dirname(file), spec))
      else {
        if (BROWSER_ONLY.test(spec)) problems.push(`${path.relative(repo, file)} imports ${spec}, a browser-only package the app must not reach (design D2)`)
        continue
      }
      if (!target) {
        problems.push(`${path.relative(repo, file)}: cannot resolve ${spec}`)
        continue
      }
      // The app's own files are walked only through its entries; shared ones through imports.
      if (target.startsWith(webSrc) || target.startsWith(app + path.sep)) queue.push(target)
    }
  }
  return { modules: [...shared].sort(), problems }
}

function main(args) {
  const { modules, problems } = sharedGraph()
  for (const p of problems) console.error(`shared-modules: ${p}`)
  const current = JSON.parse(readFileSync(LIST, 'utf8'))
  if (args.includes('--write')) {
    writeFileSync(LIST, JSON.stringify({ ...current, modules }, null, 2) + '\n')
    console.log(`shared-modules: wrote ${modules.length} modules to mobile/app/shared-modules.json`)
    return problems.length ? 1 : 0
  }
  if (!args.includes('--check')) {
    console.log(modules.join('\n'))
    return problems.length ? 1 : 0
  }
  const listed = new Set(current.modules)
  const missing = modules.filter((m) => !listed.has(m))
  const extra = current.modules.filter((m) => !modules.includes(m))
  for (const m of missing) console.error(`shared-modules: the app reaches ${m}, which shared-modules.json does not list`)
  for (const m of extra) console.error(`shared-modules: shared-modules.json lists ${m}, which the app does not reach`)
  const stale = missing.length + extra.length > 0
  if (stale) console.error(`shared-modules: the list is stale (${missing.length} missing, ${extra.length} not reached); \`node mobile/app/scripts/shared-modules.mjs --write\` rewrites it`)
  else console.log(`shared-modules: the list matches the app's import graph (${modules.length} modules)`)
  if (stale && args.includes('--advisory')) {
    console.error('shared-modules: advisory until the sync-path modules move behind the platform port (native-app-foundation 4.1)')
    return problems.length ? 1 : 0
  }
  return stale || problems.length ? 1 : 0
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exit(main(process.argv.slice(2)))
