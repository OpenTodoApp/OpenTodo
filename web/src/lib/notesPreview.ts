// The notes preview of a board card (OpenSpec change board-polish, design D6): the
// Markdown projection of a task's notes (`description`, docs/sync.md "Mergeable
// documents") as one plain-text string. Headings, emphasis, strike, code and quote
// marks are removed, links keep their text, images (attachment embeds), tables and
// rules are left out, every line or list item is joined with " · ", whitespace is
// collapsed and at most 280 characters are kept. Ciphertext reads as no preview.

/** The most characters a preview keeps; two lines of a card never show more. */
export const PREVIEW_MAX = 280

const CIPHERTEXT = /^enc:v[0-9]+:/
const FENCE = /^ {0,3}(```|~~~)/
const RULE = /^ {0,3}([-*_])( *\1){2,} *$/
const TABLE_ROW = /^ {0,3}\|.*\|\s*$/
const IMAGE = /!\[(?:\\.|[^\]\\])*\]\([^)]*\)/g
const LINK = /\[((?:\\.|[^\]\\])*)\]\((?:[^()\s]|\([^)]*\))*(?:\s+"[^"]*")?\)/g
const AUTOLINK = /<((?:https?|mailto):[^>\s]+)>/g
const isWord = (c: string | undefined) => !!c && /[\p{L}\p{N}]/u.test(c)

/** Inline Markdown to text: escapes resolved, emphasis, strike and code marks dropped. */
function inline(s: string): string {
  const src = s.replace(IMAGE, ' ').replace(LINK, '$1').replace(AUTOLINK, '$1')
  let out = ''
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (c === '\\' && i + 1 < src.length && /[!-/:-@[-`{-~]/.test(src[i + 1])) { out += src[++i]; continue }
    if (c === '`') {
      // A code span: its text as written, without the backticks.
      let n = 1
      while (src[i + n] === '`') n++
      const fence = '`'.repeat(n)
      const end = src.indexOf(fence, i + n)
      if (end < 0) { i += n - 1; continue }
      out += src.slice(i + n, end).trim()
      i = end + n - 1
      continue
    }
    if (c === '*') continue
    if (c === '~' && (src[i + 1] === '~' || src[i - 1] === '~')) continue
    // An underscore inside a word is text (snake_case); at a word's edge it is emphasis.
    if (c === '_' && !(isWord(src[i - 1]) && isWord(src[i + 1]))) continue
    out += c
  }
  return out
}

/** One block line without its block marks: quote markers, heading hashes, list bullets and check boxes. */
function blockText(line: string): string {
  return line
    .replace(/^\s*(?:>\s?)+/, '')
    .replace(/^\s*#{1,6}(?:\s+|$)/, '')
    .replace(/^\s*(?:[-*+]|\d{1,9}[.)])\s+(?:\[[ xX]\](?:\s+|$))?/, '')
}

/** The plain-text preview of a task's notes; empty when there is nothing to show. */
export function notesPreview(description: string | null | undefined): string {
  if (!description || CIPHERTEXT.test(description)) return ''
  const parts: string[] = []
  let fenced = false
  for (const raw of description.split('\n')) {
    if (FENCE.test(raw)) { fenced = !fenced; continue }
    if (!fenced && (RULE.test(raw) || TABLE_ROW.test(raw))) continue
    const text = (fenced ? raw : inline(blockText(raw))).replace(/\s+/g, ' ').trim()
    if (text) parts.push(text)
  }
  const all = parts.join(' · ')
  if (all.length <= PREVIEW_MAX) return all
  // Cut on a character boundary, never inside a surrogate pair.
  return Array.from(all).slice(0, PREVIEW_MAX).join('').trimEnd()
}

const memo = new Map<string, { description: string; text: string }>()
const MEMO_MAX = 4000

/**
 * The preview of one task, memoised per task id and `description` value, so a board
 * of several hundred cards re-renders without parsing again (design D6).
 */
export function cardNotesPreview(id: string, description: string | null | undefined): string {
  const d = description ?? ''
  const hit = memo.get(id)
  if (hit && hit.description === d) return hit.text
  const text = notesPreview(d)
  if (memo.size >= MEMO_MAX) memo.clear()
  memo.set(id, { description: d, text })
  return text
}
