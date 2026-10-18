// Message extraction (OpenSpec change app-localization, design D8): every source
// message in the web app, with the files that use it.
//
//   node scripts/i18n/extract.mjs            print the count
//   node scripts/i18n/extract.mjs --write    refresh web/src/locales/messages.json
//
// A message is the first argument of t(), t.rich() or msg() (a literal, or each
// branch of a conditional), the text of <T>, plus two lists kept outside the
// message layer: the shortcut registry in web/src/lib/shortcuts.ts (the keyboard
// guide is generated from it, so it stays plain English and is translated where
// it is shown), the English texts of the service worker (web/public/push-sw.js)
// and the Open Loops vocabulary (web/src/lib/method/vocabulary.json, whose method
// name is a product name and stays untranslated).
// A context option makes the key `message|context`.
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { calleeName, contextOf, isSource, literalsOf, parse, rel, repo, ts, walk } from './source.mjs'

const MESSAGE_CALLS = new Set(['t', 't.rich', 'msg'])

/** Messages in one source text: [{ id, file, line }]. */
export function messagesIn(file, text) {
  const sf = parse(file, text)
  const out = []
  const add = (id, node) => out.push({ id, file, line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1 })
  const visit = (n) => {
    if (ts.isCallExpression(n) && MESSAGE_CALLS.has(calleeName(n))) {
      const ctx = calleeName(n) === 'msg' ? null : contextOf(n)
      for (const m of literalsOf(n.arguments[0])) add(ctx ? `${m}|${ctx}` : m, n)
    }
    if (ts.isJsxElement(n) && n.openingElement.tagName.getText(sf) === 'T') {
      for (const c of n.children) {
        if (ts.isJsxText(c) && c.text.trim()) add(c.text.trim().replace(/\s+/g, ' '), c)
        if (ts.isJsxExpression(c)) for (const m of literalsOf(c.expression)) add(m, c)
      }
    }
    ts.forEachChild(n, visit)
  }
  visit(sf)
  return out
}

/** The shortcut registry's English texts: descriptions, section titles, states and the quick-add rows. */
export function shortcutMessages(file, text) {
  const sf = parse(file, text)
  const out = []
  const visit = (n) => {
    if (ts.isPropertyAssignment(n) && ['description', 'title', 'when'].includes(n.name.getText(sf)) && ts.isStringLiteral(n.initializer)) {
      out.push({ id: n.initializer.text, file, line: sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1 })
    }
    if (ts.isVariableDeclaration(n) && n.name.getText(sf) === 'QUICK_ADD_SYNTAX' && n.initializer && ts.isArrayLiteralExpression(n.initializer)) {
      for (const row of n.initializer.elements) {
        if (ts.isArrayLiteralExpression(row) && row.elements[1] && ts.isStringLiteral(row.elements[1])) {
          out.push({ id: row.elements[1].text, file, line: sf.getLineAndCharacterOfPosition(row.getStart(sf)).line + 1 })
        }
      }
    }
    ts.forEachChild(n, visit)
  }
  visit(sf)
  return out
}

/** The service worker's English texts: the `en` entry of its TEXT table. */
export function workerMessages(file, text) {
  const sf = parse(file, text)
  const out = []
  const visit = (n) => {
    if (ts.isVariableDeclaration(n) && n.name.getText(sf) === 'TEXT' && n.initializer && ts.isObjectLiteralExpression(n.initializer)) {
      const en = n.initializer.properties.find((p) => ts.isPropertyAssignment(p) && p.name.getText(sf) === 'en')
      if (en && ts.isObjectLiteralExpression(en.initializer)) {
        for (const p of en.initializer.properties) {
          if (ts.isPropertyAssignment(p) && ts.isStringLiteral(p.initializer)) out.push({ id: p.initializer.text, file, line: sf.getLineAndCharacterOfPosition(p.getStart(sf)).line + 1 })
        }
      }
    }
    ts.forEachChild(n, visit)
  }
  visit(sf)
  return out
}

/** The Open Loops vocabulary's English texts: the tagline and every term's name (with the context `method`, so "Next" the Place is not "Next" the button) and description. */
export function methodMessages(file, text) {
  const v = JSON.parse(text)
  const out = [{ id: v.tagline, file, line: 1 }]
  for (const group of ['moves', 'principles', 'places', 'rhythms', 'horizons']) {
    for (const term of v[group] ?? []) out.push({ id: `${term.name}|method`, file, line: 1 }, { id: term.description, file, line: 1 })
  }
  return out
}

/** Every message of the web app, sorted, each with the files that use it. */
export function extract(root = repo) {
  const found = []
  for (const f of walk(join(root, 'web/src')).filter(isSource)) {
    const text = readFileSync(f, 'utf8')
    if (f.endsWith('web/src/lib/shortcuts.ts')) found.push(...shortcutMessages(f, text))
    found.push(...messagesIn(f, text))
  }
  const sw = join(root, 'web/public/push-sw.js')
  found.push(...workerMessages(sw, readFileSync(sw, 'utf8')))
  const vocabulary = join(root, 'web/src/lib/method/vocabulary.json')
  found.push(...methodMessages(vocabulary, readFileSync(vocabulary, 'utf8')))
  const map = new Map()
  for (const m of found) {
    const files = map.get(m.id) ?? new Set()
    files.add(rel(m.file))
    map.set(m.id, files)
  }
  return new Map([...map.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([id, files]) => [id, [...files].sort()]))
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const messages = extract()
  if (process.argv.includes('--write')) {
    const out = Object.fromEntries(messages)
    writeFileSync(join(repo, 'web/src/locales/messages.json'), `${JSON.stringify(out, null, 2)}\n`)
    console.log(`extract: wrote ${messages.size} messages to web/src/locales/messages.json`)
  } else {
    console.log(`extract: ${messages.size} messages`)
  }
}
