// The iOS shell's own strings (OpenSpec change ios-shell, design D1): the shell is
// hand-written Swift, so its screens are not in web/src/locales/. Its catalog is a
// String Catalog, and the languages are still the shipped ones — a language the web
// app offers must not be half-translated in the app around it.
//
//   - every key has a translation in every shipped language, marked translated,
//   - a translation carries the same format specifiers as the English source
//     (`%@`, `%lld`, `%1$@`, …), because a dropped one silently loses its value,
//   - no localizations for a language that is not shipped.
//
// The Siri phrases (apple-shortcuts D4) are a second catalog, read with the same rules. A
// String Catalog of App Shortcut phrases needs iOS 17, so they are one AppShortcuts.strings per
// language folder (`<lang>.lproj`), read here into the catalog's shape; `en.lproj` is the source.
// Every phrase keeps the source's `${applicationName}`, which iOS requires in each one.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { repo } from './source.mjs'

export const shellCatalogPath = (root = repo) => join(root, 'mobile/ios/Shared/Localizable.xcstrings')

export function readShellCatalog(root = repo) {
  return JSON.parse(readFileSync(shellCatalogPath(root), 'utf8'))
}

const appShortcutsDir = (root = repo) => join(root, 'mobile/ios/OpenTodo')
const appShortcutsFile = 'AppShortcuts.strings'

/** The source language's phrases, whose presence turns the check on. */
export const appShortcutsCatalogPath = (root = repo) => join(appShortcutsDir(root), 'en.lproj', appShortcutsFile)

/**
 * The `"key" = "value";` pairs of a .strings file, comments skipped. Throws on anything else,
 * so a broken file fails the check instead of reading as fewer phrases.
 */
export function parseStrings(text) {
  const out = {}
  const str = String.raw`"((?:[^"\\]|\\.)*)"`
  const re = new RegExp(String.raw`\s*(?:/\*[\s\S]*?\*/|//[^\n]*|${str}\s*=\s*${str}\s*;)`, 'y')
  const unescape = (v) => v.replace(/\\(.)/g, (_, c) => ({ n: '\n', t: '\t' })[c] ?? c)
  let at = 0
  while (at < text.length) {
    if (!text.slice(at).trim()) break
    re.lastIndex = at
    const m = re.exec(text)
    if (!m) throw new Error(`cannot read the .strings text at "${text.slice(at, at + 40).trim()}"`)
    if (m[1] !== undefined) out[unescape(m[1])] = unescape(m[2])
    at = re.lastIndex
  }
  return out
}

/** Every `<lang>.lproj/AppShortcuts.strings` as a catalog: { sourceLanguage, strings: { key: { localizations } } }. */
export function readAppShortcutsCatalog(root = repo) {
  const dir = appShortcutsDir(root)
  const strings = {}
  for (const key of Object.keys(parseStrings(readFileSync(appShortcutsCatalogPath(root), 'utf8')))) strings[key] = { localizations: {} }
  for (const folder of readdirSync(dir).sort()) {
    const lang = folder.replace(/\.lproj$/, '')
    const file = join(dir, folder, appShortcutsFile)
    if (lang === folder || lang === 'en' || !existsSync(file)) continue
    for (const [key, value] of Object.entries(parseStrings(readFileSync(file, 'utf8')))) {
      strings[key] ??= { localizations: {} }
      strings[key].localizations[lang] = { stringUnit: { state: 'translated', value } }
    }
  }
  return { sourceLanguage: 'en', strings }
}

/** `${applicationName}` and the other App Shortcut placeholders a phrase must keep. */
export function placeholders(value) {
  return [...String(value).matchAll(/\$\{[A-Za-z]+\}/g)].map((m) => m[0]).sort()
}

/** `%`, `%%`, `%@`, `%lld`, `%.1f`, `%1$@` — the printf specifiers a translated value must keep. */
export function specifiers(value) {
  return [...String(value).matchAll(/%(?:\d+\$)?[-+ 0#]*[\d.]*(?:@|lld|ld|d|u|f|s|%)/g)]
    .map((m) => m[0])
    .filter((s) => s !== '%%')
    .sort()
}

/**
 * Problems of the shell catalog against the languages the web app ships.
 * `langs` are the codes to require (the maintained ones without the source language);
 * `optional` are community languages, which may be translated in part.
 */
export function checkShellCatalog(catalog, langs, optional = [], { label = 'shell', appName = false } = {}) {
  const problems = []
  const source = catalog.sourceLanguage ?? 'en'
  const strings = catalog.strings ?? {}
  if (Object.keys(strings).length === 0) problems.push(`${label}: the catalog has no strings`)
  for (const [key, entry] of Object.entries(strings)) {
    if (appName && !key.includes('${applicationName}')) problems.push(`${label}: "${key}" does not name the app with \${applicationName}`)
    const localizations = entry.localizations ?? {}
    for (const lang of langs) {
      const l = localizations[lang]
      const unit = l?.stringUnit ?? l?.stringSet
      const values = l?.stringUnit ? [l.stringUnit.value] : (l?.stringSet?.values ?? [])
      if (!unit) problems.push(`${label} ${lang}: missing "${key}"`)
      else if (unit.state !== 'translated') problems.push(`${label} ${lang}: "${key}" is ${unit.state ?? 'unmarked'}, not translated`)
      else if (values.length === 0 || values.some((v) => !String(v ?? '').trim())) problems.push(`${label} ${lang}: "${key}" is empty`)
      else {
        const want = specifiers(key)
        const wantP = placeholders(key)
        for (const value of values) {
          const got = specifiers(value)
          if (want.join() !== got.join()) problems.push(`${label} ${lang}: "${key}" uses ${got.join(' ') || 'no specifier'}, the source uses ${want.join(' ') || 'none'}`)
          const gotP = placeholders(value)
          if (wantP.join() !== gotP.join()) problems.push(`${label} ${lang}: "${value}" uses ${gotP.join(' ') || 'no placeholder'}, the source uses ${wantP.join(' ') || 'none'}`)
        }
      }
    }
    for (const lang of Object.keys(localizations)) {
      if (lang !== source && !langs.includes(lang) && !optional.includes(lang)) problems.push(`${label} ${lang}: "${key}" is translated into a language the web app does not ship`)
    }
  }
  return problems
}
