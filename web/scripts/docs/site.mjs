// HTML templates of the docs website (website/docs/**). The pages are complete
// without JavaScript; docs.js adds search, copy buttons and the `/` shortcut.
// The header and footer are the public website's (OpenSpec change `docs-landing-restyle` D3);
// the landing, the section pages and the sidebar follow the six entry points (D1, D2).
import { DEMO_URL, ENTRIES, REPO_URL, SITE_URL, breadcrumbLd, entryOf, entryUrl, escapeHtml as e, groupOf, jsonLdScript, metaDescription, navOrder, pageUrl } from './lib.mjs'

// Lucide icons (ISC licence), the set the app and the website draw with.
const ICON = {
  star: '<path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z" />',
  menu: '<path d="M4 5h16" /><path d="M4 12h16" /><path d="M4 19h16" />',
  heart: '<path d="M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5" />',
  coffee: '<path d="M10 2v2" /><path d="M14 2v2" /><path d="M16 8a1 1 0 0 1 1 1v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1h14a4 4 0 1 1 0 8h-1" /><path d="M6 2v2" />',
  chat: '<path d="M16 10a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 14.286V4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" /><path d="M20 9a2 2 0 0 1 2 2v10.286a.71.71 0 0 1-1.212.502l-2.202-2.202A2 2 0 0 0 17.172 19H10a2 2 0 0 1-2-2v-1" />',
  rss: '<path d="M4 11a9 9 0 0 1 9 9" /><path d="M4 4a16 16 0 0 1 16 16" /><circle cx="5" cy="19" r="1" />',
  arrow: '<path d="M5 12h14" /><path d="m12 5 7 7-7 7" />',
  chevron: '<path d="m6 9 6 6 6-6" />',
}
/** The mark's URLs when the build gives none (build.mjs passes version.brand, lib.mjs brandUrls). */
const PLAIN_BRAND = { favicon: '/assets/favicon.svg', touchIcon: '/assets/apple-touch-icon.png' }

const icon = (name, size = 16) => `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICON[name]}</svg>`

function head({ title, description: full, url, ld = [], brand = PLAIN_BRAND }) {
  // Search results show about 160 characters; the page keeps its whole summary (docs-landing-restyle D5).
  const description = metaDescription(full)
  return `<!doctype html>
<html lang="en" class="no-js">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>${e(title)}</title>
  <meta name="description" content="${e(description)}">
  <meta name="color-scheme" content="light dark">
  <link rel="canonical" href="${SITE_URL}${url}">
  <meta property="og:type" content="article">
  <meta property="og:url" content="${SITE_URL}${url}">
  <meta property="og:site_name" content="OpenTodo">
  <meta property="og:title" content="${e(title)}">
  <meta property="og:description" content="${e(description)}">
  <meta property="og:image" content="${SITE_URL}/brand/kit/png/og-default-1200x630.png">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta name="twitter:card" content="summary_large_image">
  <link rel="icon" href="${brand.favicon}" type="image/svg+xml">
  <link rel="apple-touch-icon" href="${brand.touchIcon}">
  <link rel="preload" href="/fonts/InterVariable-latin.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="stylesheet" href="/docs/docs.css">${ld.length ? `\n  ${jsonLdScript(ld.length === 1 ? { '@context': 'https://schema.org', ...ld[0] } : { '@context': 'https://schema.org', '@graph': ld })}` : ''}
  <script data-cfasync="false">document.documentElement.classList.remove('no-js')</script>
  <!-- Analytics (Umami, self-hosted, no cookies), as on the rest of the website. Search counts use, never the words typed. -->
  <script defer data-cfasync="false" src="https://analytics.pixari.dev/script.js" data-website-id="c7bcfbcc-b1cc-4168-b49b-8a4bb5e47f92"></script>
  <script defer data-cfasync="false" src="/analytics.js"></script>
  <script defer data-cfasync="false" src="/docs/docs.js"></script>
</head>`
}

// The website's destinations; Docs is current on every docs page.
const NAV = [['Features', '/features/'], ['Learn', '/learn/'], ['Docs', '/docs/'], ['Blog', '/blog/']]
const navLinks = () => NAV.map(([label, href]) => `<li><a class="nav-link" href="${href}"${href === '/docs/' ? ' aria-current="page"' : ''}>${label}</a></li>`).join('')

function header(brand = PLAIN_BRAND) {
  return `<a class="skip" href="#content">Skip to content</a>
<header class="site-header">
  <div class="wrap header-inner">
    <a class="brand" href="/"><img src="${brand.favicon}" width="28" height="28" alt=""><span>OpenTodo</span></a>
    <nav class="nav-desktop" aria-label="Main"><ul>${navLinks()}</ul></nav>
    <div class="header-tools">
      <a class="header-star" href="${REPO_URL}" rel="noopener">${icon('star')}<span>Star<span class="sr-only"> OpenTodo on GitHub</span></span></a>
      <a class="btn btn-primary btn-small" href="${DEMO_URL}" rel="noopener">Try the demo</a>
      <details class="nav-menu">
        <summary>${icon('menu', 18)}<span class="sr-only">Menu</span></summary>
        <div class="menu-panel">
          <nav aria-label="Main"><ul>${navLinks()}<li><a class="nav-link" href="/start/">Get started</a></li><li><a class="nav-link" href="${REPO_URL}" rel="noopener">${icon('star', 18)} Star on GitHub</a></li></ul></nav>
        </div>
      </details>
    </div>
  </div>
</header>`
}

const FOOTER_GROUPS = [
  ['Product', [['Features', '/features/'], ['Get started', '/start/'], ['Install the app', '/install/'], ['Self-host', '/self-host/'], ['Templates', '/templates/'], ['Changelog', '/changelog/']]],
  ['Learn', [['Guides and how-tos', '/learn/'], ['Docs', '/docs/'], ['Under the hood', '/under-the-hood/'], ['Blog', '/blog/']]],
  ['Project', [['About', '/about/'], ['Support OpenTodo', '/support/'], ['Security', '/security/'], ['Accessibility', '/accessibility/'], ['Privacy', '/privacy/']]],
]
const COMMUNITY = [
  ['star', 'Star on GitHub', REPO_URL],
  ['heart', 'Sponsor', 'https://github.com/sponsors/pixari'],
  ['coffee', 'Buy me a coffee', 'https://buymeacoffee.com/pixari'],
  ['chat', 'Discord', 'https://discord.gg/mmSsuCRduD'],
  ['rss', 'RSS', '/feed.xml'],
]

function footer(version) {
  const list = (items) => `<ul>${items.map(([label, href]) => `<li><a href="${href}"${href.startsWith('http') ? ' rel="noopener"' : ''}>${e(label)}</a></li>`).join('')}</ul>`
  return `<footer class="site-footer">
  <div class="wrap">
    <div class="footer-top">
      <div class="footer-brand">
        <a class="brand" href="/"><img src="${(version.brand ?? PLAIN_BRAND).favicon}" width="24" height="24" alt=""><span>OpenTodo</span></a>
        <p>The task manager you host yourself. Free and open source.</p>
      </div>
      ${FOOTER_GROUPS.map(([title, items]) => `<nav class="footer-group" aria-label="${title}"><h2>${title}</h2>${list(items)}</nav>`).join('\n      ')}
      <div class="footer-fold">
        ${FOOTER_GROUPS.map(([title, items]) => `<nav aria-label="${title}"><details><summary><span>${title}</span>${icon('chevron')}</summary>${list(items)}</details></nav>`).join('\n        ')}
      </div>
    </div>
    <nav class="footer-community" aria-label="Community"><ul>${COMMUNITY.map(([i, label, href]) => `<li><a href="${href}"${href.startsWith('http') ? ' rel="noopener"' : ''}>${icon(i)}${label}</a></li>`).join('')}</ul></nav>
    <p class="footer-legal"><span>Docs for OpenTodo ${e(version.release)}${version.unreleased ? ' and <code>main</code>' : ''}</span><a href="${REPO_URL}/blob/main/LICENSE" rel="noopener">AGPL-3.0</a><a href="${REPO_URL}/blob/main/CHANGELOG.md" rel="noopener">Changelog</a><span>Visits counted with self-hosted Umami, no cookies, never your searches.</span></p>
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

const link = (p, current) => `<a href="${pageUrl(p.slug)}"${p.slug === current ? ' aria-current="page"' : ''}>${e(p.fm.title)}</a>`

/**
 * Sidebar navigation: the six entry points as disclosures, the current one open. A topic's
 * deeper pages show under it only while the current page is that topic or one of them.
 */
export function sidebar(entries, current, currentEntry) {
  const parts = entries.map(({ entry, items }) => {
    let group = ''
    const rows = items.map((it) => {
      const heading = entry.groups.length > 1 && it.group !== group && entry.groups.includes(it.group) ? `</ul><p class="side-group">${e(it.group)}</p><ul>` : ''
      if (entry.groups.includes(it.group)) group = it.group
      const family = it.page.slug === current || it.children.some((c) => c.slug === current)
      const kids = family && it.children.length ? `<ul class="side-kids">${it.children.map((c) => `<li>${link(c, current)}</li>`).join('')}</ul>` : ''
      return `${heading}<li>${link(it.page, current)}${kids}</li>`
    }).join('')
    const open = entry.key === currentEntry ? ' open' : ''
    return `<details class="side-entry"${open}><summary>${e(entry.title)}</summary><a class="side-overview" href="${entryUrl(entry.key)}"${current === `@${entry.key}` ? ' aria-current="page"' : ''}>Overview</a><ul>${rows}</ul></details>`
  })
  return `<a class="side-home" href="/docs/"${current === '' ? ' aria-current="page"' : ''}>Docs home</a>\n${parts.join('\n').replace(/<ul><\/ul>/g, '')}`
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

/** The docs shell around a page's article: bar and menu on phones, sidebar, TOC column. */
function shell({ entries, current, currentEntry, body, tocHtml = '' }) {
  const nav = sidebar(entries, current, currentEntry)
  return `<div class="docs-bar">
  <details class="docs-menu"><summary>Docs menu</summary><nav aria-label="Documentation">${nav}</nav></details>
  ${searchForm('q-bar')}
</div>
<div class="docs-shell">
  <aside class="docs-side">
    ${searchForm('q-side')}
    <nav aria-label="Documentation">${nav}</nav>
  </aside>
  <main id="content" class="docs-main" tabindex="-1">
${body}
  </main>
  <aside class="docs-toc">${tocHtml ? `<nav aria-label="On this page"><p class="toc-title">On this page</p>${tocHtml}</nav>` : ''}</aside>
</div>`
}

const crumbs = (entry) => `<a href="/docs/">Docs</a> <span aria-hidden="true">›</span> <a href="${entryUrl(entry.key)}">${e(entry.title)}</a>`

/** One docs page. `entries` is entryTree(sorted, tree). */
export function pageHtml({ page, html, headings, entries, version }) {
  const order = navOrder(entries)
  const i = order.indexOf(page)
  const prev = order[i - 1]
  const next = order[i + 1]
  const key = entryOf(page)
  const entry = ENTRIES.find((x) => x.key === key)
  const t = toc(headings)
  const body = `    <article class="prose" data-audience="${e(page.fm.audience)}">
      <p class="doc-meta"><span class="crumbs">${crumbs(entry)}</span><span class="version" title="Latest release these docs describe">${e(version.release)}</span></p>
${withInlineToc(html, t)}
      <p class="edit"><a href="${REPO_URL}/edit/main/docs/${e(page.rel)}" rel="noopener">Edit this page on GitHub</a></p>
    </article>
    <nav class="pager" aria-label="Previous and next page">
      ${prev ? `<a class="prev" rel="prev" href="${pageUrl(prev.slug)}"><span>Previous</span>${e(prev.fm.title)}</a>` : '<span></span>'}
      ${next ? `<a class="next" rel="next" href="${pageUrl(next.slug)}"><span>Next</span>${e(next.fm.title)}</a>` : '<span></span>'}
    </nav>`
  const url = pageUrl(page.slug)
  const ld = [
    breadcrumbLd([['OpenTodo', '/'], ['Docs', '/docs/'], [entry.title, entryUrl(key)], [page.fm.title, url]]),
    { '@type': 'TechArticle', headline: page.fm.title, description: metaDescription(page.fm.summary), url: SITE_URL + url, inLanguage: 'en' },
  ]
  return `${head({ title: `${page.fm.title} · OpenTodo docs`, description: page.fm.summary, url, ld, brand: version.brand })}
<body class="docs">
${header(version.brand)}
${shell({ entries, current: page.slug, currentEntry: key, body, tocHtml: t })}
${footer(version)}
</body>
</html>
`
}

/** A section page: every page of one entry point, topics with their deeper pages nested (D2). */
export function sectionHtml({ key, entries, version }) {
  const { entry, items } = entries.find((x) => x.entry.key === key)
  const count = items.reduce((n, it) => n + 1 + it.children.length, 0)
  const groups = entry.groups.length > 1 ? entry.groups.map((g) => [g, items.filter((it) => it.group === g)]) : [['', items]]
  const extra = items.filter((it) => !entry.groups.includes(it.group))
  if (extra.length && entry.groups.length > 1) groups[groups.length - 1][1].push(...extra)
  const row = (it) => `<li><a class="row-title" href="${pageUrl(it.page.slug)}">${e(it.page.fm.title)}</a><p>${e(it.page.fm.summary)}</p>${it.children.length ? `<ul class="row-kids">${it.children.map((c) => `<li><a href="${pageUrl(c.slug)}">${e(c.fm.title)}</a></li>`).join('')}</ul>` : ''}</li>`
  const body = `    <article class="section-page">
      <p class="doc-meta"><span class="crumbs"><a href="/docs/">Docs</a></span><span class="version" title="Latest release these docs describe">${e(version.release)}</span></p>
      <h1>${e(entry.title)}</h1>
      <p class="section-line">${e(entry.line)} ${count} pages.</p>
      ${groups.map(([g, list]) => `${g ? `<h2 id="${g.toLowerCase().replace(/[^a-z]+/g, '-')}">${e(g)}</h2>` : ''}<ul class="section-rows">${list.map(row).join('')}</ul>`).join('\n      ')}
    </article>`
  return `${head({ title: `${entry.title} · OpenTodo docs`, description: `${entry.line} Every page, with what it covers.`, url: entryUrl(key), ld: [breadcrumbLd([['OpenTodo', '/'], ['Docs', '/docs/'], [entry.title, entryUrl(key)]])], brand: version.brand })}
<body class="docs">
${header(version.brand)}
${shell({ entries, current: `@${key}`, currentEntry: key, body })}
${footer(version)}
</body>
</html>
`
}

/** The landing page: search, then the six entry points with their key pages. */
export function landingHtml({ index, entries, version }) {
  const block = ({ entry, items }) => {
    const all = items.flatMap((it) => [it.page, ...it.children])
    const featured = entry.featured.map((s) => all.find((p) => p.slug === s)).filter(Boolean)
    return `<section class="entry" aria-labelledby="e-${entry.key}">
      <h2 id="e-${entry.key}"><a href="${entryUrl(entry.key)}">${e(entry.title)}</a></h2>
      <p>${e(entry.line)}</p>
      <ul>${featured.map((p) => `<li><a href="${pageUrl(p.slug)}">${e(p.fm.title)}</a></li>`).join('')}</ul>
      <a class="entry-all" href="${entryUrl(entry.key)}">All ${all.length} pages${icon('arrow')}</a>
    </section>`
  }
  return `${head({ title: 'OpenTodo docs', description: index.fm.summary ?? 'Guides for using OpenTodo, running your own server and building on it.', url: '/docs/', ld: [breadcrumbLd([['OpenTodo', '/'], ['Docs', '/docs/']])], brand: version.brand })}
<body class="docs docs-home">
${header(version.brand)}
<main id="content" tabindex="-1">
  <div class="wrap home">
    <div class="home-head">
      <h1>Documentation</h1>
      ${searchForm('q-home', true)}
      <p class="home-version">OpenTodo ${e(version.release)}</p>
    </div>
    <div class="entries">
      ${entries.map(block).join('\n      ')}
    </div>
  </div>
</main>
${footer(version)}
</body>
</html>
`
}
