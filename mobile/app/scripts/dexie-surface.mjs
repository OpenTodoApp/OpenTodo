// The part of Dexie's API the shared modules call (OpenSpec change native-app-foundation
// D4): every property, method and named import of the `dexie` package that a module of
// shared-modules.json reaches, found with the type checker (the symbol each property
// access resolves to is declared in dexie's types), so `db.tasks.where('x').equals(y)`
// counts as Table.where and WhereClause.equals however it is written. The app's SQLite
// adapter (src/storage) implements exactly this list; its test fails on a member the
// adapter lacks. Prints the list; `--check` fails when src/storage/surface.json differs
// from it; `--write` rewrites the file.
//
//   node mobile/app/scripts/dexie-surface.mjs [--check | --write]
import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const repo = path.resolve(app, '../..')
const OUT = path.join(app, 'src/storage/surface.json')
const ts = createRequire(path.join(app, 'package.json'))('typescript')

const inDexie = (decl) => /[\\/]node_modules[\\/]dexie[\\/]/.test(decl.getSourceFile().fileName)

/** `Table.where`, `WhereClause.equals`, `Dexie.waitFor`: the declaring type and the member. */
function memberName(decl) {
  let p = decl.parent
  while (p && !ts.isInterfaceDeclaration(p) && !ts.isClassDeclaration(p) && !ts.isTypeLiteralNode(p) && !ts.isModuleDeclaration(p)) p = p.parent
  let owner = p?.name?.text
  if (p && ts.isTypeLiteralNode(p)) {
    // `on: DbEvents & …` and the like: the alias or property that holds the literal.
    let q = p.parent
    while (q && !q.name) q = q.parent
    owner = q?.name?.text
  }
  return `${owner ?? '?'}.${decl.name?.getText?.() ?? '?'}`
}

export function dexieSurface() {
  const { config } = ts.readConfigFile(path.join(app, 'tsconfig.typecheck.json'), ts.sys.readFile)
  const parsed = ts.parseJsonConfigFileContent(config, ts.sys, app)
  const modules = JSON.parse(readFileSync(path.join(app, 'shared-modules.json'), 'utf8')).modules.map((m) => path.join(repo, m))
  const program = ts.createProgram(modules, parsed.options)
  const checker = program.getTypeChecker()
  const used = new Map() // member -> Set of modules
  const add = (name, file) => {
    if (!used.has(name)) used.set(name, new Set())
    used.get(name).add(path.relative(repo, file))
  }
  for (const file of modules) {
    const sf = program.getSourceFile(file)
    if (!sf) throw new Error(`dexie-surface: ${file} is not in the program`)
    const visit = (node) => {
      if (ts.isImportDeclaration(node) && node.moduleSpecifier.text === 'dexie' && !node.importClause?.isTypeOnly) {
        for (const el of node.importClause?.namedBindings?.elements ?? []) if (!el.isTypeOnly) add(`import.${(el.propertyName ?? el.name).text}`, file)
      }
      const name = ts.isPropertyAccessExpression(node) ? node.name
        : ts.isElementAccessExpression(node) && ts.isStringLiteralLike(node.argumentExpression) ? node.argumentExpression
          : null
      if (name) {
        // A union (Table | Collection) resolves to each declaration.
        const sym = checker.getSymbolAtLocation(name)
        const decls = sym?.declarations ?? []
        for (const d of decls) if (inDexie(d)) add(memberName(d), file)
        if (!sym) {
          const t = checker.getTypeAtLocation(node.expression)
          for (const part of t.isUnion() ? t.types : [t]) {
            const p = part.getProperty(name.text)
            for (const d of p?.declarations ?? []) if (inDexie(d)) add(memberName(d), file)
          }
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(sf)
  }
  return Object.fromEntries([...used.keys()].sort().map((k) => [k, [...used.get(k)].sort()]))
}

function main(args) {
  const surface = dexieSurface()
  const members = Object.keys(surface)
  if (args.includes('--write')) {
    writeFileSync(OUT, JSON.stringify({
      $comment: 'The Dexie API the shared modules call (native-app-foundation D4), with the modules that call each member. Generated: node mobile/app/scripts/dexie-surface.mjs --write; make app fails when it is stale, and test/storage.surface.test.ts fails on a member the SQLite adapter lacks.',
      members: surface,
    }, null, 2) + '\n')
    console.log(`dexie-surface: wrote ${members.length} members to mobile/app/src/storage/surface.json`)
    return 0
  }
  if (args.includes('--check')) {
    let current = {}
    try { current = JSON.parse(readFileSync(OUT, 'utf8')).members } catch { /* missing */ }
    if (JSON.stringify(current) !== JSON.stringify(surface)) {
      const was = new Set(Object.keys(current))
      const now = new Set(members)
      for (const m of members) if (!was.has(m)) console.error(`dexie-surface: new member ${m} (${surface[m].join(', ')})`)
      for (const m of was) if (!now.has(m)) console.error(`dexie-surface: ${m} is no longer used`)
      console.error('dexie-surface: src/storage/surface.json is stale; run node mobile/app/scripts/dexie-surface.mjs --write')
      return 1
    }
    console.log(`dexie-surface: ${members.length} members, up to date`)
    return 0
  }
  for (const m of members) console.log(`${m}  (${surface[m].length})`)
  return 0
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2))
