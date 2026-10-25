import { SettingsPendingGate } from './settingsPending'
import { PersonAvatar } from './PersonAvatar'
import { Badge, Icon, type IconName, Input, PageBody, PageHeader, TruncatedText, useMediaQuery } from '../ui'
import { type FormEvent, type KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react'
import type { User } from '../lib/types'
import { LEGACY_SETTINGS_IDS, navigate, routePath, type SettingsSectionId } from './router'
import { firstSection, groupedSections, resolvePage, resolveSection, soleVisiblePage, visiblePages, type SettingsPage, type SettingsSection } from './settingsSections'
import { anchorTarget, entryRoute, openSetting, requestSettingsFocus, searchSettings, takeSettingsFocus, type SettingsHit } from './settingsIndex'
import { ConfigWarningsNotice } from './ConfigWarnings'
import { t } from '../lib/i18n'
import { cardIcon } from '../lib/settingsCopy'
import { ACCOUNT_ROLE_LABEL } from '../lib/roleNames'
import { useShortcutScope } from './shortcuts'
import { keysOf } from '../lib/shortcuts'
import { followLink } from './settingsLinks'
import { SettingsOverview } from './SettingsOverview'
import { SectionDemoNote, SettingsPageContent } from './settingsPages'

export { followLink }

/** Each page's Help screen (documentation "Help links name the same screens"); the guide's `screens` resolve them. */
const PAGE_HELP_SCREENS: Record<SettingsSectionId, string> = {
  account: 'settings/account', workspaces: 'settings/workspaces', appearance: 'settings/appearance', general: 'settings/general', language: 'settings/language',
  notifications: 'settings/notifications', capture: 'settings/capture', about: 'settings/about', integrations: 'settings/integrations', data: 'settings/data',
  people: 'settings/people', server: 'settings/server',
}

/** From here the section list is the left column and a section is open beside it (settings-navigation "Settings overview"). */
export const SETTINGS_TWO_COLUMN_QUERY = '(min-width: 64rem)'

/** How long a setting opened from search or a link stays highlighted (settings-subpages D3). */
export const HIGHLIGHT_MS = 1600

/** Scrolls to the element, focuses it and tints it briefly, so the eye finds the setting that was asked for. */
function revealSetting(el: HTMLElement): void {
  el.scrollIntoView({ block: 'start' })
  if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1')
  el.focus({ preventScroll: true })
  // A card heading tints its card; a row or a wrapper tints itself.
  const target = el.closest<HTMLElement>('[data-settings-card]') && /^H[23]$/.test(el.tagName) ? el.closest<HTMLElement>('[data-settings-card]')! : el
  target.setAttribute('data-settings-highlight', 'on')
  setTimeout(() => target.setAttribute('data-settings-highlight', 'off'), HIGHLIGHT_MS)
  setTimeout(() => target.removeAttribute('data-settings-highlight'), HIGHLIGHT_MS + 400)
}

/**
 * Runs `fn` once the page's cards are revealed (settingsPending): an element under
 * a settling gate is invisible and cannot take focus yet. Returns the cleanup.
 */
function whenSettled(el: HTMLElement, fn: () => void): () => void {
  let frame = 0
  const started = Date.now()
  const tick = () => {
    if (!el.closest('[data-settings-settling]') || Date.now() - started > 2000) fn()
    else frame = requestAnimationFrame(tick)
  }
  tick()
  return () => cancelAnimationFrame(frame)
}

// The sub-page a person left by going back to its overview, whose row then takes focus.
let leftPage: { section: string; page: string } | null = null

/**
 * Settings (OpenSpec change ux-overhaul, settings-navigation, design D6; settings-subpages):
 * one layout. The section list (profile card, search, groups, footer) is the left
 * column from 1024 px and the whole screen below it; `/settings/<id>` opens a
 * section as a page, and a section with sub-pages opens its overview, whose rows
 * open `/settings/<id>/<page>`. Below 1024 px each level is its own page with a back
 * action to the level above. Legacy ids and anchors open the page that now holds
 * their content, and an unknown or hidden id opens the first visible section (or the
 * section's overview), all replacing the address.
 */
export function SettingsView({ user, onLogout, section, page: pageId, anchor }: { user: User; onLogout: () => void; section?: SettingsSectionId; page?: string; anchor?: string }) {
  const current = resolveSection(user, section)
  const twoColumn = useMediaQuery(SETTINGS_TWO_COLUMN_QUERY)
  const first = firstSection(user)
  const parts = typeof location !== 'undefined' ? location.pathname.split('/') : []
  const requested = parts[2]
  const requestedPage = parts[3]
  const hash = typeof location !== 'undefined' ? decodeURIComponent(location.hash.slice(1)) : ''
  // The page shown: the section, or the first one when the list alone would be empty beside it.
  const shown: SettingsSection | null = current ?? ((twoColumn || (requested && requested !== 'import')) ? first : null)
  const sub: SettingsPage | null = shown && current ? resolvePage(user, shown, pageId) : null
  const sole = shown ? soleVisiblePage(user, shown) : null
  const hasOverview = !!shown && visiblePages(user, shown).length > 0

  const headingRef = useRef<HTMLHeadingElement>(null)
  const pageRef = useRef<HTMLDivElement>(null)
  const shownId = shown?.id
  const subId = sub?.id
  // Focus follows navigation: the setting a link or the search asked for, the row of the
  // sub-page just left (back to its overview), else the page heading.
  useEffect(() => {
    const target = anchor ?? takeSettingsFocus() ?? (hash || null)
    const el = target ? document.getElementById(target) : null
    const back = !subId && shownId && leftPage?.section === shownId
      ? document.querySelector<HTMLElement>(`[data-settings-subpage="${leftPage.page}"]`) : null
    leftPage = subId && shownId ? { section: shownId, page: subId } : null
    if (el) return whenSettled(el, () => revealSetting(el))
    if (back) return whenSettled(back, () => back.focus())
    // The page title: the header's h1, or the shell's phone bar below 768 px, else the page.
    const heading = headingRef.current ?? document.querySelector<HTMLElement>('[data-phone-title]') ?? pageRef.current
    if (heading && !heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1')
    heading?.focus({ preventScroll: true })
    // The hash only matters on the first render of an address.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shownId, subId, anchor])

  // Address repair, in place so Back leaves Settings (settings-navigation "Legacy settings addresses").
  // After the focus effect, so a setting it asks the next page to focus is not taken here.
  useEffect(() => {
    if (!requested || requested === 'import') {
      if (twoColumn && !section) navigate({ view: 'settings', section: first.id }, { replace: true })
      return
    }
    if (!current) { navigate({ view: 'settings', section: first.id }, { replace: true }); return }
    // An anchor of an earlier layout (/settings/integrations#webhooks) opens the page that holds it.
    const moved = hash && !pageId ? anchorTarget(user, current.id, hash) : null
    if (moved && (moved.section !== current.id || moved.page)) {
      if (moved.anchor) requestSettingsFocus(moved.anchor)
      navigate({ view: 'settings', section: moved.section, ...(moved.page ? { page: moved.page } : {}) }, { replace: true })
      return
    }
    const canonical = { view: 'settings' as const, section: current.id, ...(sub ? { page: sub.id } : {}) }
    if (requested in LEGACY_SETTINGS_IDS || (requestedPage && !sub)) navigate(canonical, { replace: true })
  }, [requested, requestedPage, section, pageId, current, sub, twoColumn, first.id, hash, user])

  if (!shown) {
    return (
      <PageBody width="form" className="space-y-6" data-settings-overview>
        <PageHeader title={t('Settings')} titleRef={headingRef} titleTabIndex={-1} help="settings" sticky={false} />
        <SettingsList user={user} />
      </PageBody>
    )
  }
  const title = sub?.label ?? shown.label
  const toSection = { view: 'settings' as const, section: shown.id }
  // precision-settings D1–D3: from 1024 px the header is a breadcrumb across the surface,
  // the navigation pane sits under it on a hairline, and the page opens with its title
  // and lead line; below 1024 px the header carries Back and each level is its own page.
  const crumb = twoColumn && (
    <span className="flex min-w-0 shrink items-center gap-1 text-h3 font-normal text-muted" data-settings-crumb>
      <a href={routePath({ view: 'settings' })} className="shrink-0 rounded-control hover:text-default focus-visible:outline-2 focus-visible:outline-focus"
        onClick={(e) => followLink(e, { view: 'settings', section: first.id })}>{t('Settings')}</a>
      <Icon name="chevron-right" size="xs" />
      {sub && (
        <>
          <a href={routePath(toSection)} className="truncate rounded-control hover:text-default focus-visible:outline-2 focus-visible:outline-focus"
            onClick={(e) => followLink(e, toSection)} data-settings-crumb-section>{shown.label}</a>
          <Icon name="chevron-right" size="xs" />
        </>
      )}
    </span>
  )
  const back = sub
    ? { label: shown.label, href: routePath(toSection), onClick: () => navigate(toSection) }
    : { label: t('Settings'), href: routePath({ view: 'settings' }), onClick: () => navigate({ view: 'settings' }), hideFrom: 'lg' as const }
  const wide = shown.id === 'workspaces'
  return (
    <div ref={pageRef} className="outline-none" data-settings-section={shown.id} data-settings-page={sub?.id}>
      <div className="px-4 md:px-8">
        <PageHeader title={title} leading={crumb} titleRef={headingRef} titleTabIndex={-1} help={sub?.help ?? PAGE_HELP_SCREENS[shown.id]} sticky={false}
          back={twoColumn && sub ? undefined : back} />
      </div>
      <div className="lg:-mt-2 lg:grid lg:grid-cols-[14.25rem_minmax(0,1fr)]">
        {twoColumn && (
          <aside className="hidden border-r border-soft lg:sticky lg:top-0 lg:block lg:max-h-[calc(100dvh-4.5rem)] lg:min-h-[calc(100dvh-4.5rem)] lg:self-start lg:overflow-y-auto lg:px-3 lg:py-3" aria-label={t('Settings')} data-settings-pane>
            <SettingsList user={user} current={shown.id} inPage={!!sub} compact />
          </aside>
        )}
        {/* workspaces-settings-v2 D2: the Workspaces page's two panes need 56 rem; every other section keeps 45 (precision-settings D3). */}
        <div className={`min-w-0 space-y-8 px-4 pt-4 pb-10 md:px-8 lg:px-16 lg:pt-10 ${wide ? 'lg:max-w-[64rem]' : 'lg:max-w-[53rem]'}`} data-settings-width={wide ? 'wide' : 'form'}>
          {twoColumn && (
            <div aria-hidden="true" data-settings-page-head>
              <p className="text-h1 text-strong">{title}</p>
              {!sub && <p className="mt-2 max-w-[72ch] text-body text-muted">{shown.description(user)}</p>}
            </div>
          )}
          <SettingsPendingGate key={`${shown.id}/${sub?.id ?? ''}`}>
            {hasOverview && !sub
              ? <SettingsOverviewPage section={shown} user={user} />
              : <SettingsPageContent section={shown} page={sub} sole={sole} user={user} onLogout={onLogout} />}
          </SettingsPendingGate>
        </div>
      </div>
    </div>
  )
}

/** A section's overview with the demo note when the demo refuses something on its pages. */
function SettingsOverviewPage({ section, user }: { section: SettingsSection; user: User }) {
  return (
    <>
      <SectionDemoNote section={section} user={user} />
      <SettingsOverview section={section} user={user} />
    </>
  )
}

/**
 * The section list (settings-navigation "Settings overview"): profile card, search,
 * the groups as labelled lists, the free-software footer. `compact` is the column
 * beside a section page.
 */
export function SettingsList({ user, current, inPage = false, compact = false }: { user: User; current?: SettingsSectionId; inPage?: boolean; compact?: boolean }) {
  return (
    <div className={compact ? 'space-y-4' : 'space-y-6'} data-settings-list>
      {/* The pane beside a page (precision-settings D2) keeps only search and the groups. */}
      {!compact && <ProfileCard user={user} />}
      <SettingsSearch user={user} compact={compact} />
      {!compact && <ConfigWarningsNotice user={user} />}
      <nav aria-label={t('Settings sections')} className={compact ? 'space-y-4' : 'space-y-6'}>
        {groupedSections(user).map(({ group, sections }) => (
          <section key={group.id} aria-labelledby={`group-${group.id}`}>
            <h2 id={`group-${group.id}`} className={compact ? 'px-2 pb-1 text-hint text-faint' : 'mb-2 px-1 text-hint font-semibold uppercase tracking-wide text-faint'}>{group.label}</h2>
            <ul className={compact ? 'space-y-0.5' : 'divide-y divide-(--ot-border) overflow-hidden rounded-card border border-default bg-surface shadow-1'}>{/* surface-lint-allow: the section list, not a section */}
              {sections.map((s) => {
                const on = s.id === current
                return (
                  <li key={s.id}>
                    <a href={routePath({ view: 'settings', section: s.id })} data-settings-link={s.id} aria-current={on ? (inPage ? 'true' : 'page') : undefined}
                      className={compact
                        ? `touch-target flex min-h-[1.875rem] items-center gap-2.5 rounded-control px-2 text-body focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus ${on ? 'bg-selected font-medium text-strong' : 'text-default hover:bg-hover'}`
                        : 'flex min-h-14 items-center gap-3 px-4 py-3 hover:bg-sunken focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus dark:hover:bg-raised'}
                      onClick={(e) => followLink(e, { view: 'settings', section: s.id })}>
                      {compact
                        ? <span className={on ? 'text-strong' : 'text-muted'}><Icon name={s.icon} /></span>
                        : <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control bg-accent-soft text-on-accent-soft"><Icon name={s.icon} size="md" /></span>}
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium">{s.label}</span>
                        {!compact && <span className="block text-meta text-muted">{s.description(user)}</span>}
                      </span>
                      {!compact && <span className="text-faint"><Icon name="chevron-right" /></span>}
                    </a>
                  </li>
                )
              })}
            </ul>
          </section>
        ))}
      </nav>
      {!compact && (
        <p className="text-meta text-faint">
          {t('OpenTodo is free software (AGPL-3.0). No telemetry, no tracking, no subscription.')}<a className="ml-1 underline" href="https://github.com/pixari/opentodo" target="_blank" rel="noreferrer">{t('Source code')}</a>
        </p>
      )}
    </div>
  )
}

/** The search field (settings-navigation "Settings search"): rows under their section, Enter opens the first. */
function SettingsSearch({ user, compact = false }: { user: User; compact?: boolean }) {
  const [query, setQuery] = useState('')
  const hits = useMemo(() => searchSettings(query, user), [query, user])
  const listRef = useRef<HTMLUListElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  // `/` focuses the field from anywhere on a Settings page (precision-settings D2).
  useShortcutScope('view', { 'settings.search': () => inputRef.current?.focus() }, { view: 'settings' })
  const slash = keysOf('settings.search')
  const open = (section: SettingsSectionId, entry?: { page?: string; anchor: string }) => {
    setQuery('')
    openSetting(user, { section, page: entry?.page, anchor: entry?.anchor })
  }
  const first = hits[0]
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!first) return
    open(first.section.id, first.entries[0])
  }
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' && hits.length) { e.preventDefault(); listRef.current?.querySelector<HTMLElement>('a')?.focus() }
    if (e.key === 'Escape' && query) { e.preventDefault(); setQuery('') }
  }
  return (
    <form role="search" onSubmit={submit} className="space-y-2" data-settings-search>
      <div className="relative">
        <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-faint"><Icon name="search" size="sm" /></span>
        <Input ref={inputRef} type="search" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={onKey}
          placeholder={t('Search settings')} aria-label={t('Search settings')} autoComplete="off" aria-keyshortcuts={slash}
          className={compact ? 'min-h-8 py-1 pr-8 pl-8 text-body' : 'pl-8'} />
        {!query && slash && <kbd aria-hidden="true" className="ui-kbd pointer-events-none absolute top-1/2 right-2 -translate-y-1/2">{slash}</kbd>}
      </div>
      {query.trim() && (
        <ul ref={listRef} className="rounded-card border border-default bg-surface p-1 shadow-1" aria-label={t('Matching settings')} data-settings-results>{/* surface-lint-allow: search results, not a section */}
          {hits.length === 0 && <li className="px-2 py-2 text-meta text-muted">{t('No setting matches “{trim}”.', { trim: query.trim() })}</li>}
          {hits.map((h: SettingsHit) => (
            <li key={h.section.id}>
              <ResultLink section={h.section} onOpen={() => open(h.section.id)} />
              {h.entries.map((en) => (
                <a key={en.anchor + en.label} href={routePath(entryRoute(user, en))} data-settings-result={`${h.section.id}:${en.anchor}`}
                  className="flex min-h-9 items-center gap-2 rounded-control px-2 py-1 pl-7 text-body hover:bg-sunken focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus dark:hover:bg-raised"
                  onClick={(e) => { if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; e.preventDefault(); open(h.section.id, en) }}>
                  {cardIcon(en.anchor) ? <Icon name={cardIcon(en.anchor) as IconName} size="xs" className="-ml-5 text-muted" /> : null}
                  <span className="min-w-0 flex-1 truncate">{en.label}</span>
                  <span className="truncate text-meta text-muted">{en.description}</span>
                </a>
              ))}
            </li>
          ))}
        </ul>
      )}
    </form>
  )
}

function ResultLink({ section, onOpen }: { section: SettingsSection; onOpen: () => void }) {
  return (
    <a href={routePath({ view: 'settings', section: section.id })} data-settings-result={section.id}
      className="flex min-h-9 items-center gap-2 rounded-control px-2 py-1 text-body font-medium hover:bg-sunken focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus dark:hover:bg-raised"
      onClick={(e) => { if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; e.preventDefault(); onOpen() }}>
      <span className="text-muted"><Icon name={section.icon} /></span>{section.label}
    </a>
  )
}


/** Who is signed in: avatar initials, name, email and role (the list and Account). */
export function ProfileCard({ user, compact = false }: { user: User; compact?: boolean }) {
  return (
    <div id="profile" className={`flex flex-wrap items-center gap-3 rounded-card border border-default bg-surface ${compact ? 'p-3' : 'gap-4 p-4'} shadow-1`} data-profile-card>{/* surface-lint-allow: the profile card above the list */}
      <PersonAvatar id={user.id} name={user.name || user.email} size={compact ? 'md' : 'lg'} />
      {/* The role wraps under the card when the name needs the width (a phone with a large
          text size, precision-polish-2), so the name is not cut to a letter. */}
      <div className="min-w-0 flex-[1_1_8rem]">
        <p className="user-text truncate text-body font-semibold text-default">{user.name || user.email}</p>
        <TruncatedText as="p" className="user-text text-meta text-muted" text={user.email} />
      </div>
      <Badge hue={user.role === 'owner' ? 'green' : user.role === 'admin' ? 'indigo' : 'slate'}>{ACCOUNT_ROLE_LABEL[user.role]}</Badge>
    </div>
  )
}
