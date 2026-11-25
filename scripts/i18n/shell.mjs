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
// The Siri phrases (apple-shortcuts D4) are a second catalog, AppShortcuts.xcstrings, read
// with the same rules. A language may give several phrases (a `stringSet`); every phrase keeps
// the source's `${applicationName}`, which iOS requires in each one.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { repo } from './source.mjs'

export const shellCatalogPath = (root = repo) => join(root, 'mobile/ios/Shared/Localizable.xcstrings')

export function readShellCatalog(root = repo) {
  return JSON.parse(readFileSync(shellCatalogPath(root), 'utf8'))
}

export const appShortcutsCatalogPath = (root = repo) => join(root, 'mobile/ios/OpenTodo/AppShortcuts.xcstrings')

export function readAppShortcutsCatalog(root = repo) {
  return JSON.parse(readFileSync(appShortcutsCatalogPath(root), 'utf8'))
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
