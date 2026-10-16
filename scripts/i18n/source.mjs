// Shared parsing for the translation checks (OpenSpec change app-localization,
// design D8): the TypeScript compiler API (already a devDependency of web/) reads
// the sources, so attribute strings that span lines and JSX text are seen as the
// compiler sees them.
import { createRequire } from 'node:module'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

export const repo = fileURLToPath(new URL('../..', import.meta.url))
export const ts = createRequire(join(repo, 'web/package.json'))('typescript')

export const walk = (dir) => readdirSync(dir).flatMap((n) => {
  const p = join(dir, n)
  return statSync(p).isDirectory() ? walk(p) : [p]
})

/** Source files whose text is shown to people: no tests, stories, test kits or fixtures. */
export const isSource = (f) => /\.(ts|tsx)$/.test(f) && !/\.(test|stories|testkit|d)\.tsx?$/.test(f) && !/\/(stories|__screenshots__)\//.test(f) && !/test-utils|test-setup/.test(f)

export function parse(file, text = readFileSync(file, 'utf8')) {
  return ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
}

export const rel = (f) => relative(repo, f)

/** The callee name of a call: `t`, `msg`, `t.rich`, … */
export function calleeName(call) {
  const c = call.expression
  if (ts.isIdentifier(c)) return c.text
  if (ts.isPropertyAccessExpression(c) && ts.isIdentifier(c.expression)) return `${c.expression.text}.${c.name.text}`
  return ''
}

/** String values a message argument can take: a literal, or each branch of a conditional. */
export function literalsOf(node) {
  if (!node) return []
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return [node.text]
  if (ts.isParenthesizedExpression(node)) return literalsOf(node.expression)
  if (ts.isConditionalExpression(node)) return [...literalsOf(node.whenTrue), ...literalsOf(node.whenFalse)]
  return []
}

/** The `context` option of `t(msg, { context: 'verb' })`, if any. */
export function contextOf(call) {
  const opts = call.arguments[1]
  if (!opts || !ts.isObjectLiteralExpression(opts)) return null
  for (const p of opts.properties) {
    if (ts.isPropertyAssignment(p) && p.name.getText() === 'context' && ts.isStringLiteral(p.initializer)) return p.initializer.text
  }
  return null
}
