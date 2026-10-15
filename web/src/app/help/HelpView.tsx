import { Icon } from '../../ui'
import { useEffect, useMemo, useRef, useState } from 'react'
import { findTopic, helpSections, loadHelp, searchHelp, type HelpBundle } from '../../lib/help'
import type { SearchEntry } from '../../../scripts/docs/search-core.mjs'
import { navigate } from '../router'
import { HelpContent } from './HelpContent'

const SITE = 'https://open-todo.app/docs/'

/**
 * The Help view (OpenSpec change `user-documentation`, design D5): the user guide
 * of this version, offline, with search. `/help` lists the guides, `/help/<guide>`
 * shows one with its "On this page" list, `/help?q=` starts with a search.
 */
export function HelpView({ page: slug, q }: { page?: string; q?: string }) {
  const [data, setData] = useState<{ bundle: HelpBundle; entries: SearchEntry[] } | null>(null)
  const [failed, setFailed] = useState(false)
  const [query, setQuery] = useState(q ?? '')
  const [anchor, setAnchor] = useState<string | undefined>(() => (typeof location !== 'undefined' && location.hash ? decodeURIComponent(location.hash.slice(1)) : undefined))
  const searchRef = useRef<HTMLInputElement>(null)
  useEffect(() => { loadHelp().then(setData, () => setFailed(true)) }, [])
  useEffect(() => { setQuery(q ?? '') }, [q])
  // `:help <topic>` that names a guide opens it directly.
  useEffect(() => {
    if (!data || !q || slug) return
    const hit = findTopic(data.bundle, q)
    if (hit && (hit.slug === q.trim().toLowerCase() || hit.title.toLowerCase() === q.trim().toLowerCase())) navigate({ view: 'help', page: hit.slug }, { replace: true })
  }, [data, q, slug])

  const results = useMemo(() => (data && query.trim() ? searchHelp(data.entries, query) : []), [data, query])
  const page = data && slug ? data.bundle.pages.find((p) => p.slug === slug) : undefined
  const open = (s: string, a?: string) => { setQuery(''); setAnchor(a); navigate({ view: 'help', page: s }) }

  if (failed) return <div className="mx-auto max-w-2xl px-4 py-6"><h1 className="text-xl font-semibold">Help</h1><p className="mt-2 text-sm text-muted">Help could not be loaded. Reload the app and try again.</p></div>
  if (!data) return <div className="mx-auto max-w-2xl px-4 py-6"><h1 className="text-xl font-semibold">Help</h1><p className="mt-2 text-sm text-muted" role="status">Loading…</p></div>

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 md:px-8" data-help-scroll data-help-view>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        {page ? (
          <p className="text-sm"><a className="underline" href="/help" onClick={(e) => { e.preventDefault(); setQuery(''); navigate({ view: 'help' }) }}>Help</a> <Icon name="chevron-right" size="xs" className="inline align-[-1px]" /> {page.section}</p>
        ) : (
          <h1 className="text-xl font-semibold">Help</h1>
        )}
        <span className="text-xs text-muted">OpenTodo {data.bundle.version} · works offline</span>
      </div>
      <div role="search" className="relative mt-3 max-w-xl">
        <label className="sr-only" htmlFor="help-search">Search help</label>
        <input id="help-search" ref={searchRef} type="search" className="input w-full" placeholder="Search help, e.g. board, repeat, offline" value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { const first = document.querySelector<HTMLAnchorElement>('[data-help-result]'); if (first) { e.preventDefault(); first.focus() } }
            if (e.key === 'Enter' && results[0]) { e.preventDefault(); const [s, a] = results[0].url.split('#'); open(s, a) }
          }} />
      </div>
      <p className="sr-only" aria-live="polite">{query.trim() ? `${results.length} result${results.length === 1 ? '' : 's'}` : ''}</p>
      {query.trim() ? (
        <section aria-label="Search results" className="mt-4 max-w-2xl">
          {results.length === 0 && <p className="text-sm text-muted">No matches. Try a shorter or different word.</p>}
          <ul className="space-y-1">
            {results.map((r) => {
              const [s, a] = r.url.split('#')
              return (
                <li key={r.url}>
                  <a href={`/help/${s}${a ? `#${a}` : ''}`} data-help-result className="block rounded-md px-3 py-2 hover:bg-sunken focus-visible:bg-sunken dark:hover:bg-raised"
                    onClick={(e) => { e.preventDefault(); open(s, a) }}
                    onKeyDown={(e) => {
                      const links = [...document.querySelectorAll<HTMLAnchorElement>('[data-help-result]')]
                      const i = links.indexOf(e.currentTarget)
                      if (e.key === 'ArrowDown' && links[i + 1]) { e.preventDefault(); links[i + 1].focus() }
                      if (e.key === 'ArrowUp') { e.preventDefault(); (links[i - 1] ?? searchRef.current)?.focus() }
                    }}>
                    <span className="block text-sm font-medium">{r.page}{r.heading ? ` › ${r.heading}` : ''}</span>
                    <span className="help-snippet block text-xs text-muted" dangerouslySetInnerHTML={{ __html: r.snippet }} />
                  </a>
                </li>
              )
            })}
          </ul>
        </section>
      ) : page ? (
        <div className="mt-4 gap-8 lg:grid lg:grid-cols-[minmax(0,1fr)_14rem]">
          <article className="min-w-0 max-w-[70ch]">
            <HelpContent page={page} anchor={anchor} onOpen={open} />
          </article>
          {page.toc.length > 1 && (
            <nav aria-label="On this page" className="order-first mb-6 text-sm lg:order-none lg:sticky lg:top-4 lg:self-start">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">On this page</p>
              <ul className="space-y-0.5">
                {page.toc.map((t) => (
                  <li key={t.id}><a className="touch-target block py-1 text-muted hover:underline" href={`#${t.id}`}
                    onClick={(e) => { e.preventDefault(); setAnchor(undefined); requestAnimationFrame(() => setAnchor(t.id)) }}>{t.text}</a></li>
                ))}
              </ul>
            </nav>
          )}
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          {helpSections(data.bundle).map((s) => (
            <section key={s.title} aria-labelledby={`help-sec-${s.title}`}>
              <h2 id={`help-sec-${s.title}`} className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">{s.title}</h2>
              <ul className="grid gap-2 sm:grid-cols-2">
                {s.pages.map((p) => (
                  <li key={p.slug}>
                    <a href={`/help/${p.slug}`} className="block h-full rounded-lg border border-default p-3 hover:border-accent"
                      onClick={(e) => { e.preventDefault(); open(p.slug) }}>
                      <span className="block font-medium">{p.title}</span>
                      <span className="mt-0.5 block text-sm text-muted">{p.summary}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          <p className="text-sm text-muted">
            Running the server, integrations and screenshots of every guide are on the <a className="underline" href={SITE} target="_blank" rel="noopener">documentation website</a>.
          </p>
        </div>
      )}
    </div>
  )
}
