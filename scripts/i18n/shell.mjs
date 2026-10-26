// The iOS shell's own strings (OpenSpec change ios-shell, design D1): the shell is
// hand-written Swift, so its screens are not in web/src/locales/. Its catalog is a
// String Catalog, and the languages are still the shipped ones — a language the web
// app offers must not be half-translated in the app around it.
//
//   - every key has a translation in every shipped language, marked translated,
//   - a translation carries the same format specifiers as the English source
//     (`%@`, `%lld`, `%1$@`, …), because a dropped one silently loses its value,
//   - no localizations for a language that is not shipped.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { repo } from './source.mjs'

export const shellCatalogPath = (root = repo) => join(root, 'mobile/ios/Shared/Localizable.xcstrings')

export function readShellCatalog(root = repo) {
  return JSON.parse(readFileSync(shellCatalogPath(root), 'utf8'))
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
 * `langs` are the codes to require (the shipped ones without the source language).
 */
export function checkShellCatalog(catalog, langs) {
  const problems = []
  const source = catalog.sourceLanguage ?? 'en'
  const strings = catalog.strings ?? {}
  if (Object.keys(strings).length === 0) problems.push('shell: the catalog has no strings')
  for (const [key, entry] of Object.entries(strings)) {
    const localizations = entry.localizations ?? {}
    for (const lang of langs) {
      const unit = localizations[lang]?.stringUnit
      if (!unit) problems.push(`shell ${lang}: missing "${key}"`)
      else if (unit.state !== 'translated') problems.push(`shell ${lang}: "${key}" is ${unit.state ?? 'unmarked'}, not translated`)
      else if (!String(unit.value ?? '').trim()) problems.push(`shell ${lang}: "${key}" is empty`)
      else {
        const want = specifiers(key)
        const got = specifiers(unit.value)
        if (want.join() !== got.join()) problems.push(`shell ${lang}: "${key}" uses ${got.join(' ') || 'no specifier'}, the source uses ${want.join(' ') || 'none'}`)
      }
    }
    for (const lang of Object.keys(localizations)) {
      if (lang !== source && !langs.includes(lang)) problems.push(`shell ${lang}: "${key}" is translated into a language the web app does not ship`)
    }
  }
  return problems
}
