// The settings copy lint (OpenSpec change settings-copy, design D2; settings-navigation
// "Settings copy lint"). Three parts:
//   (a) the table: a title or label has at most 4 words (a hyphenated word counts once),
//       a card, row or notice description at most 90 characters, an option at most 60,
//       measured on the English source with placeholders counted as written;
//   (b) the sources: a `description=` of <SettingsSection> or <SettingRow> under
//       src/app and in the settings stories is never a literal or a t('…') of its own;
//       it spreads cardCopy()/rowCopy() or reads SETTINGS_COPY;
//   (c) the catalogs: each shipped translation of a table message is at most 120
//       characters (a third longer than the English line).
// It does not replace `make i18n-check`, which keeps completeness, staleness,
// placeholders and plural categories: a missing Italian entry fails the catalog check
// only, a 140-character German entry fails this lint only.
import { describe, expect, it } from 'vitest'
import { copyEntries, SETTINGS_COPY } from './settingsCopy'

export const MAX_LABEL_WORDS = 4
export const MAX_LINE = 90
export const MAX_OPTION = 60
export const MAX_TRANSLATION = 120

type Entry = ReturnType<typeof copyEntries>[number]

/** Problems of table entries: "where: 112 of 90". */
export function tableProblems(entries: Entry[]): string[] {
  const out: string[] = []
  for (const e of entries) {
    if (e.kind === 'title' || e.kind === 'label') {
      const words = e.text.trim().split(/\s+/).length
      if (words > MAX_LABEL_WORDS) out.push(`${e.where}: "${e.text}" has ${words} of ${MAX_LABEL_WORDS} words`)
      continue
    }
    const limit = e.kind === 'option' ? MAX_OPTION : MAX_LINE
    if (e.text.length > limit) out.push(`${e.where}: ${e.text.length} of ${limit} characters`)
  }
  return out
}

/** The end of a balanced {…} expression starting at `open`, skipping strings. */
function closing(src: string, open: number): number {
  let depth = 0
  for (let i = open; i < src.length; i++) {
    const c = src[i]
    if (c === '"' || c === "'" || c === '`') {
      for (i++; i < src.length && src[i] !== c; i++) if (src[i] === '\\') i++
      continue
    }
    if (c === '{') depth++
    else if (c === '}' && --depth === 0) return i
  }
  return src.length
}

/** Problems in one source: a settings card or row whose description is its own literal. */
export function sourceProblems(path: string, src: string): string[] {
  const out: string[] = []
  const lineOf = (i: number) => src.slice(0, i).split('\n').length
  for (const m of src.matchAll(/<(SettingsSection|SettingRow)\b/g)) {
    // Walk the opening tag: attributes until the tag's own `>` at brace depth 0.
    let i = m.index + m[0].length
    while (i < src.length && src[i] !== '>') {
      if (src[i] === '{') { i = closing(src, i) + 1; continue }
      const attr = /^\s+description=/.exec(src.slice(i, i + 20))
      if (attr) {
        const at = i + attr[0].length
        if (src[at] === '"' || src[at] === "'") {
          out.push(`${path}:${lineOf(at)}: <${m[1]}> has a literal description; use cardCopy/rowCopy or SETTINGS_COPY`)
          i = at + 1
          continue
        }
        const end = closing(src, at)
        const expr = src.slice(at + 1, end)
        if (/^\s*["'`]/.test(expr) || /\bt(?:\.rich)?\(\s*["'`]/.test(expr)) {
          out.push(`${path}:${lineOf(at)}: <${m[1]}> has a literal description; use cardCopy/rowCopy or SETTINGS_COPY`)
        }
        i = end + 1
        continue
      }
      if (src[i] === '/' && src[i + 1] === '>') break
      i++
    }
  }
  return out
}

/** Problems of the shipped catalogs: "code: where: 140 of 120". */
export function catalogProblems(entries: Entry[], catalogs: Record<string, Record<string, string>>): string[] {
  const out: string[] = []
  for (const [code, catalog] of Object.entries(catalogs)) {
    for (const e of entries) {
      if (e.kind === 'title' || e.kind === 'label') continue
      const text = catalog[e.text]
      if (text !== undefined && text.length > MAX_TRANSLATION) out.push(`${code}: ${e.where}: ${text.length} of ${MAX_TRANSLATION} characters`)
    }
  }
  return out
}

const sources = import.meta.glob<string>(['../app/**/*.tsx', '!../app/**/*.test.tsx', '../ui/patterns/Settings.stories.tsx'], { query: '?raw', import: 'default', eager: true })
const catalogs = import.meta.glob<Record<string, string>>(['../locales/*.json', '!../locales/messages.json'], { import: 'default', eager: true })
const shipped = Object.fromEntries(Object.entries(catalogs).map(([p, c]) => [p.replace(/^.*\/(\w+)\.json$/, '$1'), c]))

describe('settings copy table', () => {
  it('holds the cards of every settings page', () => {
    expect(Object.keys(SETTINGS_COPY).length).toBeGreaterThan(40)
  })

  it('keeps labels to 4 words and lines to 90 characters (options 60)', () => {
    expect(tableProblems(copyEntries())).toEqual([])
  })

  it('names the entry and its length when a line is too long', () => {
    const long = 'x'.repeat(112)
    expect(tableProblems([{ where: 'webhooks', kind: 'description', text: long }])).toEqual(['webhooks: 112 of 90 characters'])
    expect(tableProblems([{ where: 'how-you-work.options.lists', kind: 'option', text: 'y'.repeat(61) }])).toEqual(['how-you-work.options.lists: 61 of 60 characters'])
    expect(tableProblems([{ where: 'session.device', kind: 'label', text: 'Sign out of this device' }])).toEqual(['session.device: "Sign out of this device" has 5 of 4 words'])
    expect(tableProblems([{ where: 'x', kind: 'label', text: 'End-to-end encryption on' }])).toEqual([])
  })
})

describe('settings copy in the sources', () => {
  it('reads every settings description from the table', () => {
    const problems = Object.entries(sources).flatMap(([path, src]) => sourceProblems(path, src))
    expect(problems).toEqual([])
  })

  it('finds the panels and the story it checks', () => {
    expect(Object.keys(sources).some((p) => p.endsWith('ui/patterns/Settings.stories.tsx'))).toBe(true)
    expect(Object.values(sources).filter((s) => /\b(cardCopy|rowCopy)\(/.test(s)).length).toBeGreaterThan(25)
  })

  it('names the file and line of a literal description', () => {
    const src = "import x\n\nexport const A = () => (\n  <SettingsSection {...cardCopy('webhooks')}>\n    <SettingRow label={l} control={<B onClick={() => go()} />}\n      description={t('A long literal.')} />\n  </SettingsSection>\n)\n"
    expect(sourceProblems('app/Planted.tsx', src)).toEqual(['app/Planted.tsx:6: <SettingRow> has a literal description; use cardCopy/rowCopy or SETTINGS_COPY'])
    expect(sourceProblems('app/Planted.tsx', '<SettingsSection title="x" description="A literal sentence.">')).toHaveLength(1)
    expect(sourceProblems('app/Fine.tsx', "<SettingRow {...rowCopy('webhooks', 'add')} description={t.rich(SETTINGS_COPY.capture.rows.extension.description, { path })} />")).toEqual([])
    expect(sourceProblems('app/Fine.tsx', '<SettingRow label={label} description={valid ? description : undefined} />')).toEqual([])
  })
})

describe('settings copy in the catalogs', () => {
  it('checks every shipped catalog', () => {
    expect(Object.keys(shipped).sort()).toEqual(['de', 'es', 'fr', 'it', 'pt'])
  })

  it('keeps each translation of a line within 120 characters', () => {
    expect(catalogProblems(copyEntries(), shipped)).toEqual([])
  })

  it('names the language, the entry and its length when a translation is too long', () => {
    const text = SETTINGS_COPY.webhooks.description
    expect(catalogProblems([{ where: 'webhooks', kind: 'description', text }], { de: { [text]: 'ü'.repeat(140) } })).toEqual(['de: webhooks: 140 of 120 characters'])
  })
})
