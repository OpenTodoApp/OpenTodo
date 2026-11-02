// Theme files (OpenSpec change theme-editor, design D11): export any theme as
// `<slug>.opentodo-theme.json` in the current format, made on the device; import
// such a file of at most 64 KB, read, migrated and validated on the device, as a
// draft with a new id and a free name. An invalid file says what is wrong and
// where ("Line 12: canvas is not a colour"); nothing is uploaded or written.
import { t } from '../i18n'
import { MAX_THEME_BYTES, THEME_FORMAT, validateTheme, type ThemeDocument, type ThemeError } from './format'
import { newThemeId, uniqueName } from './custom'
import { stripJsonc } from './jsonc'

/** The largest theme file the importer reads (design D11). */
export const MAX_THEME_FILE_BYTES = 64 * 1024
export const THEME_FILE_SUFFIX = '.opentodo-theme.json'

/** `nord-custom.opentodo-theme.json` */
export function themeFileName(name: string): string {
  const slug = name.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)
  return `${slug || 'theme'}${THEME_FILE_SUFFIX}`
}

/** The file's text: the document in the current format, two-space indented. */
export function themeFileText(doc: ThemeDocument): string {
  return JSON.stringify({ ...doc, opentodoTheme: THEME_FORMAT }, null, 2) + '\n'
}

/** Offers the theme as a download from a Blob URL (no server round trip). */
export function downloadTheme(doc: ThemeDocument): void {
  const url = URL.createObjectURL(new Blob([themeFileText(doc)], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url
  a.download = themeFileName(doc.name)
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

export type ThemeFileResult = { ok: true; doc: ThemeDocument } | { ok: false; message: string; line?: number }

/** The 1-based line of a character offset. */
export function lineAt(text: string, offset: number): number {
  return text.slice(0, Math.max(0, offset)).split('\n').length
}

/** The line where a dotted path's last key is written (`seeds.canvas` → the line of `"canvas":` inside `"seeds"`). */
export function lineOfPath(text: string, path: string): number | undefined {
  if (!path) return undefined
  let from = 0
  let line: number | undefined
  for (const key of path.split('.')) {
    const re = new RegExp(`"${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"\\s*:`, 'g')
    re.lastIndex = from
    const m = re.exec(text)
    if (!m) return line
    from = m.index + m[0].length
    line = lineAt(text, m.index)
  }
  return line
}

/** What a refusal code means for the key at `path`, in words. */
export function describeThemeError(code: ThemeError | 'size-file', path: string): string {
  const key = path.split('.').pop() || path
  switch (code) {
    case 'json': return t('The file is not valid JSON.')
    case 'size': return t('The theme is larger than 16 KB.')
    case 'size-file': return t('The file is larger than 64 KB.')
    case 'version': return t('The file is not an OpenTodo theme.')
    case 'newer': return t('The theme was made with a newer version of OpenTodo.')
    case 'colour': case 'bar': return t('{key} is not a colour.', { key })
    case 'alpha': return t('{key} cannot be transparent.', { key })
    case 'gamut': return t('{key} is outside the colours a screen can show.', { key })
    case 'seeds': return path === 'seeds' ? t('The theme has no seeds.') : t('{key} is missing or not a seed.', { key })
    case 'name': return t('The theme needs a name of at most 60 characters.')
    case 'kind': return t('kind must be light or dark.')
    default: return t('{key} is not valid.', { key })
  }
}

/**
 * Reads a theme file (design D11): the size, JSON (comments and trailing commas
 * allowed, as in a template), the format and its rules, then the migration. A
 * valid one is returned as it is (the caller makes the draft).
 */
export function readThemeFile(file: string, bytes = new TextEncoder().encode(file).length): ThemeFileResult {
  if (bytes > MAX_THEME_FILE_BYTES) return { ok: false, message: describeThemeError('size-file', '') }
  // A template's notes (`//` comments) and trailing commas are allowed; blanking them keeps every offset and line.
  const text = stripJsonc(file.replace(/^\uFEFF/, ''))
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch (e) {
    const msg = String((e as Error).message)
    const pos = /position (\d+)/.exec(msg)
    const ln = /line (\d+)/.exec(msg)
    const line = pos ? lineAt(text, Number(pos[1])) : ln ? Number(ln[1]) : undefined
    return { ok: false, message: describeThemeError('json', ''), ...(line ? { line } : {}) }
  }
  if (new TextEncoder().encode(JSON.stringify(value)).length > MAX_THEME_BYTES) return { ok: false, message: describeThemeError('size', '') }
  const r = validateTheme(value)
  if (!r.ok) {
    const line = lineOfPath(text, r.path)
    return { ok: false, message: describeThemeError(r.error, r.path), ...(line ? { line } : {}) }
  }
  return { ok: true, doc: r.doc }
}

/** One line for a refused file: "Line 12: canvas is not a colour." */
export function fileErrorText(r: Extract<ThemeFileResult, { ok: false }>): string {
  return r.line ? t('Line {line}: {message}', { line: r.line, message: r.message }) : r.message
}

/** An imported document as a draft: a new id, and its name made free among the user's themes (design D11). */
export function importedDraft(doc: ThemeDocument, takenNames: readonly string[], id = newThemeId()): ThemeDocument {
  return { ...withoutFileKeys(doc), id, name: uniqueName(doc.name, takenNames) }
}

/** A document as a theme keeps it: without the file's `$schema` and an empty `tokens` a template may leave. */
export function withoutFileKeys(doc: ThemeDocument): ThemeDocument {
  const { $schema: _s, tokens, ...rest } = doc
  void _s
  return tokens && Object.keys(tokens).length ? { ...rest, tokens } : rest
}
