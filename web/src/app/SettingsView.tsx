import { Icon } from '../ui/Icon'
import { lazy, type MouseEvent, type RefObject, Suspense, useEffect, useRef } from 'react'
import type { User } from '../lib/types'
import { AssistantsPanel } from './AssistantsPanel'
import { BackupsPanel } from './BackupsPanel'
import { QuickAddSettingsSection } from './QuickAddSettings'
import { VoiceSettingsSection } from './VoiceSettings'
import { CalendarSettingsSection } from './CalendarSettings'
import { PasswordSection } from './PasswordSection'
import { AdministrationSections } from './UsersPanel'
import { NotificationsSettings } from './NotificationsSettings'
import { SecuritySettings } from './ActivityPanel'
import { SecurityPanel } from './SecurityPanel'
import { LinkedAccountsPanel, SsoPanel } from './SsoPanel'
import { ProjectInvitePolicyPanel } from './ProjectInvitePolicyPanel'
import { MfaPolicyPanel, TwoFactorPanel } from './TwoFactorPanel'
import { EncryptionPanel } from './EncryptionPanel'
import { LEGACY_SETTINGS_IDS, navigate, routePath, type Route, type SettingsSectionId } from './router'
import { groupedSections, joinList, resolveSection, SETTINGS_SECTIONS } from './settingsSections'
import { Avatar } from '../ui/Avatar'
import { Badge } from '../ui/Card'
import { TokensSection } from './TokensSection'
import { WebhooksPanel } from './WebhooksPanel'
import { CaldavPanel } from './CaldavPanel'
import { ConfigWarningsNotice } from './ConfigWarnings'
import { EmailInboxPanel } from './EmailInboxPanel'
import { KeyboardSection, StartViewSection } from './PreferencesPanels'
import { AutoArchiveSection } from './ProjectsSettings'
import { CaptureSection } from './CaptureSettings'
import { YourDataSection } from './DataSettings'
import { SessionPanel } from './AccountSettings'
import { DEMO_RESTRICTED_NOTE, useDemo } from '../lib/demo'

// Settings → AI → Assistant (in-app-assistant): part of the lazy assistant code.
const AssistantSettingsSection = lazy(() => import('./assistant/AssistantSettings'))

/** Follows an in-app link without a reload; modified clicks (new tab, new window) keep the browser's behaviour. */
export function followLink(e: Pick<MouseEvent<HTMLAnchorElement>, 'button' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey' | 'preventDefault'>, r: Route) {
  if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
  e.preventDefault()
  navigate(r)
}

/**
 * Settings (OpenSpec `settings-navigation`): `/settings` is the overview, a list of
 * sections; `/settings/<section>` opens one. A section this user may not see (or an
 * unknown one) shows the overview.
 */
export function SettingsView({ user, onLogout, section }: { user: User; onLogout: () => void; section?: SettingsSectionId }) {
  const current = resolveSection(user, section)
  const headingRef = useRef<HTMLHeadingElement>(null)
  // Focus follows navigation, so keyboard and screen reader users land on the new page.
  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true })
  }, [current?.id])
  // An address of an earlier layout (/settings/general) becomes the new one in place,
  // so back does not return to it (settings-redesign D2).
  useEffect(() => {
    const legacy = location.pathname.split('/')[2]
    if (current && legacy && legacy in LEGACY_SETTINGS_IDS) navigate({ view: 'settings', section: current.id }, { replace: true })
  }, [current])

  if (!current) return <SettingsOverview user={user} headingRef={headingRef} />
  return (
    <div className="mx-auto max-w-5xl px-4 py-6 md:px-8 lg:flex lg:gap-8" data-settings-section={current.id}>
      <nav aria-label="Settings sections" className="hidden lg:sticky lg:top-6 lg:block lg:w-60 lg:shrink-0 lg:self-start">
        <a className="touch-target flex items-center gap-2 rounded-control px-2.5 py-1.5 text-sm text-muted hover:bg-sunken dark:hover:bg-raised" href={routePath({ view: 'settings' })}
          onClick={(e) => followLink(e, { view: 'settings' })}><Icon name="arrow-left" />All settings</a>
        {groupedSections(user).map(({ group, sections }) => (
          <div key={group.id} className="mt-4">
            <h2 id={`nav-group-${group.id}`} className="px-2.5 pb-1 text-hint font-semibold uppercase tracking-wide text-faint">{group.label}</h2>
            <ul aria-labelledby={`nav-group-${group.id}`} className="space-y-0.5">
              {sections.map((s) => {
                const on = s.id === current.id
                return (
                  <li key={s.id}>
                    <a href={routePath({ view: 'settings', section: s.id })} aria-current={on ? 'page' : undefined}
                      className={`touch-target flex items-center gap-2.5 rounded-control px-2.5 py-1.5 text-sm ${on ? 'bg-accent-soft font-medium text-on-accent-soft' : 'text-default hover:bg-sunken dark:hover:bg-raised'}`}
                      onClick={(e) => followLink(e, { view: 'settings', section: s.id })}>
                      <span className={on ? '' : 'text-muted'}><Icon name={s.icon} /></span>{s.label}
                    </a>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </nav>
      <div className="min-w-0 flex-1 space-y-6 lg:max-w-2xl">
        <div>
          <a className="btn-ghost touch-target -ml-3 text-sm lg:hidden" href={routePath({ view: 'settings' })} data-settings-back
            onClick={(e) => followLink(e, { view: 'settings' })}><Icon name="arrow-left" /> Settings</a>
          <h1 ref={headingRef} tabIndex={-1} className="text-h1 font-semibold outline-none">{current.label}</h1>
        </div>
        <SectionContent id={current.id} user={user} onLogout={onLogout} />
      </div>
    </div>
  )
}

function SettingsOverview({ user, headingRef }: { user: User; headingRef: RefObject<HTMLHeadingElement | null> }) {
  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-6 md:px-8" data-settings-overview>
      <div className="flex items-center justify-between gap-2">
        <h1 ref={headingRef} tabIndex={-1} className="text-h1 font-semibold outline-none">Settings</h1>
        <a className="btn-ghost touch-target text-sm" href="/help" onClick={(e) => followLink(e, { view: 'help' })}><Icon name="circle-help" />Help and guides</a>
      </div>
      <ProfileCard user={user} />

      <ConfigWarningsNotice user={user} />

      <nav aria-label="Settings sections" className="space-y-6">
        {groupedSections(user).map(({ group, sections }) => (
          <section key={group.id} aria-labelledby={`group-${group.id}`}>
            <h2 id={`group-${group.id}`} className="mb-2 px-1 text-meta font-semibold uppercase tracking-wide text-faint">{group.label}</h2>
            <ul className="divide-y divide-(--ot-border) overflow-hidden rounded-card border border-default bg-surface shadow-1">
              {sections.map((s) => (
                <li key={s.id}>
                  <a href={routePath({ view: 'settings', section: s.id })} data-settings-link={s.id}
                    className="flex min-h-14 items-center gap-3 px-4 py-3 hover:bg-sunken focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus dark:hover:bg-raised"
                    onClick={(e) => followLink(e, { view: 'settings', section: s.id })}>
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control bg-accent-soft text-on-accent-soft"><Icon name={s.icon} size="md" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-body font-medium text-default">{s.label}</span>
                      <span className="block text-meta text-muted">{s.description(user)}</span>
                    </span>
                    <span className="text-faint"><Icon name="chevron-right" /></span>
                  </a>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </nav>

      <p className="text-meta text-faint">
        OpenTodo is free software (AGPL-3.0). No telemetry, no tracking, no subscription.
        <a className="ml-1 underline" href="https://github.com/pixari/opentodo" target="_blank" rel="noreferrer">Source code</a>
      </p>
    </div>
  )
}

const ROLE_LABEL: Record<User['role'], string> = { owner: 'Owner', admin: 'Admin', member: 'Member' }

/** Who is signed in: avatar initials, name, email and role (overview and Account). */
export function ProfileCard({ user }: { user: User }) {
  return (
    <div className="flex items-center gap-4 rounded-card border border-default bg-surface p-4 shadow-1" data-profile-card>
      <Avatar id={user.id} name={user.name || user.email} size="lg" />
      <div className="min-w-0 flex-1">
        <p className="user-text text-body font-semibold text-default">{user.name || user.email}</p>
        <p className="user-text text-meta text-muted">{user.email}</p>
      </div>
      <Badge hue={user.role === 'owner' ? 'green' : user.role === 'admin' ? 'indigo' : 'slate'}>{ROLE_LABEL[user.role]}</Badge>
    </div>
  )
}

/** The panels of one section, unchanged from the single page, with the demo note in place of refused ones. */
function SectionContent({ id, user, onLogout }: { id: SettingsSectionId; user: User; onLogout: () => void }) {
  const demo = useDemo()
  const isOwner = user.role === 'owner'
  const section = SETTINGS_SECTIONS.find((s) => s.id === id)
  const refused = demo ? (section?.demo?.(user) ?? []) : []
  const note = refused.length > 0 ? <DemoRestrictedSection features={refused} /> : null
  if (demo && section?.demoOnly) return note
  switch (id) {
    case 'account':
      return (
        <>
          <ProfileCard user={user} />
          <SessionPanel onLogout={onLogout} />
        </>
      )
    case 'security':
      return (
        <>
          <PasswordSection />
          <TwoFactorPanel user={user} />
          <SecurityPanel />
          <LinkedAccountsPanel />
        </>
      )
    case 'encryption':
      return <EncryptionPanel />
    case 'activity':
      return <SecuritySettings user={user} />
    case 'preferences':
      return (
        <>
          <StartViewSection />
          <CalendarSettingsSection />
          <KeyboardSection />
        </>
      )
    case 'notifications':
      return <NotificationsSettings />
    case 'capture':
      return (
        <>
          <QuickAddSettingsSection />
          <VoiceSettingsSection />
          <CaptureSection />
          {note}
          {!demo && <EmailInboxPanel />}
        </>
      )
    case 'projects':
      return <AutoArchiveSection />
    case 'data':
      return <YourDataSection demo={!!demo} isOwner={isOwner} />
    case 'integrations':
      // TokensSection loads its list whenever this section mounts, so a token
      // created under AI → AI assistants is listed here without shared state.
      return (
        <>
          <CaldavPanel isOwner={isOwner} email={user.email} />
          <WebhooksPanel isOwner={isOwner} />
          <TokensSection />
        </>
      )
    case 'ai':
      return (
        <>
          <Suspense fallback={null}><AssistantSettingsSection isOwner={isOwner} /></Suspense>
          <AssistantsPanel isOwner={isOwner} />
        </>
      )
    case 'admin':
      return (
        <>
          <ConfigWarningsNotice user={user} />
          <AdministrationSections user={user} />
        </>
      )
    case 'backups':
      return <BackupsPanel />
    case 'access':
      return (
        <>
          <MfaPolicyPanel />
          <SsoPanel />
          <ProjectInvitePolicyPanel />
        </>
      )
  }
}

/** Features a demo instance refuses (OpenSpec `demo-mode`); each section names its own (settingsSections.ts). */
export const DEMO_RESTRICTED_FEATURES = [
  'password and two-factor authentication', 'passkeys', 'end-to-end encryption', 'push notifications', 'linked accounts',
  'users and invitations', 'single sign-on', 'calendar apps (CalDAV)', 'webhooks', 'email to task', 'backups',
  'the assistant', 'AI assistants (MCP)', 'API tokens', 'import', 'sharing changes',
]

/** The demo note in place of a section's refused panels, naming them. */
function DemoRestrictedSection({ features }: { features: string[] }) {
  const many = features.length > 1
  return (
    <section className="space-y-2" aria-labelledby="demo-heading" data-testid="demo-restricted">
      <h2 id="demo-heading" className="font-semibold">Demo instance</h2>
      <p className="text-sm text-muted">
        This sandbox is private to you and is deleted after 2 hours of inactivity, and every night.
        Here, {joinList(features)} {many ? 'are' : 'is'} {DEMO_RESTRICTED_NOTE.toLowerCase().replace(/\.$/, '')}.
        Run your own server to use {many ? 'them' : 'it'}; it takes one container.
      </p>
    </section>
  )
}

