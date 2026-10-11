// OpenTodo docs: search, copy buttons and the "/" shortcut. Pages work without
// it; this only adds to them. Search runs in the browser over search.json and
// never sends what you type anywhere (analytics may count that search was used).
(() => {
  'use strict'

  // Docs search (OpenSpec change `user-documentation`, design D4): a small scorer
// over the prebuilt section index. No service, nothing leaves the browser. The
// build copies this file, minus the `export` keywords, into website/docs/search.js;
// the in-app Help view can import it as a module.

/** Lowercase, accents stripped, everything but letters and digits as spaces. */
function normalize(s) {
  return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
}

/** A light English stemmer, so "recurring" finds "recurrence" and "boards" finds "board". */
function stem(w) {
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
function prepare(index) {
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
function search(entries, query, limit = 10) {
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
function snippet(text, terms, size = 160) {
  const plain = String(text)
  const norm = plain.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  let at = -1
  for (const t of terms) {
    const re = new RegExp(`(^|[^\\p{L}\\p{N}])${t.replace(/[.*+?^${}()|[\]\\]/g, '\\/* @search-core */')}`, 'u')
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
    out = out.replace(new RegExp(`(^|[^\\p{L}\\p{N}])(${t.replace(/[.*+?^${}()|[\]\\]/g, '\\/* @search-core */')}[\\p{L}\\p{N}]*)`, 'giu'), '$1<mark>$2</mark>')
  }
  return out
}

  const track = (name, data) => {
    try { if (window.umami && typeof window.umami.track === 'function') window.umami.track(name, data) } catch { /* analytics must never break the page */ }
  }

  /* ------------------------------------------------------------ search */
  let entries = null
  let loading = null
  const load = () => {
    if (entries) return Promise.resolve(entries)
    if (!loading) {
      loading = fetch('/docs/search.json')
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        .then((index) => (entries = prepare(index)))
        .catch((err) => { loading = null; throw err })
    }
    return loading
  }

  let reported = false
  let reportTimer = 0
  const report = (count) => {
    if (reported) return
    clearTimeout(reportTimer)
    // Once per page, after typing pauses. Only a bucket of the result count; never the words.
    reportTimer = setTimeout(() => { reported = true; track('docs-search', { results: count === 0 ? '0' : count < 4 ? '1-3' : '4+' }) }, 1500)
  }

  function setup(form) {
    const input = form.querySelector('input[type="search"]')
    const box = form.querySelector('.search-results')
    const status = form.querySelector('[data-search-status]')
    let timer = 0

    const close = () => { box.hidden = true }
    const links = () => [...box.querySelectorAll('a')]

    const render = (query) => {
      const q = query.trim()
      if (!q) { box.innerHTML = ''; close(); status.textContent = ''; return }
      load().then((list) => {
        if (input.value.trim() !== q) return
        const results = search(list, q, 8)
        box.innerHTML = results.length
          ? '<ul>' + results.map((r, i) => `<li><a href="${r.url}" data-rank="${i + 1}"><span class="r-title">${escapeHtml(r.page)}${r.heading ? ` <span aria-hidden="true">›</span> ${escapeHtml(r.heading)}` : ''}</span><span class="r-snip">${r.snippet}</span></a></li>`).join('') + '</ul>'
          : '<p class="r-empty">No matches. Try a shorter or different word.</p>'
        box.hidden = false
        status.textContent = results.length ? `${results.length} result${results.length === 1 ? '' : 's'}. Press the down arrow to reach them.` : 'No results.'
        report(results.length)
      }).catch(() => {
        box.innerHTML = '<p class="r-empty">Search could not load. Use the menu to browse the docs.</p>'
        box.hidden = false
      })
    }

    input.addEventListener('focus', () => { load().catch(() => {}); if (input.value.trim() && box.innerHTML) box.hidden = false })
    input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => render(input.value), 80) })
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' && !box.hidden) { const a = links()[0]; if (a) { e.preventDefault(); a.focus() } }
      if (e.key === 'Escape') { if (!box.hidden) { e.preventDefault(); close() } else if (input.value) { input.value = ''; render('') } }
    })
    box.addEventListener('keydown', (e) => {
      const list = links()
      const i = list.indexOf(document.activeElement)
      if (e.key === 'ArrowDown' && i < list.length - 1) { e.preventDefault(); list[i + 1].focus() }
      if (e.key === 'ArrowUp') { e.preventDefault(); (i > 0 ? list[i - 1] : input).focus() }
      if (e.key === 'Escape') { e.preventDefault(); close(); input.focus() }
    })
    box.addEventListener('click', (e) => {
      const a = e.target instanceof Element ? e.target.closest('a[data-rank]') : null
      if (a) track('docs-search-open', { rank: Number(a.dataset.rank) })
    })
    form.addEventListener('submit', (e) => {
      // Never put the query in a URL: open the first result instead.
      e.preventDefault()
      const a = links()[0]
      if (a) { track('docs-search-open', { rank: 1 }); location.href = a.href }
    })
    document.addEventListener('click', (e) => { if (!form.contains(e.target)) close() })
  }

  const escapeHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

  /* ------------------------------------------------------ copy buttons */
  function addCopyButtons() {
    if (!navigator.clipboard) return
    for (const pre of document.querySelectorAll('.prose pre')) {
      const wrap = document.createElement('div')
      wrap.className = 'code-wrap'
      pre.replaceWith(wrap)
      wrap.append(pre)
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'copy'
      btn.dataset.codeCopy = ''
      btn.textContent = 'Copy'
      btn.setAttribute('aria-label', 'Copy code to the clipboard')
      btn.addEventListener('click', () => {
        navigator.clipboard.writeText(pre.innerText.replace(/\n$/, '')).then(() => {
          btn.textContent = 'Copied'
          btn.classList.add('ok')
          setTimeout(() => { btn.textContent = 'Copy'; btn.classList.remove('ok') }, 1600)
        }, () => { btn.textContent = 'Press Ctrl+C' })
        track('docs-copy', { page: location.pathname.slice(0, 80) })
      })
      wrap.append(btn)
    }
  }

  /* ------------------------------------------------------------- init */
  function init() {
    document.querySelectorAll('form[data-search]').forEach(setup)
    addCopyButtons()
    document.addEventListener('keydown', (e) => {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return
      const t = e.target
      if (t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return
      const visible = [...document.querySelectorAll('form[data-search] input')].find((i) => i.offsetParent !== null)
      if (visible) { e.preventDefault(); visible.focus() }
    })
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init)
  else init()
})()
