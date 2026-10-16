import { Avatar, Badge, Icon, Input, Notice, PageBody, PageHeader, useMediaQuery } from '../ui'
import { DateTimeSection } from './DateTimeSettings'
import { lazy, type FormEvent, type KeyboardEvent, type MouseEvent, type ReactNode, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import type { User } from '../lib/types'
import { AssistantsPanel } from './AssistantsPanel'
import { AppearanceSection, SidebarSection } from './AppearanceSection'
import { BackupsPanel } from './BackupsPanel'
import { QuickAddSettingsSection } from './QuickAddSettings'
import { VoiceSettingsSection } from './VoiceSettings'
import { CalendarSettingsSection } from './CalendarSettings'
import { PasswordSection } from './PasswordSection'
import { AdministrationSections } from './UsersPanel'
import { NotificationsSettings } from './NotificationsSettings'
import { ActivityPanel } from './ActivityPanel'
import { AuditPanel } from './AuditPanel'
import { SecurityPanel } from './SecurityPanel'
import { LinkedAccountsPanel, SsoPanel } from './SsoPanel'
import { ProjectInvitePolicyPanel } from './ProjectInvitePolicyPanel'
import { MfaPolicyPanel, TwoFactorPanel } from './TwoFactorPanel'
import { EncryptionPanel } from './EncryptionPanel'
import { LEGACY_SETTINGS_IDS, navigate, routePath, type Route, type SettingsSectionId } from './router'
import { firstSection, groupedSections, joinList, resolveSection, type SettingsSection } from './settingsSections'
import { requestSettingsFocus, searchSettings, takeSettingsFocus, type SettingsHit } from './settingsIndex'
import { TokensSection } from './TokensSection'
import { WebhooksPanel } from './WebhooksPanel'
import { CaldavPanel } from './CaldavPanel'
import { CalendarFeedsPanel } from './CalendarFeedsPanel'
import { ConfigWarningsNotice } from './ConfigWarnings'
import { EmailInboxPanel } from './EmailInboxPanel'
import { KeyboardSection, StartViewSection } from './PreferencesPanels'
import { AutoArchiveSection } from './ProjectsSettings'
import { CaptureSection } from './CaptureSettings'
import { AttachmentSettingsPanel } from './AttachmentSettingsPanel'
import { OutgoingEmailPanel } from './OutgoingEmailPanel'
import { YourDataSection } from './DataSettings'
import { SessionPanel } from './AccountSettings'
import { DEMO_RESTRICTED_NOTE, useDemo } from '../lib/demo'
import { useHosted } from '../lib/hosted'
import { ServerArchivePanel } from './ServerArchivePanel'

// Settings → Integrations → Assistant (in-app-assistant): part of the lazy assistant code.
const AssistantSettingsSection = lazy(() => import('./assistant/AssistantSettings'))

/** Each page's Help screen (documentation "Help links name the same screens"); the guide's `screens` resolve them. */
const PAGE_HELP_SCREENS: Record<SettingsSectionId, string> = {
  account: 'settings/account', appearance: 'settings/appearance', general: 'settings/general', notifications: 'settings/notifications',
  capture: 'settings/capture', integrations: 'settings/integrations', data: 'settings/data', people: 'settings/people', server: 'settings/server',
}

/** From here the section list is the left column and a section is open beside it (settings-navigation "Settings overview"). */
export const SETTINGS_TWO_COLUMN_QUERY = '(min-width: 1024px)'

/** Follows an in-app link without a reload; modified clicks (new tab, new window) keep the browser's behaviour. */
export function followLink(e: Pick<MouseEvent<HTMLAnchorElement>, 'button' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey' | 'preventDefault'>, r: Route) {
  if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
  e.preventDefault()
  navigate(r)
}

/**
 * Settings (OpenSpec change ux-overhaul, settings-navigation, design D6): one
 * layout. The section list (profile card, search, groups, footer) is the left
 * column from 1024 px and the whole screen below it; `/settings/<id>` opens a
 * section as a page, with a back action to the list on narrow screens. Legacy
 * ids open their section at the anchor of the moved content, and an unknown or
 * hidden id opens the first visible section, both replacing the address.
 */
export function SettingsView({ user, onLogout, section, anchor }: { user: User; onLogout: () => void; section?: SettingsSectionId; anchor?: string }) {
  const current = resolveSection(user, section)
  const twoColumn = useMediaQuery(SETTINGS_TWO_COLUMN_QUERY)
  const first = firstSection(user)
  const requested = typeof location !== 'undefined' ? location.pathname.split('/')[2] : undefined
  // The page shown: the section, or the first one when the list alone would be empty beside it.
  const page: SettingsSection | null = current ?? ((twoColumn || (requested && requested !== 'import')) ? first : null)

  // Address repair, in place so Back leaves Settings (settings-navigation "Legacy settings addresses").
  useEffect(() => {
    if (!requested || requested === 'import') {
      if (twoColumn && !section) navigate({ view: 'settings', section: first.id }, { replace: true })
      return
    }
    if (!current) navigate({ view: 'settings', section: first.id }, { replace: true })
    else if (requested in LEGACY_SETTINGS_IDS) navigate({ view: 'settings', section: current.id }, { replace: true })
  }, [requested, section, current, twoColumn, first.id])

  const headingRef = useRef<HTMLHeadingElement>(null)
  const pageRef = useRef<HTMLDivElement>(null)
  // Focus follows navigation: the row or card a link or the search asked for, else the page heading.
  useEffect(() => {
    const target = anchor ?? takeSettingsFocus()
    const el = target ? document.getElementById(target) : null
    if (el) {
      el.scrollIntoView({ block: 'start' })
      if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1')
      el.focus({ preventScroll: true })
    } else {
      // The page title: the header's h1, or the shell's phone bar below 768 px, else the page.
      const heading = headingRef.current ?? document.querySelector<HTMLElement>('[data-phone-title]') ?? pageRef.current
      if (heading && !heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1')
      heading?.focus({ preventScroll: true })
    }
  }, [page?.id, anchor])

  if (!page) {
    return (
      <PageBody width="form" className="space-y-6" data-settings-overview>
        <PageHeader title="Settings" titleRef={headingRef} titleTabIndex={-1} help="settings" sticky={false} />
        <SettingsList user={user} />
      </PageBody>
    )
  }
  return (
    <div ref={pageRef} className="mx-auto max-w-6xl px-4 py-6 outline-none md:px-8 lg:grid lg:grid-cols-[18rem_minmax(0,1fr)] lg:gap-10" data-settings-section={page.id}>
      {twoColumn && (
        <aside className="hidden lg:sticky lg:top-6 lg:block lg:max-h-[calc(100dvh-3rem)] lg:self-start lg:overflow-y-auto lg:pr-1" aria-label="Settings">
          <SettingsList user={user} current={page.id} compact />
        </aside>
      )}
      <div className="min-w-0 space-y-6 lg:max-w-2xl">
        <PageHeader title={page.label} titleRef={headingRef} titleTabIndex={-1} help={PAGE_HELP_SCREENS[page.id]} sticky={false}
          back={{ label: 'Settings', href: routePath({ view: 'settings' }), onClick: () => navigate({ view: 'settings' }), hideFrom: 'lg' }} />
        <SectionContent section={page} user={user} onLogout={onLogout} />
      </div>
    </div>
  )
}

/**
 * The section list (settings-navigation "Settings overview"): profile card, search,
 * the groups as labelled lists, the free-software footer. `compact` is the column
 * beside a section page.
 */
export function SettingsList({ user, current, compact = false }: { user: User; current?: SettingsSectionId; compact?: boolean }) {
  return (
    <div className={compact ? 'space-y-4' : 'space-y-6'} data-settings-list>
      <ProfileCard user={user} compact={compact} />
      <SettingsSearch user={user} />
      {!compact && <ConfigWarningsNotice user={user} />}
      <nav aria-label="Settings sections" className={compact ? 'space-y-4' : 'space-y-6'}>
        {groupedSections(user).map(({ group, sections }) => (
          <section key={group.id} aria-labelledby={`group-${group.id}`}>
            <h2 id={`group-${group.id}`} className={`${compact ? 'px-2.5 pb-1' : 'mb-2 px-1'} text-hint font-semibold uppercase tracking-wide text-faint`}>{group.label}</h2>
            <ul className={compact ? 'space-y-0.5' : 'divide-y divide-(--ot-border) overflow-hidden rounded-card border border-default bg-surface shadow-1'}>
              {sections.map((s) => {
                const on = s.id === current
                return (
                  <li key={s.id}>
                    <a href={routePath({ view: 'settings', section: s.id })} data-settings-link={s.id} aria-current={on ? 'page' : undefined}
                      className={compact
                        ? `touch-target flex items-center gap-2.5 rounded-control px-2.5 py-1.5 text-body ${on ? 'bg-accent-soft font-medium text-on-accent-soft' : 'text-default hover:bg-sunken dark:hover:bg-raised'}`
                        : 'flex min-h-14 items-center gap-3 px-4 py-3 hover:bg-sunken focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus dark:hover:bg-raised'}
                      onClick={(e) => followLink(e, { view: 'settings', section: s.id })}>
                      {compact
                        ? <span className={on ? '' : 'text-muted'}><Icon name={s.icon} /></span>
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
      <p className={`text-meta text-faint ${compact ? 'px-2.5' : ''}`}>
        OpenTodo is free software (AGPL-3.0). No telemetry, no tracking, no subscription.
        <a className="ml-1 underline" href="https://github.com/pixari/opentodo" target="_blank" rel="noreferrer">Source code</a>
      </p>
    </div>
  )
}

/** The search field (settings-navigation "Settings search"): rows under their section, Enter opens the first. */
function SettingsSearch({ user }: { user: User }) {
  const [query, setQuery] = useState('')
  const hits = useMemo(() => searchSettings(query, user), [query, user])
  const listRef = useRef<HTMLUListElement>(null)
  const open = (section: SettingsSectionId, anchor?: string) => {
    if (anchor) requestSettingsFocus(anchor)
    setQuery('')
    navigate({ view: 'settings', section })
  }
  const first = hits[0]
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!first) return
    open(first.section.id, first.entries[0]?.anchor)
  }
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' && hits.length) { e.preventDefault(); listRef.current?.querySelector<HTMLElement>('a')?.focus() }
    if (e.key === 'Escape' && query) { e.preventDefault(); setQuery('') }
  }
  return (
    <form role="search" onSubmit={submit} className="space-y-2" data-settings-search>
      <Input type="search" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={onKey}
        placeholder="Search settings" aria-label="Search settings" autoComplete="off" />
      {query.trim() && (
        <ul ref={listRef} className="rounded-card border border-default bg-surface p-1 shadow-1" aria-label="Matching settings" data-settings-results>
          {hits.length === 0 && <li className="px-2 py-2 text-meta text-muted">No setting matches “{query.trim()}”.</li>}
          {hits.map((h: SettingsHit) => (
            <li key={h.section.id}>
              <ResultLink section={h.section} onOpen={() => open(h.section.id)} />
              {h.entries.map((en) => (
                <a key={en.anchor + en.label} href={routePath({ view: 'settings', section: h.section.id })} data-settings-result={`${h.section.id}:${en.anchor}`}
                  className="flex min-h-9 items-center gap-2 rounded-control px-2 py-1 pl-7 text-body hover:bg-sunken focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus dark:hover:bg-raised"
                  onClick={(e) => { if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; e.preventDefault(); open(h.section.id, en.anchor) }}>
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

const ROLE_LABEL: Record<User['role'], string> = { owner: 'Owner', admin: 'Admin', member: 'Member' }

/** Who is signed in: avatar initials, name, email and role (the list and Account). */
export function ProfileCard({ user, compact = false }: { user: User; compact?: boolean }) {
  return (
    <div id="profile" className={`flex items-center gap-3 rounded-card border border-default bg-surface ${compact ? 'p-3' : 'gap-4 p-4'} shadow-1`} data-profile-card>
      <Avatar id={user.id} name={user.name || user.email} size={compact ? 'md' : 'lg'} />
      <div className="min-w-0 flex-1">
        <p className="user-text truncate text-body font-semibold text-default">{user.name || user.email}</p>
        <p className="user-text truncate text-meta text-muted">{user.email}</p>
      </div>
      <Badge hue={user.role === 'owner' ? 'green' : user.role === 'admin' ? 'indigo' : 'slate'}>{ROLE_LABEL[user.role]}</Badge>
    </div>
  )
}

/** The cards of one section; on a demo instance the refused ones are disabled under one note. */
function SectionContent({ section, user, onLogout }: { section: SettingsSection; user: User; onLogout: () => void }) {
  const demo = !!useDemo()
  // A hosted service's operator owns the server-level settings (multi-tenant-host D4).
  const hosted = useHosted()
  const isOwner = user.role === 'owner'
  const ownsServer = isOwner && !hosted
  const refused = demo ? (section.demo?.(user) ?? []) : []
  const note = refused.length > 0 ? <DemoRestrictedNote features={refused} /> : null
  switch (section.id) {
    case 'account':
      return (
        <>
          {note}
          <ProfileCard user={user} />
          <SessionPanel onLogout={onLogout} />
          <Anchor id="security">
            <DemoDisabled on={demo}>
              <PasswordSection />
              <TwoFactorPanel user={user} />
              <SecurityPanel />
              <LinkedAccountsPanel />
            </DemoDisabled>
          </Anchor>
          <Anchor id="encryption"><DemoDisabled on={demo}><EncryptionPanel /></DemoDisabled></Anchor>
          <Anchor id="sessions"><ActivityPanel /></Anchor>
        </>
      )
    case 'appearance':
      return (
        <>
          <AppearanceSection />
          <SidebarSection />
        </>
      )
    case 'general':
      return (
        <>
          <StartViewSection />
          <DateTimeSection />
          <CalendarSettingsSection />
          <KeyboardSection />
        </>
      )
    case 'notifications':
      return <>{note}<DemoDisabled on={demo}><NotificationsSettings /></DemoDisabled></>
    case 'capture':
      return (
        <>
          {note}
          <QuickAddSettingsSection />
          <VoiceSettingsSection />
          <CaptureSection />
          <DemoDisabled on={demo}><EmailInboxPanel /></DemoDisabled>
        </>
      )
    case 'integrations':
      // TokensSection loads its list whenever this section mounts, so a token
      // created under AI assistants is listed here without shared state.
      return (
        <>
          {note}
          <DemoDisabled on={demo}>
            <CaldavPanel isOwner={isOwner} email={user.email} />
            <CalendarFeedsPanel isOwner={isOwner} />
            <WebhooksPanel isOwner={ownsServer} />
            <TokensSection />
          </DemoDisabled>
          <Anchor id="ai">
            <DemoDisabled on={demo}>
              <Suspense fallback={null}><AssistantSettingsSection isOwner={ownsServer} /></Suspense>
              <AssistantsPanel isOwner={ownsServer} />
            </DemoDisabled>
          </Anchor>
        </>
      )
    case 'data':
      return (
        <>
          <YourDataSection demo={demo} isOwner={isOwner} />
          <Anchor id="projects"><AutoArchiveSection /></Anchor>
        </>
      )
    case 'people':
      return (
        <>
          {note}
          <ConfigWarningsNotice user={user} />
          <DemoDisabled on={demo}><AdministrationSections user={user} /></DemoDisabled>
          {isOwner && (
            <Anchor id="access-policies">
              <DemoDisabled on={demo}>
                <MfaPolicyPanel />
                {!hosted && <SsoPanel />}
                <ProjectInvitePolicyPanel />
              </DemoDisabled>
            </Anchor>
          )}
        </>
      )
    case 'server':
      return (
        <>
          {note}
          {hosted ? (
            // Hosted: backups, attachment limits and outgoing email are the operator's; the owner can take the data away.
            <ServerArchivePanel />
          ) : (
            <>
              <DemoDisabled on={demo}><BackupsPanel /></DemoDisabled>
              <AttachmentSettingsPanel />
              {/* Outgoing email (outgoing-email change): the owner's SMTP settings; a demo instance never builds the mailer. */}
              <DemoDisabled on={demo}><OutgoingEmailPanel /></DemoDisabled>
            </>
          )}
          <Anchor id="audit-log"><AuditPanel /></Anchor>
        </>
      )
  }
}

/** A focusable landmark for a legacy address or a search result inside a page. */
function Anchor({ id, children }: { id: string; children: ReactNode }) {
  return <div id={id} tabIndex={-1} className="space-y-6 outline-none" data-settings-anchor={id}>{children}</div>
}

/** On a demo instance, the refused cards stay visible with their controls disabled (settings-navigation "Demo instance sections"). */
function DemoDisabled({ on, children }: { on: boolean; children: ReactNode }) {
  if (!on) return <>{children}</>
  return <fieldset disabled className="m-0 min-w-0 space-y-6 border-0 p-0" data-demo-disabled>{children}</fieldset>
}

/** Features a demo instance refuses (OpenSpec `demo-mode`); each section names its own (settingsSections.ts). */
export const DEMO_RESTRICTED_FEATURES = [
  'password and two-factor authentication', 'passkeys', 'end-to-end encryption', 'push notifications', 'linked accounts',
  'users and invitations', 'single sign-on', 'calendar apps (CalDAV)', 'calendar feeds', 'webhooks', 'email to task', 'backups',
  'outgoing email', 'the assistant', 'AI assistants (MCP)', 'API tokens', 'import', 'sharing changes',
]

/** The demo note once at the top of a page, naming the rows whose controls are disabled. */
function DemoRestrictedNote({ features }: { features: string[] }) {
  const many = features.length > 1
  return (
    <div data-testid="demo-restricted">
      <Notice tone="info">
        <span className="font-medium">Demo instance.</span> Here, {joinList(features)} {many ? 'are' : 'is'} {DEMO_RESTRICTED_NOTE.toLowerCase().replace(/\.$/, '')}; the rows are shown with their controls disabled.
        This sandbox is private to you and is deleted after 2 hours of inactivity, and every night. Run your own server to use {many ? 'them' : 'it'}; it takes one container.
      </Notice>
    </div>
  )
}
