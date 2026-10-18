import { Icon, type IconName, PageBody, PageHeader } from '../../ui'
import { EnglishGuideNote } from './EnglishGuideNote'
import { Skeleton } from '../../ui'
import { useEffect, useMemo, useRef, useState } from 'react'
import { findTopic, helpSections, loadHelp, searchHelp, type HelpBundle } from '../../lib/help'
import type { SearchEntry } from '../../../scripts/docs/search-core.mjs'
import { navigate } from '../router'
import { HelpContent } from './HelpContent'
import { t, msg, translatedList } from '../../lib/i18n'

const SITE = 'https://open-todo.app/docs/'

/**
 * The task-shaped entries of the Help landing (documentation "Help inside the app"):
 * what people come to do, before the full guide list. Each opens a guide at a section.
 */
type HelpTask = { label: string; icon: IconName; page: string; anchor?: string }
export const HELP_TASKS: readonly HelpTask[] = translatedList<HelpTask, 'label'>([
  { label: msg('Add a task with a date'), icon: 'calendar-days', page: 'quick-add' },
  { label: msg('Repeat a task'), icon: 'repeat', page: 'recurring-and-reminders' },
  { label: msg('Share a project'), icon: 'users', page: 'sharing', anchor: 'share-a-project' },
  { label: msg('Sync a calendar'), icon: 'calendar-range', page: 'caldav' },
  { label: msg('Import from another app'), icon: 'download', page: 'import-export', anchor: 'import-from-another-app' },
  { label: msg('Install the app'), icon: 'house', page: 'install-app' },
  { label: msg('Use the keyboard'), icon: 'list', page: 'keyboard' },
  { label: msg('Run your own server'), icon: 'globe', page: 'self-hosting/docker' },
  { label: msg('Learn Open Loops'), icon: 'rotate-ccw', page: 'method/overview' },
], 'label')

/**
 * The Help view (OpenSpec change `user-documentation`, design D5; ux-overhaul
 * "Help inside the app"): the user guide of this version, offline, with search
 * first. `/help` lists the task entries and the guides, `/help/<guide>` shows one
 * with its "On this page" list, `/help?q=` starts with a search.
 */
export function HelpView({ page: slug, q }: { page?: string; q?: string }) {
  const [data, setData] = useState<{ bundle: HelpBundle; entries: SearchEntry[] } | null>(null)
  const [failed, setFailed] = useState(false)
  const [query, setQuery] = useState(q ?? '')
  const [anchor, setAnchor] = useState<string | undefined>(() => (typeof location !== 'undefined' && location.hash ? decodeURIComponent(location.hash.slice(1)) : undefined))
  const searchRef = useRef<HTMLInputElement>(null)
  useEffect(() => { loadHelp().then(setData, () => setFailed(true)) }, [])
  useEffect(() => { setQuery(q ?? '') }, [q])
  // The landing opens on the search field.
  useEffect(() => { if (data && !slug) searchRef.current?.focus({ preventScroll: true }) }, [data, slug])
  // `:help <topic>` that names a guide opens it directly.
  useEffect(() => {
    if (!data || !q || slug) return
    const hit = findTopic(data.bundle, q)
    if (hit && (hit.slug === q.trim().toLowerCase() || hit.title.toLowerCase() === q.trim().toLowerCase())) navigate({ view: 'help', page: hit.slug }, { replace: true })
  }, [data, q, slug])

  const results = useMemo(() => (data && query.trim() ? searchHelp(data.entries, query) : []), [data, query])
  const page = data && slug ? data.bundle.pages.find((p) => p.slug === slug) : undefined
  const open = (s: string, a?: string) => { setQuery(''); setAnchor(a); navigate({ view: 'help', page: s }) }
  const back = { label: t('Help'), href: '/help', onClick: () => { setQuery(''); navigate({ view: 'help' }) } }
  const slugs = useMemo(() => new Set(data?.bundle.pages.map((p) => p.slug) ?? []), [data])

  if (failed) {
    return (
      <PageBody width="list">
        <PageHeader title={t('Help')} />
        <p className="text-body text-muted">{t('Help could not be loaded. Reload the app and try again.')}</p>
      </PageBody>
    )
  }
  if (!data) {
    return (
      <PageBody width="list">
        <PageHeader title={t('Help')} />
        <Skeleton shape="line" count={6} label={t('Loading the guide')} />
      </PageBody>
    )
  }

  const version = <span className="whitespace-nowrap">{t('OpenTodo {version} · works offline', { version: data.bundle.version })}</span>

  return (
    <PageBody width={page ? 'full' : 'list'} className={page ? 'max-w-5xl' : ''} data-help-scroll data-help-view>
      {page
        ? <PageHeader title={page.title} meta={version} back={back} />
        : <PageHeader title={t('Help')} meta={version} />}
      <EnglishGuideNote />
      <div role="search" className="relative max-w-xl">
        <label className="sr-only" htmlFor="help-search">{t('Search help')}</label>
        <input id="help-search" ref={searchRef} type="search" className="ui-input w-full" placeholder={t('Search help, e.g. board, repeat, offline')} value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { const first = document.querySelector<HTMLAnchorElement>('[data-help-result]'); if (first) { e.preventDefault(); first.focus() } }
            if (e.key === 'Enter' && results[0]) { e.preventDefault(); const [s, a] = results[0].url.split('#'); open(s, a) }
          }} />
      </div>
      <p className="sr-only" aria-live="polite">{query.trim() ? t('{n, plural, one {# result} other {# results}}', { n: results.length }) : ''}</p>
      {query.trim() ? (
        <section aria-label={t('Search results')} className="mt-4 max-w-2xl">
          {results.length === 0 && <p className="text-body text-muted">{t('No matches. Try a shorter or different word.')}</p>}
          <ul className="space-y-1">
            {results.map((r) => {
              const [s, a] = r.url.split('#')
              return (
                <li key={r.url}>
                  <a href={`/help/${s}${a ? `#${a}` : ''}`} data-help-result className="block rounded-control px-3 py-2 hover:bg-sunken focus-visible:bg-sunken dark:hover:bg-raised"
                    onClick={(e) => { e.preventDefault(); open(s, a) }}
                    onKeyDown={(e) => {
                      const links = [...document.querySelectorAll<HTMLAnchorElement>('[data-help-result]')]
                      const i = links.indexOf(e.currentTarget)
                      if (e.key === 'ArrowDown' && links[i + 1]) { e.preventDefault(); links[i + 1].focus() }
                      if (e.key === 'ArrowUp') { e.preventDefault(); (links[i - 1] ?? searchRef.current)?.focus() }
                    }}>
                    <span className="block text-body font-medium">{r.page}{r.heading ? ` › ${r.heading}` : ''}</span>
                    <span className="help-snippet block text-meta text-muted" dangerouslySetInnerHTML={{ __html: r.snippet }} />
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
            <nav aria-label={t('On this page')} className="order-first mb-6 text-body lg:order-none lg:sticky lg:top-20 lg:self-start">
              <p className="mb-1 text-hint font-semibold uppercase tracking-wide text-muted">{t('On this page')}</p>
              <ul className="space-y-0.5">
                {page.toc.map((item) => (
                  <li key={item.id}><a className="touch-target block py-1 text-muted hover:underline" href={`#${item.id}`}
                    onClick={(e) => { e.preventDefault(); setAnchor(undefined); requestAnimationFrame(() => setAnchor(item.id)) }}>{item.text}</a></li>
                ))}
              </ul>
            </nav>
          )}
        </div>
      ) : (
        <div className="mt-6 space-y-8">
          {/* What people come to do, before the guide list (documentation "Help inside the app"). */}
          <section aria-label={t('Common tasks')} data-help-tasks>
            <ul className="grid gap-2 sm:grid-cols-2">
              {HELP_TASKS.map((entry) => {
                const inApp = slugs.has(entry.page)
                const href = inApp ? `/help/${entry.page}${entry.anchor ? `#${entry.anchor}` : ''}` : `${SITE}${entry.page}/`
                return (
                  <li key={entry.label}>
                    <a href={href} data-help-task={entry.page} target={inApp ? undefined : '_blank'} rel={inApp ? undefined : 'noopener'}
                      className="flex min-h-11 items-center gap-3 rounded-card border border-default px-3 py-2 text-body hover:border-accent hover:bg-sunken dark:hover:bg-raised"
                      onClick={(e) => { if (!inApp) return; e.preventDefault(); open(entry.page, entry.anchor) }}>
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-control bg-accent-soft text-on-accent-soft"><Icon name={entry.icon} /></span>
                      <span className="min-w-0 flex-1 truncate font-medium">{entry.label}</span>
                      {!inApp && <Icon name="external-link" size="xs" className="text-faint" />}
                    </a>
                  </li>
                )
              })}
            </ul>
          </section>
          {helpSections(data.bundle).map((s) => (
            <section key={s.title} aria-labelledby={`help-sec-${s.title}`}>
              <h2 id={`help-sec-${s.title}`} className="mb-2 text-hint font-semibold uppercase tracking-wide text-muted">{s.title}</h2>
              <ul className="grid gap-2 sm:grid-cols-2">
                {s.pages.map((p) => (
                  <li key={p.slug}>
                    <a href={`/help/${p.slug}`} className="block h-full rounded-card border border-default p-3 hover:border-accent"
                      onClick={(e) => { e.preventDefault(); open(p.slug) }}>
                      <span className="block font-medium">{p.title}</span>
                      <span className="mt-0.5 block text-meta text-muted">{p.summary}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          <p className="text-body text-muted">
            {t.rich('Running the server, integrations and screenshots of every guide are on the <a>documentation website</a>.', { a: (chunks) => <a className="underline" href={SITE} target="_blank" rel="noopener">{chunks}</a> })}
          </p>
        </div>
      )}
    </PageBody>
  )
}
