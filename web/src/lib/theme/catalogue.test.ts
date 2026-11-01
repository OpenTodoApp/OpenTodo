// The built-in catalogue (OpenSpec change theme-catalogue, design D3, D4, D6, D7):
// every palette of catalogue/palettes.ts has its document in builtin/ and its entry
// in builtin/index.ts and the other way round; each document validates, keeps every
// published colour or records it under notes.adapted with only its lightness changed;
// the index matches the documents; every theme is credited in builtin/CREDITS.md;
// light and dark pairs name each other; and the 12 label colours of every theme stay
// at least ΔE 8 (CIE76) apart. The contrast gate itself is contrast.test.ts.
// UPDATE_CATALOGUE=1 regenerates the documents and the index (node scripts/themes-sync.mjs).
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { labToRgb, lchToLab, toHex } from '../colourMath'
import { deriveTheme, parseColour, type ResolvedTheme } from './derive'
import { validateTheme, type ThemeDocument } from './format'
import { HUES } from './tokens'
import { generateTheme } from './catalogue/generate'
import { PALETTES, type Palette } from './catalogue/palettes'
import { CATALOGUE, type CatalogueTheme } from './builtin/index'

const update = process.env.UPDATE_CATALOGUE === '1'
const dir = join(__dirname, 'builtin')
const read = (id: string): ThemeDocument => JSON.parse(readFileSync(join(dir, `${id}.json`), 'utf8'))
const docs = Object.values(import.meta.glob<ThemeDocument>('./builtin/*.json', { eager: true, import: 'default' })).filter((d) => !d.id.startsWith('opentodo-'))
const credits = readFileSync(join(dir, 'CREDITS.md'), 'utf8')

const hex = (v: string) => { const c = parseColour(v); return toHex(labToRgb(lchToLab(c.L, c.C, c.H))) }

/** The index entry of a palette, from its document as derived. */
function entryOf(p: Palette, doc: ThemeDocument, t: ResolvedTheme): CatalogueTheme {
  return {
    id: p.id, kind: p.kind, name: p.name, family: p.family, ...(p.counterpart ? { counterpart: p.counterpart } : {}),
    author: p.project.author, licence: 'MIT', copyright: p.project.copyright, source: p.project.source,
    ...(doc.notes?.adapted ? { adapted: true as const } : {}),
    swatches: {
      canvas: hex(t.tokens.canvas), surface: hex(t.tokens.surface), text: hex(t.tokens.text), accent: hex(t.tokens.accent),
      hues: ['green', 'blue', 'violet', 'orange'].map((h) => hex(t.tokens[`hue-${h}-solid`])),
    },
  }
}

function indexSource(entries: CatalogueTheme[]): string {
  return `// The built-in catalogue (OpenSpec change theme-catalogue, design D6): the palettes'
// ids, names, kinds, families, credits and preview swatches, without their documents,
// which load one by one through lib/theme/load.ts. Lazy: Settings › Appearance loads
// it; the first load never does. Generated from catalogue/palettes.ts and the
// documents by catalogue.test.ts (UPDATE_CATALOGUE=1); do not edit by hand.
import type { BuiltinTheme } from '../choice'
export { default as creditsUrl } from './CREDITS.md?url'

export interface CatalogueTheme extends BuiltinTheme {
  name: string
  /** The family a light and dark pair shares, and the other side's theme. */
  family: string
  counterpart?: string
  author: string
  licence: string
  /** The copyright line of the project's licence, verbatim. */
  copyright: string
  /** The project's address, shown as text. */
  source: string
  /** Some published colours were adapted for contrast (the document's notes.adapted). */
  adapted?: true
  swatches: { canvas: string; surface: string; text: string; accent: string; hues: readonly string[] }
}

export const CATALOGUE: readonly CatalogueTheme[] = ${JSON.stringify(entries, null, 2)}
`
}

/** Pairs of label colours of a resolved theme closer than ΔE 8 (CIE76), named by theme and hues. */
export function labelClashes(t: ResolvedTheme, min = 8): string[] {
  const lab = (v: string) => {
    const c = parseColour(v)
    const { r, g, b } = labToRgb(lchToLab(c.L, c.C, c.H))
    const lin = (x: number) => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4)
    const [R, G, B] = [lin(r), lin(g), lin(b)]
    const f = (x: number) => (x > 216 / 24389 ? Math.cbrt(x) : ((24389 / 27) * x + 16) / 116)
    const [x, y, z] = [(0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047, 0.2126 * R + 0.7152 * G + 0.0722 * B, (0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883].map(f)
    return [116 * y - 16, 500 * (x - y), 200 * (y - z)]
  }
  const out: string[] = []
  for (let i = 0; i < HUES.length; i++) {
    for (let j = i + 1; j < HUES.length; j++) {
      const a = lab(t.tokens[`hue-${HUES[i]}-solid`])
      const b = lab(t.tokens[`hue-${HUES[j]}-solid`])
      const d = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
      if (d < min) out.push(`${t.id}: label colours ${HUES[i]} and ${HUES[j]} are ΔE ${d.toFixed(1)} apart, need ${min}`)
    }
  }
  return out
}

/** The ids of documents that have no entry in the credits. */
export function uncredited(ids: readonly string[], text: string): string[] {
  return ids.filter((id) => !text.includes(`\`${id}\``))
}

/** Hue distance in degrees, around the circle. */
const hueGap = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180)

/** Every published value of a palette by the document key it is written under (`seeds.<n>` or a token). */
function publishedValues(p: Palette): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(p.seeds)) if (!(k === 'accent' && p.kind === 'dark')) out[`seeds.${k}`] = v
  if (p.kind === 'dark') out['accent-text'] = p.seeds.accent
  for (const [k, v] of Object.entries(p.tokens)) out[k] = v!
  for (const [h, v] of Object.entries(p.hues)) out[`hue-${h}`] = v!
  return out
}

describe('the built-in catalogue', () => {
  if (update) {
    it('regenerates the documents and the index', () => {
      // CATALOGUE_ONLY=<id>,<id> regenerates only those documents; the index is always rewritten.
      const only = process.env.CATALOGUE_ONLY?.split(',')
      const entries = PALETTES.map((p) => {
        if (only && !only.includes(p.id)) return entryOf(p, read(p.id), deriveTheme(read(p.id)))
        const { doc } = generateTheme(p)
        writeFileSync(join(dir, `${p.id}.json`), JSON.stringify(doc, null, 2) + '\n')
        return entryOf(p, doc, deriveTheme(doc))
      })
      writeFileSync(join(dir, 'index.ts'), indexSource(entries))
    }, 1_800_000)
    return
  }

  it('has a document and an index entry for every palette, and nothing else', () => {
    const ids = PALETTES.map((p) => p.id).sort()
    expect(docs.map((d) => d.id).sort()).toEqual(ids)
    expect(CATALOGUE.map((c) => c.id).sort()).toEqual(ids)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('lists Nord and Dracula on the dark side only, and every other family on both', () => {
    const light = CATALOGUE.filter((c) => c.kind === 'light').map((c) => c.id)
    expect(light).not.toContain('nord')
    expect(light).not.toContain('dracula')
    expect(CATALOGUE.filter((c) => c.kind === 'light')).toHaveLength(6)
    expect(CATALOGUE.filter((c) => c.kind === 'dark')).toHaveLength(8)
  })

  it('pairs a light and a dark theme of one family, each naming the other', () => {
    for (const c of CATALOGUE) {
      if (!c.counterpart) {
        expect(CATALOGUE.filter((x) => x.family === c.family), c.id).toHaveLength(1)
        continue
      }
      const o = CATALOGUE.find((x) => x.id === c.counterpart)
      expect(o, `${c.id}: counterpart ${c.counterpart}`).toBeDefined()
      expect([o!.counterpart, o!.family, o!.kind]).toEqual([c.id, c.family, c.kind === 'light' ? 'dark' : 'light'])
    }
  })

  for (const p of PALETTES) {
    describe(p.id, () => {
      const doc = read(p.id)
      const t = deriveTheme(doc)

      it('validates, sets colours only and credits its project', () => {
        const r = validateTheme(doc)
        expect(r.ok, JSON.stringify(r)).toBe(true)
        expect(doc.shape).toBeUndefined()
        expect(doc.type).toBeUndefined()
        expect([doc.name, doc.kind, doc.author, doc.licence, doc.source]).toEqual([p.name, p.kind, p.project.author, 'MIT', p.project.source])
      })

      it('keeps every published colour, or records it and changes only its lightness', () => {
        const adapted = doc.notes?.adapted ?? {}
        const value = (k: string) => (k.startsWith('seeds.') ? doc.seeds[k.slice(6)] : doc.tokens?.[k])!
        for (const [k, v] of Object.entries(publishedValues(p))) {
          const name = k.replace(/^seeds\./, '')
          if (value(k) === v) {
            expect(adapted[name], `${p.id}: ${name} is published, yet listed as adapted`).toBeUndefined()
            continue
          }
          expect(adapted[name], `${p.id}: ${name} differs from the published ${v} without a note`).toBe(v)
          const [a, b] = [parseColour(value(k)), parseColour(v)]
          expect(hueGap(a.H, b.H), `${p.id}: ${name} turned from hue ${b.H} to ${a.H}`).toBeLessThanOrEqual(1)
          expect(a.L, `${p.id}: ${name}`).not.toBe(b.L)
        }
        for (const k of Object.keys(adapted)) expect(Object.keys(publishedValues(p)).map((x) => x.replace(/^seeds\./, '')), `${p.id}: ${k}`).toContain(k)
      })

      it('keeps its 12 label colours at least ΔE 8 apart', () => {
        expect(labelClashes(t)).toEqual([])
      })

      it('matches its index entry and its credits', () => {
        expect(CATALOGUE.find((c) => c.id === p.id)).toEqual(entryOf(p, doc, t))
        expect(credits).toContain(p.project.copyright)
        expect(uncredited([p.id], credits)).toEqual([])
      })
    })
  }

  it('names the theme when a document has no credits entry', () => {
    expect(uncredited(['nord', 'example-new'], credits)).toEqual(['example-new'])
  })

  it('names the theme and the two hues when two label colours are nearly the same', () => {
    const doc = read('nord')
    const broken = deriveTheme({ ...doc, tokens: { ...doc.tokens, 'hue-teal': doc.tokens!['hue-cyan'] } })
    expect(labelClashes(broken)).toContainEqual(expect.stringMatching(/^nord: label colours teal and cyan are ΔE 0\.0 apart, need 8$/))
  })

  it("keeps OpenTodo's own label colours distinguishable by the same measure", () => {
    for (const k of ['light', 'dark']) expect(labelClashes(deriveTheme(read(`opentodo-${k}`)))).toEqual([])
  })
})
