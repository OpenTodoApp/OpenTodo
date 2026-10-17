// The untranslated-string pass of `make ui-lint` (OpenSpec change app-localization,
// design D8): user-facing text in web/src/app and web/src/ui must go through the
// message layer (t(), t.rich(), <T>, or msg() for text defined at module level).
//
// Reported, as file:line:
//   - JSX text with a word of three or more letters,
//   - a string literal (or a template literal with words) given to a prop that
//     people read or hear: aria-label, title, placeholder, label, description, alt
//     and the other props in PROPS, including the label/description of
//     SettingRow and SettingsSection; a value that reads as a phrase counts even
//     without a two-letter word ("e.g. 45m, 1h30"),
//   - a string literal with words rendered as a JSX child ({'Save'}, {ok ? 'Yes' : 'No'}),
//   - a template literal with words given to a key of an object literal that views
//     show as is (SHOWN_KEYS: a group's `note: \`${n} done\``). Plain string literals
//     under those keys are not reported: most are identifiers ('label', 'cyan'),
//     not text, and module-level text already goes through msg().
// scripts/i18n/allow.txt lists permanent exceptions by file and literal.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { calleeName, isSource, parse, rel, repo, ts, walk } from './source.mjs'

export const PROPS = new Set([
  'aria-label', 'aria-description', 'aria-roledescription', 'aria-valuetext', 'aria-placeholder', 'title', 'placeholder', 'label', 'description', 'alt',
  'ariaLabel', 'confirmLabel', 'cancelLabel', 'submitLabel', 'noneLabel', 'emptyLabel', 'editorLabel', 'actionLabel', 'consequence', 'meta',
  'body', 'what', 'emptyText', 'hint', 'empty', 'notice', 'heading', 'subtitle', 'caption', 'tooltip', 'summary', 'legend', 'topic',
])

const WORD = /\p{L}{3,}/u
const TEXT_PROPS_WORD = /\p{L}{2,}/u
/** A prop value that reads as a phrase even without a two-letter word ("e.g. 45m, 1h30"). */
const PHRASE = /\p{L}.*\s|\s.*\p{L}/u
const isText = (s) => TEXT_PROPS_WORD.test(s) || PHRASE.test(s.trim())
/** Object keys whose string value a view shows as is (a group's `note`, a row's `label`). */
export const SHOWN_KEYS = new Set(['note', 'heading', 'label', 'title', 'description', 'placeholder', 'hint', 'empty', 'caption', 'subtitle'])

/** Allow-list entries: "path: literal" (path relative to the repository, or `*` for any file). */
export function loadAllow(file = join(repo, 'scripts/i18n/allow.txt')) {
  const out = new Set()
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const l = line.trim()
    if (!l || l.startsWith('#')) continue
    const i = l.indexOf(': ')
    if (i < 0) continue
    out.add(`${l.slice(0, i)}\u0000${l.slice(i + 2)}`)
  }
  return out
}

const allowed = (allow, file, text) => allow.has(`${file}\u0000${text}`) || allow.has(`*\u0000${text}`)

/** Problems in one file's text: "path:line: text". */
export function untranslatedProblems(path, text, allow = new Set()) {
  const sf = parse(path.endsWith('.tsx') ? path : `${path}.tsx`, text)
  const out = []
  const report = (node, shown) => {
    const t = shown.trim().replace(/\s+/g, ' ')
    if (allowed(allow, path, t)) return
    const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf))
    out.push(`${path}:${line + 1}: ${t.slice(0, 100)}`)
  }
  const inMessageCall = (n) => {
    for (let p = n.parent; p; p = p.parent) {
      if (ts.isCallExpression(p) && ['t', 't.rich', 'msg'].includes(calleeName(p))) return true
      if (ts.isJsxElement(p) && p.openingElement.tagName.getText(sf) === 'T') return true
      if (ts.isFunctionLike(p)) return false
    }
    return false
  }
  // String literals in the positions where an expression's value is shown.
  const shownLiterals = (e, acc = []) => {
    if (!e) return acc
    if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) acc.push([e, e.text])
    else if (ts.isTemplateExpression(e)) acc.push([e, [e.head.text, ...e.templateSpans.map((s) => s.literal.text)].join(' ')])
    else if (ts.isParenthesizedExpression(e)) shownLiterals(e.expression, acc)
    else if (ts.isConditionalExpression(e)) { shownLiterals(e.whenTrue, acc); shownLiterals(e.whenFalse, acc) }
    else if (ts.isBinaryExpression(e) && [ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken].includes(e.operatorToken.kind)) { shownLiterals(e.left, acc); shownLiterals(e.right, acc) }
    else if (ts.isBinaryExpression(e) && e.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) shownLiterals(e.right, acc)
    return acc
  }
  const visit = (n) => {
    if (ts.isJsxText(n) && WORD.test(n.text) && !inMessageCall(n)) {
      const parent = n.parent
      const inT = ts.isJsxElement(parent) && parent.openingElement.tagName.getText(sf) === 'T'
      if (!inT) report(n, n.text)
    }
    if (ts.isJsxAttribute(n) && n.initializer && PROPS.has(n.name.getText(sf))) {
      const init = n.initializer
      if (ts.isStringLiteral(init)) { if (isText(init.text)) report(init, init.text) }
      else if (ts.isJsxExpression(init)) {
        for (const [node, s] of shownLiterals(init.expression)) if (isText(s) && !inMessageCall(node)) report(node, s)
      }
    }
    // A template literal with words given to a shown key of an object literal
    // (\`note: \`${n} done\`\`): text assembled outside JSX that a view renders.
    if (ts.isPropertyAssignment(n) && ts.isIdentifier(n.name) && SHOWN_KEYS.has(n.name.text) && ts.isTemplateExpression(n.initializer) && !inMessageCall(n.initializer)) {
      const s = [n.initializer.head.text, ...n.initializer.templateSpans.map((x) => x.literal.text)].join(' ')
      if (WORD.test(s)) report(n.initializer, s)
    }
    if (ts.isJsxExpression(n) && n.expression && (ts.isJsxElement(n.parent) || ts.isJsxFragment(n.parent))) {
      for (const [node, s] of shownLiterals(n.expression)) if (WORD.test(s) && !inMessageCall(node)) report(node, s)
    }
    ts.forEachChild(n, visit)
  }
  visit(sf)
  return out
}

/** Every problem in web/src/app and web/src/ui. */
export function untranslated(allow = loadAllow()) {
  const files = [...walk(join(repo, 'web/src/app')), ...walk(join(repo, 'web/src/ui'))].filter((f) => f.endsWith('.tsx') && isSource(f))
  return files.flatMap((f) => untranslatedProblems(rel(f), readFileSync(f, 'utf8'), allow))
}
