// Shared code of the documentation build and check (OpenSpec change
// `user-documentation`): front matter, page discovery, Markdown rendering with
// heading ids, link and image rewriting, the inline-HTML allow-list, and the
// section index used by search. Plain Node ESM with one dependency (`marked`).
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, posix, relative, resolve } from 'node:path'
import { Marked } from 'marked'

export const REPO_URL = 'https://github.com/pixari/opentodo'
export const SITE_URL = 'https://opentodo.pixari.dev'
export const AUDIENCES = ['user', 'admin', 'developer']
const KEYS = new Set(['title', 'summary', 'audience', 'specs', 'screens', 'order', 'section', 'card', 'layout'])

// ------------------------------------------------------------- front matter

/**
 * Parses the small YAML subset the docs use: `key: value` lines, quoted or bare
 * strings, integers and inline lists (`[a, b]`). Returns { data, body, errors }.
 * A file without a front matter block yields data = null.
 */
export function parseFrontMatter(src) {
  const text = src.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n')
  if (!text.startsWith('---\n')) return { data: null, body: text, errors: ['missing front matter (a block between --- lines at the top)'] }
  const end = text.indexOf('\n---\n', 4)
  if (end < 0) return { data: null, body: text, errors: ['front matter is not closed with ---'] }
  const lines = text.slice(4, end).split('\n')
  const data = {}
  const errors = []
  for (const [i, line] of lines.entries()) {
    if (!line.trim() || line.trim().startsWith('#')) continue
    const m = /^([a-z_]+):\s*(.*)$/.exec(line)
    if (!m) { errors.push(`front matter line ${i + 2}: expected "key: value"`); continue }
    const [, key, raw] = m
    if (!KEYS.has(key)) { errors.push(`front matter: unknown key "${key}"`); continue }
    data[key] = parseValue(raw.replace(/\s+#.*$/, '').trim())
  }
  return { data, body: text.slice(end + 5), errors }
}

function parseValue(raw) {
  if (raw.startsWith('[') && raw.endsWith(']')) {
    const inner = raw.slice(1, -1).trim()
    return inner ? inner.split(',').map((s) => unquote(s.trim())).filter(Boolean) : []
  }
  if (/^-?\d+$/.test(raw)) return Number(raw)
  return unquote(raw)
}

const unquote = (s) => (/^(["']).*\1$/.test(s) ? s.slice(1, -1) : s)

/** Validates parsed front matter; returns a list of problems. */
export function validateFrontMatter(data) {
  if (!data) return []
  const errors = []
  if (data.layout === 'index') return typeof data.title === 'string' && data.title ? [] : ['front matter: title is required']
  for (const k of ['title', 'summary']) if (typeof data[k] !== 'string' || !data[k].trim()) errors.push(`front matter: ${k} is required`)
  if (typeof data.summary === 'string' && data.summary.length > 200) errors.push('front matter: summary is longer than 200 characters')
  if (!AUDIENCES.includes(data.audience)) errors.push(`front matter: audience must be one of ${AUDIENCES.join(', ')}`)
  for (const k of ['specs', 'screens']) if (data[k] !== undefined && !Array.isArray(data[k])) errors.push(`front matter: ${k} must be a list like [a, b]`)
  if (!Array.isArray(data.specs)) errors.push('front matter: specs is required (use [] for none)')
  if (typeof data.order !== 'number') errors.push('front matter: order must be a number')
  if (data.section !== undefined && typeof data.section !== 'string') errors.push('front matter: section must be text')
  return errors
}

// ------------------------------------------------------------------ pages

/** Every Markdown file under docsDir, as paths relative to it, sorted. */
export function listMarkdown(docsDir) {
  const out = []
  const walk = (dir) => {
    for (const name of readdirSync(dir).sort()) {
      const p = join(dir, name)
      if (statSync(p).isDirectory()) walk(p)
      else if (name.endsWith('.md')) out.push(relative(docsDir, p).split('\\').join('/'))
    }
  }
  walk(docsDir)
  return out
}

/** `self-hosting/docker.md` → `self-hosting/docker`; `README.md` → `` (the landing page). */
export const slugOf = (rel) => (rel === 'README.md' ? '' : rel.replace(/\.md$/, ''))
export const pageUrl = (slug, anchor = '') => `/docs/${slug ? slug + '/' : ''}${anchor ? '#' + anchor : ''}`

/** Section of the sidebar a page belongs to. */
export function groupOf(fm) {
  if (fm.audience === 'user') return fm.section || 'Guides'
  if (fm.audience === 'admin') return fm.section || 'Self-hosting'
  return fm.section || 'Integrations'
}
export const GROUP_ORDER = ['Get started', 'Switch from another app', 'Guides', 'Reference', 'Self-hosting', 'Integrations', 'Internals']
export const AUDIENCE_LABEL = { user: 'Using OpenTodo', admin: 'Self-hosting', developer: 'Integrations and internals' }

/**
 * Loads every page: { rel, slug, fm, body, errors }. The landing page (README.md)
 * is included with fm.layout === 'index'.
 */
export function loadPages(docsDir) {
  return listMarkdown(docsDir).map((rel) => {
    const src = readFileSync(join(docsDir, rel), 'utf8')
    const { data, body, errors } = parseFrontMatter(src)
    return { rel, slug: slugOf(rel), fm: data ?? {}, body, errors: [...errors, ...validateFrontMatter(data)] }
  })
}

/** Pages in navigation order: by group, then `order`, then title. */
export function sortPages(pages) {
  return pages.filter((p) => p.fm.layout !== 'index').sort((a, b) =>
    GROUP_ORDER.indexOf(groupOf(a.fm)) - GROUP_ORDER.indexOf(groupOf(b.fm)) ||
    (a.fm.order ?? 999) - (b.fm.order ?? 999) || String(a.fm.title).localeCompare(String(b.fm.title)))
}

// ------------------------------------------------------------------ slugs

/** GitHub-compatible heading ids, deduplicated per page with -1, -2… */
export function createSlugger() {
  const seen = new Map()
  return (text) => {
    const base = text.toLowerCase().trim().replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, '').replace(/ /g, '-')
    let id = base
    if (seen.has(base)) {
      let n = seen.get(base)
      do id = `${base}-${++n}`; while (seen.has(id))
      seen.set(base, n)
    }
    seen.set(id, seen.get(id) ?? 0)
    return id
  }
}

/** Plain text of inline tokens (as GitHub uses for heading ids). */
export function inlineText(tokens = []) {
  return tokens.map((t) => {
    if (t.type === 'codespan') return t.text.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    if (t.type === 'html') return ''
    if (t.tokens) return inlineText(t.tokens)
    if (t.type === 'escape' || t.type === 'text') return decode(t.text)
    return decode(t.text ?? t.raw ?? '')
  }).join('')
}

const decode = (s) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
export const escapeHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Headings of a Markdown body: [{ depth, text, id }] in document order. */
export function headingsOf(body) {
  const slug = createSlugger()
  const out = []
  new Marked().walkTokens(new Marked().lexer(body), (t) => {
    if (t.type === 'heading') { const text = inlineText(t.tokens); out.push({ depth: t.depth, text, id: slug(text) }) }
  })
  return out
}

// ------------------------------------------------------------ inline HTML

const ALLOWED = {
  img: new Set(['src', 'alt', 'width', 'height']),
  picture: new Set(),
  source: new Set(['srcset', 'media', 'type', 'width', 'height']),
  kbd: new Set(),
  details: new Set(['open']),
  summary: new Set(),
}
const VOID = new Set(['img', 'source'])

/**
 * Keeps only the allowed tags and attributes of a raw HTML fragment from the
 * Markdown. Anything else (including <script>, event handlers and other tags) is
 * shown as text, the way the author typed it; comments are dropped.
 * `url` rewrites src/srcset values. Returns { html, images } where images lists
 * every <img> as { src, alt } for the checks.
 */
export function sanitizeHtml(fragment, url = (u) => u) {
  const images = []
  let html = ''
  let last = 0
  const re = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:\s+[^\s"'>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'>]+))?)*)\s*(\/?)>/g
  for (let m; (m = re.exec(fragment));) {
    html += escapeText(fragment.slice(last, m.index))
    last = re.lastIndex
    if (m[0].startsWith('<!--')) continue
    const [, close, rawName, attrText] = m
    const name = rawName.toLowerCase()
    const allowed = ALLOWED[name]
    if (!allowed) { html += escapeHtml(m[0]); continue }
    if (close) { if (!VOID.has(name)) html += `</${name}>`; continue }
    const attrs = []
    const attrRe = /([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g
    const kept = {}
    for (let a; (a = attrRe.exec(attrText));) {
      const key = a[1].toLowerCase()
      if (!allowed.has(key)) continue
      let value = a[2] ?? a[3] ?? a[4] ?? ''
      if (key === 'src') value = url(value)
      if (key === 'srcset') value = value.split(',').map((part) => { const [u, ...rest] = part.trim().split(/\s+/); return [url(u), ...rest].join(' ') }).join(', ')
      if ((key === 'src' || key === 'srcset') && /^\s*(javascript|data|vbscript):/i.test(value)) continue
      kept[key] = value
    }
    if (name === 'img') images.push({ src: kept.src ?? '', alt: kept.alt ?? '' })
    for (const [k, v] of Object.entries(kept)) attrs.push(v === '' && k === 'open' ? ' open' : ` ${k}="${escapeHtml(decode(v))}"`)
    html += `<${name}${attrs.join('')}>`
  }
  html += escapeText(fragment.slice(last))
  return { html, images }
}

// Text between tags: escape markup characters but keep entities the author wrote.
const escapeText = (s) => s.replace(/&(?!(?:[a-zA-Z]+|#\d+|#x[0-9a-fA-F]+);)/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// -------------------------------------------------------------- links

/**
 * Resolves a link written in docs/<fromRel> to where it points. Returns one of
 *   { kind: 'page', slug, anchor }       another docs page (or this one)
 *   { kind: 'anchor', anchor }            same page
 *   { kind: 'repo', path, anchor }        a file or folder elsewhere in the repository
 *   { kind: 'image', path }               a file under docs/ (images)
 *   { kind: 'external', href }            http(s), mailto
 */
export function resolveLink(href, fromRel) {
  if (/^(https?:|mailto:)/i.test(href)) return { kind: 'external', href }
  if (href.startsWith('#')) return { kind: 'anchor', anchor: decodeURIComponent(href.slice(1)) }
  const [pathPart, anchor = ''] = href.split('#')
  const target = posix.normalize(posix.join(posix.dirname(`docs/${fromRel}`), pathPart.split('?')[0]))
  if (target.startsWith('docs/') && target.endsWith('.md')) return { kind: 'page', slug: slugOf(target.slice(5)), rel: target.slice(5), anchor: decodeURIComponent(anchor) }
  if (target.startsWith('docs/')) return { kind: 'image', path: target }
  return { kind: 'repo', path: target.replace(/\/$/, ''), anchor: decodeURIComponent(anchor), dir: pathPart.endsWith('/') }
}

// ------------------------------------------------------------ images

/** Width and height of a WebP, PNG or SVG file, or null. */
export function imageSize(file) {
  if (!existsSync(file)) return null
  const b = readFileSync(file)
  if (b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') {
    const chunk = b.toString('ascii', 12, 16)
    if (chunk === 'VP8X') return { width: 1 + b.readUIntLE(24, 3), height: 1 + b.readUIntLE(27, 3) }
    if (chunk === 'VP8 ') return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff }
    if (chunk === 'VP8L') { const n = b.readUInt32LE(21); return { width: 1 + (n & 0x3fff), height: 1 + ((n >> 14) & 0x3fff) } }
  }
  if (b.readUInt32BE(0) === 0x89504e47) return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) }
  return null
}

// ----------------------------------------------------------- rendering

/**
 * Renders one page body to HTML for a target ("site" or "app").
 * ctx: { rel, repoRoot, pagesByRel, audienceOf(rel) }.
 * Returns { html, headings, images, links, sections }.
 *   links: every link and image reference found, for the checks
 *   sections: [{ id, heading, text }] plain text per heading for search
 */
export function renderPage(body, ctx, target = 'site') {
  const slug = createSlugger()
  const headings = []
  const images = []
  const links = []
  const imageUrl = (href) => {
    const r = resolveLink(href, ctx.rel)
    links.push({ href, ...r, image: true })
    if (r.kind === 'image') return '/' + r.path
    if (r.kind === 'repo') return `${REPO_URL}/raw/main/${r.path}`
    return href
  }
  const linkUrl = (href) => {
    const r = resolveLink(href, ctx.rel)
    links.push({ href, ...r })
    switch (r.kind) {
      case 'page': {
        const audience = ctx.audienceOf?.(r.rel)
        if (target === 'app' && audience && audience !== 'user') return { href: SITE_URL + pageUrl(r.slug, r.anchor), external: true }
        return { href: pageUrl(r.slug, r.anchor), doc: r.slug }
      }
      case 'anchor': return { href: '#' + r.anchor }
      case 'image': return { href: '/' + r.path }
      case 'repo': return { href: `${REPO_URL}/${r.dir || isDir(ctx.repoRoot, r.path) ? 'tree' : 'blob'}/main/${r.path}${r.anchor ? '#' + r.anchor : ''}`, external: true }
      default: return { href: r.href, external: true }
    }
  }
  const md = new Marked({ gfm: true })
  md.use({
    renderer: {
      heading({ tokens, depth }) {
        const text = inlineText(tokens)
        const id = slug(text)
        headings.push({ depth, text, id })
        const inner = this.parser.parseInline(tokens)
        if (depth === 1) return `<h1 id="${id}">${inner}</h1>\n`
        return `<h${depth} id="${id}">${inner}<a class="anchor" href="#${id}" aria-label="Link to this section: ${escapeHtml(text)}">#</a></h${depth}>\n`
      },
      link({ href, title, tokens }) {
        const u = linkUrl(href)
        const inner = this.parser.parseInline(tokens)
        const t = title ? ` title="${escapeHtml(title)}"` : ''
        const ext = u.external ? (target === 'app' ? ' target="_blank" rel="noopener"' : ' rel="noopener"') : ''
        const doc = u.doc !== undefined && target === 'app' ? ` data-doc="${escapeHtml(u.doc)}"` : ''
        return `<a href="${escapeHtml(u.href)}"${t}${ext}${doc}>${inner}</a>`
      },
      image({ href, title, text }) {
        const src = imageUrl(href)
        images.push({ src, alt: text })
        return imgTag(src, text, title, ctx)
      },
      html({ text }) {
        const { html, images: found } = sanitizeHtml(text, imageUrl)
        images.push(...found)
        return addImageAttrs(html, ctx)
      },
      code({ text, lang }) {
        const l = (lang || '').trim().split(/\s+/)[0]
        const cls = l ? ` class="language-${escapeHtml(l)}"` : ''
        return `<pre tabindex="0"><code${cls}>${escapeHtml(text)}</code></pre>\n`
      },
    },
  })
  const tokens = md.lexer(body)
  const sections = sectionsOf(tokens)
  let html = md.parser(tokens)
  html = html.replace(/<table>/g, '<div class="table-wrap" tabindex="0"><table>').replace(/<\/table>/g, '</table></div>')
  return { html, headings, images, links, sections: sections.map((s) => ({ ...s, id: s.heading ? headings.find((h, i) => i === s.index)?.id ?? '' : '' })) }
}

const isDir = (root, p) => { try { return statSync(join(root, p)).isDirectory() } catch { return false } }

function imgTag(src, alt, title, ctx) {
  const size = src.startsWith('/docs/') ? imageSize(join(ctx.repoRoot, src.slice(1))) : null
  const dims = size ? ` width="${size.width}" height="${size.height}"` : ''
  const t = title ? ` title="${escapeHtml(title)}"` : ''
  return `<img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}"${dims}${t} loading="lazy" decoding="async">`
}

// Real dimensions and lazy loading for <img> tags written as HTML.
function addImageAttrs(html, ctx) {
  return html.replace(/<img ([^>]*)>/g, (all, attrs) => {
    let out = attrs
    const src = /src="([^"]*)"/.exec(attrs)?.[1] ?? ''
    if (!/\bwidth=/.test(out) && src.startsWith('/docs/')) {
      const size = imageSize(join(ctx.repoRoot, src.slice(1)))
      if (size) out += ` width="${size.width}" height="${size.height}"`
    }
    return `<img ${out} loading="lazy" decoding="async">`
  })
}

// Plain text per section (intro before the first h2, then each h2/h3) for search.
function sectionsOf(tokens) {
  const out = [{ heading: '', index: -1, text: '' }]
  let headingIndex = -1
  const textOf = (t) => {
    if (t.type === 'code') return t.text
    if (t.type === 'html') return t.text.replace(/<[^>]*>/g, ' ')
    if (t.type === 'table') return [...t.header, ...t.rows.flat()].map((c) => inlineText(c.tokens)).join(' ')
    if (t.type === 'list') return t.items.map((i) => i.tokens.map(textOf).join(' ')).join(' ')
    if (t.tokens) return inlineText(t.tokens)
    return t.text ?? ''
  }
  for (const t of tokens) {
    if (t.type === 'heading') {
      headingIndex++
      if (t.depth === 1) continue
      if (t.depth <= 3) { out.push({ heading: inlineText(t.tokens), index: headingIndex, text: '' }); continue }
    }
    out[out.length - 1].text += ' ' + textOf(t)
  }
  return out.map((s) => ({ ...s, text: s.text.replace(/\s+/g, ' ').trim() })).filter((s) => s.heading || s.text)
}

// --------------------------------------------------------------- misc

/** Latest released version and whether CHANGELOG.md has unreleased entries. */
export function versionInfo(repoRoot) {
  const log = readFileSync(join(repoRoot, 'CHANGELOG.md'), 'utf8')
  const release = /^## \[(\d+\.\d+\.\d+)\]/m.exec(log)?.[1] ?? 'dev'
  const unreleased = /^## \[Unreleased\]\s*\n([\s\S]*?)^## \[/m.exec(log)?.[1] ?? ''
  return { release, unreleased: /^\s*[-*] /m.test(unreleased) }
}

/** Directory names under openspec/specs. */
export const specNames = (repoRoot) => readdirSync(join(repoRoot, 'openspec/specs')).filter((n) => statSync(join(repoRoot, 'openspec/specs', n)).isDirectory()).sort()

export const repoRootFrom = (here) => resolve(dirname(here), '../../..')
