// OpenTodo docs: search, copy buttons and the "/" shortcut. Pages work without
// it; this only adds to them. Search runs in the browser over search.json and
// never sends what you type anywhere (analytics may count that search was used).
(() => {
  'use strict'

  /* @search-core */

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
