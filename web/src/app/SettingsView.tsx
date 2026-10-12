import { lazy, type MouseEvent, type RefObject, Suspense, useEffect, useRef, useState } from 'react'
import { HelpHeading } from './help/HelpLink'
import { useLiveQuery } from 'dexie-react-hooks'
import { getAutoArchive, setAutoArchive } from '../lib/archive'
import { bookmarklet } from '../lib/share'
import { useSyncStatus } from '../lib/sync'
import type { User } from '../lib/types'
import { ArchivedProjectsSection } from './ArchivedProjects'
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
import { TwoFactorPanel } from './TwoFactorPanel'
import { EncryptionPanel } from './EncryptionPanel'
import { navigate, routePath, type Route, type SettingsSectionId } from './router'
import { joinList, resolveSection, SETTINGS_SECTIONS, visibleSections } from './settingsSections'
import { TokensSection } from './TokensSection'
import { WebhooksPanel } from './WebhooksPanel'
import { CaldavPanel } from './CaldavPanel'
import { EmailInboxPanel } from './EmailInboxPanel'
import { setStartView, type StartView } from '../lib/views'
import { useStartView, useViews } from './useViews'
import { setVimEnabled, useVimEnabled } from './vim/prefs'
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

  if (!current) return <SettingsOverview user={user} headingRef={headingRef} />
  return (
    <div className="mx-auto max-w-5xl px-4 py-6 md:flex md:gap-8 md:px-8" data-settings-section={current.id}>
      <nav aria-label="Settings sections" className="hidden md:sticky md:top-6 md:block md:w-48 md:shrink-0 md:self-start">
        <a className="block rounded-md px-2 py-1.5 text-sm text-muted hover:bg-slate-200/60 dark:hover:bg-slate-800" href={routePath({ view: 'settings' })}
          onClick={(e) => followLink(e, { view: 'settings' })}>All settings</a>
        <ul className="mt-1 space-y-0.5">
          {visibleSections(user).map((s) => (
            <li key={s.id}>
              <a href={routePath({ view: 'settings', section: s.id })} aria-current={s.id === current.id ? 'page' : undefined}
                className={`block rounded-md px-2 py-1.5 text-sm ${s.id === current.id ? 'bg-emerald-100 font-medium text-slate-900 dark:bg-emerald-900/40 dark:text-slate-100' : 'text-slate-700 hover:bg-slate-200/60 dark:text-slate-300 dark:hover:bg-slate-800'}`}
                onClick={(e) => followLink(e, { view: 'settings', section: s.id })}>{s.label}</a>
            </li>
          ))}
        </ul>
      </nav>
      <div className="min-w-0 flex-1 space-y-8 md:max-w-2xl">
        <div>
          <a className="btn-ghost touch-target -ml-3 text-sm md:hidden" href={routePath({ view: 'settings' })} data-settings-back
            onClick={(e) => followLink(e, { view: 'settings' })}><span aria-hidden="true">←</span> Settings</a>
          <h1 ref={headingRef} tabIndex={-1} className="text-xl font-semibold outline-none">{current.label}</h1>
        </div>
        <SectionContent id={current.id} user={user} onLogout={onLogout} />
      </div>
    </div>
  )
}

function SettingsOverview({ user, headingRef }: { user: User; headingRef: RefObject<HTMLHeadingElement | null> }) {
  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-6 md:px-8" data-settings-overview>
      <section>
        <div className="flex items-center justify-between gap-2">
          <h1 ref={headingRef} tabIndex={-1} className="text-xl font-semibold outline-none">Settings</h1>
          <a className="btn-ghost touch-target text-sm" href="/help" onClick={(e) => followLink(e, { view: 'help' })}>Help and guides</a>
        </div>
        <ProfileLine user={user} />
      </section>

      <nav aria-label="Settings sections">
        <ul className="divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
          {visibleSections(user).map((s) => (
            <li key={s.id}>
              <a href={routePath({ view: 'settings', section: s.id })} data-settings-link={s.id}
                className="flex min-h-11 items-center gap-3 px-3 py-2.5 hover:bg-slate-100 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-emerald-500 dark:hover:bg-slate-800/60"
                onClick={(e) => followLink(e, { view: 'settings', section: s.id })}>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{s.label}</span>
                  <span className="block text-sm text-muted">{s.description(user)}</span>
                </span>
                <span aria-hidden="true" className="text-faint">›</span>
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <section className="text-xs text-faint">
        OpenTodo is free software (AGPL-3.0). No telemetry, no tracking, no subscription.
        <a className="ml-1 underline" href="https://github.com/pixari/opentodo" target="_blank" rel="noreferrer">Source code</a>
      </section>
    </div>
  )
}

function ProfileLine({ user }: { user: User }) {
  return <p className="user-text mt-1 flex flex-wrap items-center gap-x-2 text-sm text-muted" data-profile-line>{user.name || user.email} · {user.email} · {user.role}</p>
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
          <ProfileLine user={user} />
          {note}
          {!demo && (
            <>
              <PasswordSection />
              <TwoFactorPanel user={user} />
              <SecurityPanel />
            </>
          )}
          <SecuritySettings user={user} />
          {!demo && (
            <>
              <LinkedAccountsPanel />
              <EncryptionPanel />
            </>
          )}
          <section className="space-y-2">
            <HelpHeading screen="settings/session" className="font-semibold">Session</HelpHeading>
            <p className="text-sm text-muted">Signing out clears the local copy of your tasks on this device. Unsynced changes are uploaded first when online.</p>
            <button className="btn-ghost border border-slate-300 dark:border-slate-700" onClick={onLogout}>Sign out</button>
          </section>
        </>
      )
    case 'general':
      return (
        <>
          <CalendarSettingsSection />
          <StartViewSection />
          <KeyboardSection />
          <QuickAddSettingsSection />
          <VoiceSettingsSection />
          <AutoArchiveSection />
        </>
      )
    case 'notifications':
      return <NotificationsSettings />
    case 'data':
      return (
        <>
          <YourDataSection demo={!!demo} />
          {note}
          {!demo && isOwner && <BackupsPanel />}
        </>
      )
    case 'capture':
      return (
        <>
          <CaptureSection />
          {note}
          {!demo && <EmailInboxPanel />}
        </>
      )
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
          <AdministrationSections user={user} />
          {isOwner && <SsoPanel />}
        </>
      )
  }
}

function YourDataSection({ demo }: { demo: boolean }) {
  const sync = useSyncStatus()
  return (
    <section className="space-y-2">
      <HelpHeading screen="settings/data" className="font-semibold">Your data</HelpHeading>
      <p className="text-sm text-muted">
        Everything you see is stored on this device and on your server. Export it any time as JSON, or import an export,
        a CSV file or another task manager's JSON export (<span className="kbd">g</span> <span className="kbd">Shift+I</span>).
      </p>
      <div className="flex flex-wrap gap-2">
        <a className="btn-ghost border border-slate-300 dark:border-slate-700" href="/api/v1/export" download="opentodo-export.json">Download export (JSON)</a>
        {demo ? (
          <button type="button" className="btn-ghost border border-slate-300 dark:border-slate-700" disabled aria-describedby="demo-import-note">Import data…</button>
        ) : (
          <a className="btn-ghost border border-slate-300 dark:border-slate-700" href="/settings/import"
            onClick={(e) => followLink(e, { view: 'import' })}>Import data…</a>
        )}
      </div>
      {demo && <p id="demo-import-note" className="text-xs text-muted">Import: {DEMO_RESTRICTED_NOTE}</p>}
      <p className="text-xs text-faint">
        Sync: {sync.state}{sync.pending ? `, ${sync.pending} change(s) waiting to upload` : ''}.
      </p>
    </section>
  )
}

function StartViewSection() {
  const views = useViews()
  const startView = useStartView()
  const startIsKnown = !startView.startsWith('view:') || views.some((v) => `view:${v.id}` === startView)
  return (
    <section className="space-y-2">
      <HelpHeading screen="settings/start-view" className="font-semibold">Start view</HelpHeading>
      <p className="text-sm text-muted">The view this device opens on launch. Each device keeps its own choice; it is not synced.</p>
      <select className="input max-w-xs" aria-label="Start view on this device" value={startIsKnown ? startView : 'inbox'}
        onChange={(e) => void setStartView(e.target.value as StartView)}>
        <optgroup label="Built-in">
          <option value="inbox">Inbox</option>
          <option value="today">Today</option>
          <option value="upcoming">Upcoming</option>
          <option value="completed">Completed</option>
          <option value="filter">Filter</option>
        </optgroup>
        {views.length > 0 && (
          <optgroup label="Saved views">
            {views.map((v) => <option key={v.id} value={`view:${v.id}`}>{v.name}</option>)}
          </optgroup>
        )}
      </select>
    </section>
  )
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

/**
 * Bookmarklet for this server (OpenSpec `share-capture`). The href is set through
 * the DOM because React refuses `javascript:` URLs; clicking it here does nothing
 * (the app's CSP would block it anyway), it is meant to be dragged to the bar.
 */
/** Vim keybindings switch (vim-keybindings): per device, off by default, applies at once. */
function KeyboardSection() {
  const vim = useVimEnabled()
  return (
    <section className="space-y-2">
      <HelpHeading screen="settings/keyboard" className="font-semibold">Keyboard</HelpHeading>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={vim} onChange={(e) => setVimEnabled(e.target.checked)} data-vim-switch />
        Vim keybindings (this device)
      </label>
      <p className="text-sm text-muted">
        Normal, Insert and Command modes on top of the usual shortcuts: counts, <span className="kbd">gg</span>, <span className="kbd">dd</span>, <span className="kbd">:</span> commands. This device only; <span className="kbd">?</span> lists them.
      </p>
    </section>
  )
}

/** Per-device opt-out of automatic archiving (trash-and-history), stored in local meta, and the archived projects list (unarchive-projects). */
function AutoArchiveSection() {
  const on = useLiveQuery(getAutoArchive, [], true)
  return (
    <section className="space-y-2">
      <HelpHeading screen="settings/projects" className="font-semibold">Projects</HelpHeading>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={on} onChange={(e) => void setAutoArchive(e.target.checked)} />
        Archive projects automatically after 30 days without open tasks (this device)
      </label>
      <p className="text-sm text-muted">Each device keeps its own setting. Deleted items stay in the <a className="underline" href="/trash" onClick={(e) => { e.preventDefault(); navigate({ view: 'trash' }) }}>Trash</a> until restored or purged.</p>
      <ArchivedProjectsSection />
    </section>
  )
}

function CaptureSection() {
  const code = bookmarklet(location.origin)
  const linkRef = useRef<HTMLAnchorElement>(null)
  const [copied, setCopied] = useState<'yes' | 'failed' | null>(null)
  useEffect(() => {
    linkRef.current?.setAttribute('href', code)
  }, [code])

  async function copy() {
    try {
      await navigator.clipboard.writeText(code)
      setCopied('yes')
    } catch {
      setCopied('failed')
    }
  }

  return (
    <section className="space-y-2">
      <HelpHeading screen="settings/capture" className="font-semibold">Capture</HelpHeading>
      <p className="text-sm text-muted">
        Drag this button to your bookmarks bar. On any page, click it to add the page, its title and the selected text to OpenTodo in a small window.
        It holds no password or token; it uses your sign-in on this server. On a phone, install the app and use the share menu instead.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <a
          ref={linkRef}
          draggable
          className="btn-primary cursor-grab"
          title="Drag to your bookmarks bar"
          onClick={(e) => e.preventDefault()}
        >
          Add to OpenTodo
        </a>
        <button className="btn-ghost border border-slate-300 dark:border-slate-700" onClick={() => void copy()}>Copy bookmarklet</button>
        {copied === 'yes' && <span className="text-xs text-emerald-700 dark:text-emerald-400">Copied. Create a bookmark and paste it as the address.</span>}
      </div>
      {copied === 'failed' && (
        <label className="block text-xs text-muted">
          Copy this code and paste it as a bookmark's address:
          <textarea className="input mt-1 font-mono text-xs" readOnly rows={3} value={code} onFocus={(e) => e.currentTarget.select()} />
        </label>
      )}
      <p className="text-xs text-faint">A browser extension for Chromium and Firefox is in the repository under <code>extension/</code>; see docs/capture.md.</p>
    </section>
  )
}
