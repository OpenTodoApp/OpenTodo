// Docs search (OpenSpec change `user-documentation`, design D4): a small scorer
// over the prebuilt section index. No service, nothing leaves the browser. The
// build copies this file, minus the `export` keywords, into website/docs/search.js;
// the in-app Help view can import it as a module.

/** Lowercase, accents stripped, everything but letters and digits as spaces. */
export function normalize(s) {
  return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
}

/** A light English stemmer, so "recurring" finds "recurrence" and "boards" finds "board". */
export function stem(w) {
  if (w.length < 5) return w
  for (const suf of ['ences', 'ence', 'ances', 'ance', 'ings', 'ing', 'ions', 'ion', 'ed', 'es', 's']) {
    if (w.endsWith(suf) && w.length - suf.length >= 4) return w.slice(0, -suf.length)
  }
  return w
}

const words = (s) => normalize(s).split(' ').filter(Boolean)

/**
 * Prepares the index from search.json: { pages: [{ t, u }], s: [[page, heading, anchor, text]] }.
 * Returns entries with their word stems for scoring.
 */
export function prepare(index) {
  return index.s.map(([page, heading, anchor, text]) => {
    const p = index.pages[page]
    const title = words(p.t).map(stem)
    const head = words(heading).map(stem)
    const body = words(text).map(stem)
    return { page: p.t, url: p.u + (anchor ? '#' + anchor : ''), heading, text, title, head, body }
  })
}

function hits(list, term) {
  let exact = 0
  let prefix = 0
  for (const w of list) {
    if (w === term) exact++
    else if (w.startsWith(term)) prefix++
  }
  return { exact, prefix }
}

/**
 * Scores every entry against the query. Every query word must match somewhere
 * (title, heading or text, whole word or prefix). Returns the best `limit`
 * results as { page, heading, url, snippet } with <mark> around matches.
 */
export function search(entries, query, limit = 10) {
  const terms = [...new Set(words(query).map(stem))]
  if (!terms.length) return []
  const scored = []
  for (const e of entries) {
    let score = 0
    let ok = true
    for (const t of terms) {
      const a = hits(e.title, t)
      const b = hits(e.head, t)
      const c = hits(e.body, t)
      const s = a.exact * 10 + a.prefix * 6 + b.exact * 8 + b.prefix * 5 + Math.min(c.exact, 5) * 2 + Math.min(c.prefix, 5)
      if (!s) { ok = false; break }
      score += s
    }
    if (!ok) continue
    if (!e.heading) score += 1 // the page itself, for a title match
    scored.push({ e, score })
  }
  scored.sort((x, y) => y.score - x.score || x.e.url.localeCompare(y.e.url))
  return scored.slice(0, limit).map(({ e }) => ({ page: e.page, heading: e.heading, url: e.url, snippet: snippet(e.text, terms) }))
}

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** About 160 characters of text around the first match, HTML-escaped, matches in <mark>. */
export function snippet(text, terms, size = 160) {
  const plain = String(text)
  const norm = plain.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  let at = -1
  for (const t of terms) {
    const re = new RegExp(`(^|[^\\p{L}\\p{N}])${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'u')
    const m = re.exec(norm)
    if (m && (at < 0 || m.index < at)) at = m.index + m[1].length
  }
  let start = Math.max(0, (at < 0 ? 0 : at) - 50)
  if (start > 0) start = plain.indexOf(' ', start) + 1 || start
  let cut = plain.slice(start, start + size)
  if (start + size < plain.length) cut = cut.replace(/\s+\S*$/, '') + ' …'
  if (start > 0) cut = '… ' + cut
  let out = esc(cut)
  for (const t of terms) {
    out = out.replace(new RegExp(`(^|[^\\p{L}\\p{N}])(${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\p{L}\\p{N}]*)`, 'giu'), '$1<mark>$2</mark>')
  }
  return out
}
