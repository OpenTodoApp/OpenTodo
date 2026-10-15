// Collects every translatable message of the web app (OpenSpec `app-localization`,
// design D8) with the TypeScript compiler API:
//   t('…'), t('…', { context: 'verb' }), t.rich('…', …), msg('…'),
//   <T>…</T> with text or a string literal child, and the values of ERROR_MESSAGES.
//
//   node scripts/i18n/extract.mjs           print the number of messages
//   node scripts/i18n/extract.mjs --write   refresh web/src/locales/messages.json
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

export const repo = fileURLToPath(new URL('../..', import.meta.url))
const require = createRequire(join(repo, 'web', 'package.json'))
export const ts = require('typescript')

const walk = (dir) => readdirSync(dir).flatMap((n) => {
  const p = join(dir, n)
  return statSync(p).isDirectory() ? walk(p) : [p]
})

/** The source files that may hold messages: web/src, no tests or stories. */
export function sourceFiles(root = join(repo, 'web', 'src')) {
  return walk(root).filter((f) => /\.(ts|tsx)$/.test(f) && !/\.(test|stories)\.tsx?$/.test(f) && !f.includes('/generated/'))
}

const stringOf = (node) => (node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) ? node.text : null)

function contextOf(node) {
  if (!node || !ts.isObjectLiteralExpression(node)) return null
  for (const p of node.properties) {
    if (ts.isPropertyAssignment(p) && p.name.getText() === 'context') return stringOf(p.initializer)
  }
  return null
}

/** Messages of one file: [{ key, line }]. `key` is the message, with "|context" when one is given. */
export function extractFrom(file, text) {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const out = []
  const add = (node, message, context) => {
    if (message === null || message === undefined || message === '') return
    out.push({ key: context ? `${message}|${context}` : message, line: sf.getLineAndCharacterOfPosition(node.getStart()).line + 1 })
  }
  const visit = (node) => {
    if (ts.isCallExpression(node)) {
      const callee = node.expression
      const name = ts.isIdentifier(callee) ? callee.text : ts.isPropertyAccessExpression(callee) ? `${callee.expression.getText()}.${callee.name.text}` : ''
      if (name === 't' || name === 'msg') add(node, stringOf(node.arguments[0]), contextOf(node.arguments[1]))
      if (name === 't.rich') add(node, stringOf(node.arguments[0]), contextOf(node.arguments[2]))
    }
    if (ts.isJsxElement(node) && node.openingElement.tagName.getText() === 'T') {
      const parts = node.children.map((c) => (ts.isJsxText(c) ? c.text : ts.isJsxExpression(c) ? stringOf(c.expression) ?? '' : ''))
      add(node, parts.join('').replace(/\s+/g, ' ').trim(), null)
    }
    if (ts.isVariableDeclaration(node) && node.name.getText() === 'ERROR_MESSAGES' && node.initializer && ts.isObjectLiteralExpression(node.initializer)) {
      for (const p of node.initializer.properties) if (ts.isPropertyAssignment(p)) add(p, stringOf(p.initializer), null)
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return out
}

/** Every message of the tree: { key: ["web/src/…:line", …] }, keys sorted. */
export function extractAll(files = sourceFiles()) {
  const map = new Map()
  for (const f of files) {
    for (const { key, line } of extractFrom(f, readFileSync(f, 'utf8'))) {
      const ref = `${relative(repo, f)}:${line}`
      map.set(key, [...(map.get(key) ?? []), ref])
    }
  }
  return Object.fromEntries([...map.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
}

export const messagesPath = join(repo, 'web', 'src', 'locales', 'messages.json')

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const all = extractAll()
  if (process.argv.includes('--write')) {
    writeFileSync(messagesPath, JSON.stringify(all, null, 2) + '\n')
    console.log(`i18n: wrote ${Object.keys(all).length} messages to ${relative(repo, messagesPath)}`)
  } else {
    console.log(`i18n: ${Object.keys(all).length} messages`)
  }
}
