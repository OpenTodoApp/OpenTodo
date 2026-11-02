// The theme template (OpenSpec change themes-layout-template): a starter theme file
// made on the device from a theme, in the accepted format with notes. It carries
// `$schema` (editors check and complete the file), the format version, every key
// with a short note, the seeds, and every token of the closed list: a token the
// theme sets is written as a value, every other one as a commented line with the
// colour the seeds give it now, so removing the `//` sets it. Comments and trailing
// commas are allowed in a theme file (files.ts reads it as JSON with comments), so
// every entry ends with a comma and any line can be uncommented on its own. The
// notes come from the caller in the user's language (app/themes/templateText.ts);
// the keys and values stay as the format writes them.
import { colourToHex } from './oklch'
import { THEME_FORMAT, type ThemeDocument } from './format'
import { themeFileName } from './files'
import { ALPHA_TOKEN, cssName, DEFAULT_RADIUS, RADIUS_STEPS, TOKEN_GROUPS } from './tokens'

/** Where the published JSON Schema of the format is read from by an editor (never by the app). */
export const THEME_SCHEMA_URL = 'https://raw.githubusercontent.com/OpenTodoApp/OpenTodo/main/docs/themes/opentodo-theme.schema.json'
/** The format's documentation. */
export const THEME_DOCS_URL = 'https://github.com/OpenTodoApp/OpenTodo/blob/main/docs/themes.md#what-a-theme-is'
/** The template's file name: `nord-custom-template.opentodo-theme.jsonc`. */
export function templateFileName(name: string): string {
  return themeFileName(`${name} template`).replace(/\.json$/, '.jsonc')
}

/** The seeds the format names; they are written under `seeds`, never again under `tokens`. */
export const SEED_NAMES = ['canvas', 'surface', 'text', 'accent', 'success', 'warning', 'danger', 'info'] as const
const REQUIRED_SEEDS = new Set(['canvas', 'surface', 'text', 'accent'])

/** The notes of a template, in the user's language (one line each, without `//`). */
export interface TemplateText {
  /** The lines above the document: what the file is, how to use it, where the format is documented. */
  header: string[]
  /** A note for each top-level key. */
  key: Record<'opentodoTheme' | 'id' | 'name' | 'author' | 'licence' | 'source' | 'kind' | 'bar' | 'notes' | 'shape' | 'type', string>
  /** Above the four required seeds, and above the optional status seeds. */
  seeds: string
  statusSeeds: string
  /** What a seed is for ("The page behind the cards."). */
  seed: (name: string) => string
  /** Above the tokens. */
  tokens: string[]
  /** A group's name ("Surfaces"). */
  group: (group: keyof typeof TOKEN_GROUPS) => string
  /** A token's name ("Muted text"). */
  token: (name: string) => string
}

const q = (v: unknown) => JSON.stringify(v)

/** A value line: `"key": value, // note`, or commented out when `live` is false. */
function line(indent: string, key: string, value: unknown, note: string, live = true): string {
  const entry = `${q(key)}: ${q(value)},`
  return `${indent}${live ? '' : '// '}${entry}${note ? ` // ${note}` : ''}`
}

/** A colour as the template writes it: `#rrggbb` where that is exact enough, the scrim as it is (it may be translucent). */
function shown(token: string, v: string | undefined): string | undefined {
  if (!v) return undefined
  return token === ALPHA_TOKEN ? v : colourToHex(v) ?? v
}

/**
 * The template of a theme: `doc` as it is (every value it sets stays set), with
 * every other token as a commented line holding its colour in `resolution` (the
 * derived theme: stylesheet names and the bar). Reading the file back gives `doc` plus `$schema`.
 */
export function themeTemplate(doc: ThemeDocument, resolution: { tokens: Record<string, string>; bar?: string } | null, text: TemplateText): string {
  const resolved = resolution?.tokens
  const out: string[] = []
  for (const h of text.header) out.push(`// ${h}`)
  out.push('{')
  const I = '  '
  out.push(`${I}${q('$schema')}: ${q(THEME_SCHEMA_URL)},`)
  out.push(line(I, 'opentodoTheme', THEME_FORMAT, text.key.opentodoTheme))
  out.push(line(I, 'id', doc.id, text.key.id))
  out.push(line(I, 'name', doc.name, text.key.name))
  out.push(line(I, 'author', doc.author, text.key.author))
  out.push(line(I, 'licence', doc.licence, text.key.licence))
  out.push(line(I, 'source', doc.source ?? '', text.key.source, doc.source !== undefined))
  out.push(line(I, 'kind', doc.kind, text.key.kind))

  // Seeds: the four required, then the status hues (commented with their derived colour while unset).
  out.push(`${I}"seeds": {`)
  out.push(`${I}${I}// ${text.seeds}`)
  for (const s of SEED_NAMES) {
    if (s === 'success') out.push(`${I}${I}// ${text.statusSeeds}`)
    const set = doc.seeds[s]
    const value = set ?? shown(s, resolved?.[s])
    if (value === undefined) continue
    out.push(line(I + I, s, value, text.seed(s), set !== undefined || REQUIRED_SEEDS.has(s)))
  }
  // A seed of a newer app's format is kept as it is.
  for (const [s, v] of Object.entries(doc.seeds)) if (!(SEED_NAMES as readonly string[]).includes(s) && v) out.push(line(I + I, s, v, ''))
  out.push(`${I}},`)

  // Tokens: every one of the closed list but the seeds, by group.
  const own = doc.tokens ?? {}
  out.push(`${I}"tokens": {`)
  for (const l of text.tokens) out.push(`${I}${I}// ${l}`)
  for (const [group, tokens] of Object.entries(TOKEN_GROUPS) as [keyof typeof TOKEN_GROUPS, readonly string[]][]) {
    const rows = tokens.filter((tok) => !(SEED_NAMES as readonly string[]).includes(tok))
    if (!rows.length) continue
    out.push(`${I}${I}// — ${text.group(group)} —`)
    for (const tok of rows) {
      const set = own[tok]
      const value = set ?? shown(tok, resolved?.[cssName(tok)])
      if (value === undefined) continue
      out.push(line(I + I, tok, value, text.token(tok), set !== undefined))
    }
  }
  // A token of a newer app (kept and ignored when applying) stays in the file.
  const known = new Set(Object.values(TOKEN_GROUPS).flat() as string[])
  for (const [tok, v] of Object.entries(own)) if (!known.has(tok) && !(SEED_NAMES as readonly string[]).includes(tok)) out.push(line(I + I, tok, v, ''))
  for (const s of SEED_NAMES) if (own[s] !== undefined) out.push(line(I + I, s, own[s], text.token(s)))
  out.push(`${I}},`)

  // The other optional keys: as set, or commented with what applies now.
  out.push(line(I, 'bar', doc.bar ?? shown('bar', resolution?.bar) ?? '', text.key.bar, doc.bar !== undefined))
  if (doc.notes) out.push(line(I, 'notes', doc.notes, text.key.notes))
  const radius = doc.shape?.radius
  out.push(line(I, 'shape', { radius: radius ?? Object.fromEntries(RADIUS_STEPS.map((s) => [s, DEFAULT_RADIUS[s]])) }, text.key.shape, !!doc.shape))
  out.push(line(I, 'type', doc.type ?? { family: 'inter', list: 13 }, text.key.type, !!doc.type))
  // Keys of a newer app's format, kept as they are.
  const KNOWN = new Set(['$schema', 'opentodoTheme', 'id', 'name', 'author', 'licence', 'source', 'kind', 'seeds', 'tokens', 'bar', 'notes', 'shape', 'type'])
  for (const [k, v] of Object.entries(doc)) if (!KNOWN.has(k) && v !== undefined) out.push(line(I, k, v, ''))
  out.push('}')
  return out.join('\n') + '\n'
}

/** Offers the template as a download from a Blob URL (made on the device, no server round trip). */
export function downloadTemplate(text: string, name: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url
  a.download = templateFileName(name)
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
