// HTML templates of the docs website (website/docs/**). The pages are complete
// without JavaScript; docs.js adds search, copy buttons and the `/` shortcut.
import { AUDIENCE_LABEL, GROUP_ORDER, REPO_URL, SITE_URL, escapeHtml as e, groupOf, pageUrl } from './lib.mjs'

const GITHUB_ICON = '<svg width="18" height="18" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>'

function head({ title, description, url }) {
  return `<!doctype html>
<html lang="en" class="no-js">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>${e(title)}</title>
  <meta name="description" content="${e(description)}">
  <meta name="color-scheme" content="light dark">
  <meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)">
  <meta name="theme-color" content="#050912" media="(prefers-color-scheme: dark)">
  <link rel="canonical" href="${SITE_URL}${url}">
  <meta property="og:type" content="article">
  <meta property="og:url" content="${SITE_URL}${url}">
  <meta property="og:site_name" content="OpenTodo">
  <meta property="og:title" content="${e(title)}">
  <meta property="og:description" content="${e(description)}">
  <meta property="og:image" content="${SITE_URL}/assets/og.png">
  <meta name="twitter:card" content="summary_large_image">
  <link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
  <link rel="apple-touch-icon" href="/assets/apple-touch-icon.png">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500..800&family=Inter:wght@400..700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/docs/docs.css">
  <script data-cfasync="false">document.documentElement.classList.remove('no-js')</script>
  <!-- Analytics (Umami, self-hosted, no cookies), as on the rest of the website. Search counts use, never the words typed. -->
  <script defer data-cfasync="false" src="https://analytics.pixari.dev/script.js" data-website-id="c7bcfbcc-b1cc-4168-b49b-8a4bb5e47f92"></script>
  <script defer data-cfasync="false" src="/analytics.js"></script>
  <script defer data-cfasync="false" src="/docs/docs.js"></script>
</head>`
}

function header() {
  return `<a class="skip" href="#content">Skip to content</a>
<header class="site-header">
  <div class="site-header-inner">
    <a class="brand" href="/" aria-label="OpenTodo home"><img src="/assets/favicon.svg" width="26" height="26" alt=""><span>OpenTodo</span></a>
    <nav class="site-nav" aria-label="Website">
      <a href="/#features">Features</a>
      <a href="/#self-host">Self-host</a>
      <a href="/#tour">Tour</a>
      <a href="/docs/" aria-current="true">Docs</a>
    </nav>
    <a class="gh" href="${REPO_URL}" rel="noopener" aria-label="OpenTodo on GitHub">${GITHUB_ICON}<span>GitHub</span></a>
  </div>
</header>`
}

function footer(version) {
  return `<footer class="site-footer">
  <div class="site-footer-inner">
    <p>OpenTodo is free software under the <a href="${REPO_URL}/blob/main/LICENSE" rel="noopener">AGPL-3.0</a>. These docs describe version ${e(version.release)}${version.unreleased ? ' and the changes on <code>main</code> since then' : ''}.</p>
    <nav aria-label="Footer">
      <a href="/docs/">Docs home</a>
      <a href="${REPO_URL}" rel="noopener">GitHub</a>
      <a href="${REPO_URL}/blob/main/CHANGELOG.md" rel="noopener">Changelog</a>
      <a href="${REPO_URL}/blob/main/SECURITY.md" rel="noopener">Security</a>
    </nav>
    <p class="fine">This website (not the app) counts visits and clicks with self-hosted <a href="https://umami.is" rel="noopener">Umami</a>: no cookies, no personal data, and never what you type into search.</p>
  </div>
</footer>`
}

function searchForm(id, big = false) {
  return `<form class="docs-search${big ? ' big' : ''}" role="search" action="/docs/" data-search>
  <label class="sr-only" for="${id}">Search the docs</label>
  <input id="${id}" type="search" name="q" placeholder="Search the docs" autocomplete="off" spellcheck="false" aria-controls="${id}-results" aria-describedby="${id}-hint">
  <kbd class="search-key" aria-hidden="true">/</kbd>
  <p class="sr-only" id="${id}-hint">Results appear below as you type. Press the down arrow to reach them.</p>
  <div class="search-results" id="${id}-results" hidden></div>
  <p class="sr-only" aria-live="polite" data-search-status></p>
</form>`
}

/** Sidebar navigation: every page grouped by audience and section. */
export function sidebar(sorted, current) {
  const parts = []
  let audience = ''
  for (const group of GROUP_ORDER) {
    const list = sorted.filter((p) => groupOf(p.fm) === group)
    if (!list.length) continue
    if (list[0].fm.audience !== audience) {
      if (audience) parts.push('</div>')
      audience = list[0].fm.audience
      parts.push(`<div class="side-audience"><p class="side-audience-title">${e(AUDIENCE_LABEL[audience])}</p>`)
    }
    if (group !== AUDIENCE_LABEL[audience]) parts.push(`<p class="side-group">${e(group)}</p>`)
    parts.push('<ul>' + list.map((p) => `<li><a href="${pageUrl(p.slug)}"${p.slug === current ? ' aria-current="page"' : ''}>${e(p.fm.title)}</a></li>`).join('') + '</ul>')
  }
  if (audience) parts.push('</div>')
  return `<a class="side-home" href="/docs/"${current === '' ? ' aria-current="page"' : ''}>Docs home</a>\n${parts.join('\n')}`
}

function toc(headings) {
  const items = headings.filter((h) => h.depth === 2 || h.depth === 3)
  if (items.length < 2) return ''
  const tree = []
  for (const h of items) {
    if (h.depth === 3 && tree.length) tree[tree.length - 1].children.push(h)
    else tree.push({ ...h, children: [] })
  }
  const li = (h) => `<li><a href="#${h.id}">${e(h.text)}</a>${h.children?.length ? `<ul>${h.children.map(li).join('')}</ul>` : ''}</li>`
  return `<ul>${tree.map(li).join('')}</ul>`
}

// The collapsible "On this page" for narrow screens goes after the title and its first paragraph.
function withInlineToc(html, t) {
  if (!t) return html
  const block = `<details class="toc-inline"><summary>On this page</summary><nav aria-label="On this page (inline)">${t}</nav></details>\n`
  const h1 = html.indexOf('</h1>')
  const p = html.indexOf('</p>', h1)
  const next = html.indexOf('<h', h1 + 5)
  const at = p > 0 && (next < 0 || p < next) ? p + 4 : h1 + 5
  return html.slice(0, at) + '\n' + block + html.slice(at)
}

/** One docs page. */
export function pageHtml({ page, html, headings, sorted, version }) {
  const i = sorted.indexOf(page)
  const prev = sorted[i - 1]
  const next = sorted[i + 1]
  const url = pageUrl(page.slug)
  const t = toc(headings)
  const group = groupOf(page.fm)
  const crumbs = group === AUDIENCE_LABEL[page.fm.audience] ? e(group) : `${e(AUDIENCE_LABEL[page.fm.audience])} <span aria-hidden="true">›</span> ${e(group)}`
  const nav = sidebar(sorted, page.slug)
  return `${head({ title: `${page.fm.title} · OpenTodo docs`, description: page.fm.summary, url })}
<body class="docs">
${header()}
<div class="docs-bar">
  <details class="docs-menu"><summary>Menu</summary><nav aria-label="Documentation">${nav}</nav></details>
  ${searchForm('q-bar')}
</div>
<div class="docs-shell">
  <aside class="docs-side">
    ${searchForm('q-side')}
    <nav aria-label="Documentation">${nav}</nav>
  </aside>
  <main id="content" class="docs-main" tabindex="-1">
    <article class="prose" data-audience="${e(page.fm.audience)}">
      <p class="doc-meta"><span class="crumbs">${crumbs}</span><span class="version" title="Latest release these docs describe">Version ${e(version.release)}</span></p>
${withInlineToc(html, t)}
      <p class="edit"><a href="${REPO_URL}/edit/main/docs/${e(page.rel)}" rel="noopener">Edit this page on GitHub</a></p>
    </article>
    <nav class="pager" aria-label="Previous and next page">
      ${prev ? `<a class="prev" rel="prev" href="${pageUrl(prev.slug)}"><span>Previous</span>${e(prev.fm.title)}</a>` : '<span></span>'}
      ${next ? `<a class="next" rel="next" href="${pageUrl(next.slug)}"><span>Next</span>${e(next.fm.title)}</a>` : '<span></span>'}
    </nav>
  </main>
  <aside class="docs-toc">${t ? `<nav aria-label="On this page"><p class="toc-title">On this page</p>${t}</nav>` : ''}</aside>
</div>
${footer(version)}
</body>
</html>
`
}

function picture(name, alt, width, height) {
  return `<picture><source srcset="/docs/images/${name}-dark.webp" media="(prefers-color-scheme: dark)"><img src="/docs/images/${name}-light.webp" alt="${e(alt)}" width="${width}" height="${height}" loading="lazy" decoding="async"></picture>`
}

/** The landing page: search, then friendly cards per topic. */
export function landingHtml({ index, sorted, version, cardSize }) {
  const card = (p) => `<li class="card${p.fm.card ? ' has-image' : ''}">
  ${p.fm.card ? picture(`card-${p.fm.card}`, '', cardSize.width, cardSize.height) : ''}
  <h3><a href="${pageUrl(p.slug)}">${e(p.fm.title)}</a></h3>
  <p>${e(p.fm.summary)}</p>
</li>`
  const by = (g) => sorted.filter((p) => groupOf(p.fm) === g)
  const compact = (list) => `<ul class="link-list">${list.map((p) => `<li><a href="${pageUrl(p.slug)}">${e(p.fm.title)}</a><span>${e(p.fm.summary)}</span></li>`).join('')}</ul>`
  return `${head({ title: 'OpenTodo docs', description: index.fm.summary ?? 'Guides for using OpenTodo, running your own server and building on it.', url: '/docs/' })}
<body class="docs docs-home">
${header()}
<main id="content" tabindex="-1">
  <section class="home-hero">
    <div class="home-wrap">
      <p class="kicker">Documentation · version ${e(version.release)}</p>
      <h1>${e(index.fm.title)}</h1>
      <p class="lede">${e(index.fm.summary ?? '')}</p>
      ${searchForm('q-home', true)}
      <p class="home-try">New here? Start with <a href="/docs/getting-started/">Getting started</a>, or open the <a href="https://demo.open-todo.app" rel="noopener">demo</a> in another tab and follow along.</p>
    </div>
  </section>
  <section class="home-section" aria-labelledby="h-start">
    <div class="home-wrap">
      <h2 id="h-start">Start here</h2>
      <ul class="cards cards-2">${by('Get started').map(card).join('')}</ul>
    </div>
  </section>
  <section class="home-section" aria-labelledby="h-method">
    <div class="home-wrap">
      <h2 id="h-method">Open Loops</h2>
      <p class="section-lede">A calm method for everything on your mind, inspired by GTD: five moves, the Places a task can live and the rhythms that keep it trustworthy.</p>
      ${compact(by('Open Loops'))}
    </div>
  </section>
  <section class="home-section" aria-labelledby="h-guides">
    <div class="home-wrap">
      <h2 id="h-guides">Guides</h2>
      <p class="section-lede">Short, task-based guides for everyday use.</p>
      <ul class="cards">${by('Guides').map(card).join('')}</ul>
    </div>
  </section>
  <section class="home-section" aria-labelledby="h-ref">
    <div class="home-wrap">
      <h2 id="h-ref">Reference</h2>
      <p class="section-lede">Every detail of quick add, filters, recurring rules and more.</p>
      ${compact(by('Reference'))}
    </div>
  </section>
  <section class="home-section split" aria-labelledby="h-admin">
    <div class="home-wrap">
      <div>
        <h2 id="h-admin">Run your own server</h2>
        <p class="section-lede">One container, one volume. Install, update, back up and connect your tools.</p>
        ${compact(by('Self-hosting'))}
      </div>
      <div>
        <h2 id="h-dev">Build on OpenTodo</h2>
        <p class="section-lede">The API, the command-line client, webhooks and how sync works.</p>
        ${compact([...by('Integrations'), ...by('Internals')])}
      </div>
    </div>
  </section>
</main>
${footer(version)}
</body>
</html>
`
}
