import { useEffect, useRef, useState } from 'react'
import { HelpHeading } from './help/HelpLink'
import { useLiveQuery } from 'dexie-react-hooks'
import { getAutoArchive, setAutoArchive } from '../lib/archive'
import { bookmarklet } from '../lib/share'
import { useSyncStatus } from '../lib/sync'
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
import { TwoFactorPanel } from './TwoFactorPanel'
import { EncryptionPanel } from './EncryptionPanel'
import { navigate } from './router'
import { TokensSection } from './TokensSection'
import { WebhooksPanel } from './WebhooksPanel'
import { CaldavPanel } from './CaldavPanel'
import { EmailInboxPanel } from './EmailInboxPanel'
import { setStartView, type StartView } from '../lib/views'
import { useStartView, useViews } from './useViews'
import { setVimEnabled, useVimEnabled } from './vim/prefs'
import { DEMO_RESTRICTED_NOTE, useDemo } from '../lib/demo'

export function SettingsView({ user, onLogout }: { user: User; onLogout: () => void }) {
  // Bumped when the AI assistants section creates a token, so the list reloads.
  const [tokenReload, setTokenReload] = useState(0)
  const sync = useSyncStatus()
  const views = useViews()
  const startView = useStartView()
  const demo = useDemo()
  const startIsKnown = !startView.startsWith('view:') || views.some((v) => `view:${v.id}` === startView)

  return (
    <div className="mx-auto max-w-2xl space-y-8 px-4 py-6 md:px-8">
      <section>
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-xl font-semibold">Settings</h1>
          <a className="btn-ghost touch-target text-sm" href="/help" onClick={(e) => { e.preventDefault(); navigate({ view: 'help' }) }}>Help and guides</a>
        </div>
        <p className="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-slate-500">{user.name || user.email} · {user.email} · {user.role}</p>
      </section>

      <section className="space-y-2">
        <HelpHeading screen="settings/data" className="font-semibold">Your data</HelpHeading>
        <p className="text-sm text-slate-500">
          Everything you see is stored on this device and on your server. Export it any time as JSON, or import an export,
          a CSV file or another task manager's JSON export (<span className="kbd">g</span> <span className="kbd">Shift+I</span>).
        </p>
        <div className="flex flex-wrap gap-2">
          <a className="btn-ghost border border-slate-300 dark:border-slate-700" href="/api/v1/export" download="opentodo-export.json">Download export (JSON)</a>
          {demo ? (
            <button type="button" className="btn-ghost border border-slate-300 dark:border-slate-700" disabled aria-describedby="demo-import-note">Import data…</button>
          ) : (
            <a className="btn-ghost border border-slate-300 dark:border-slate-700" href="/settings/import"
              onClick={(e) => { e.preventDefault(); navigate({ view: 'import' }) }}>Import data…</a>
          )}
        </div>
        {demo && <p id="demo-import-note" className="text-xs text-slate-500">Import: {DEMO_RESTRICTED_NOTE}</p>}
        <p className="text-xs text-slate-400">
          Sync: {sync.state}{sync.pending ? `, ${sync.pending} change(s) waiting to upload` : ''}.
        </p>
      </section>

      <CalendarSettingsSection />

      {demo ? <DemoRestrictedSection /> : (
        <>
          <PasswordSection />
          <TwoFactorPanel user={user} />
          <EncryptionPanel />
          <NotificationsSettings />

          <SecurityPanel />
          <LinkedAccountsPanel />
        </>
      )}
      <section className="space-y-2">
        <HelpHeading screen="settings/start-view" className="font-semibold">Start view</HelpHeading>
        <p className="text-sm text-slate-500">The view this device opens on launch. Each device keeps its own choice; it is not synced.</p>
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

      <KeyboardSection />

      <AutoArchiveSection />

      {!demo && (
        <>
          <AdministrationSections user={user} />
          {user.role === 'owner' && <SsoPanel />}

          <CaldavPanel isOwner={user.role === 'owner'} email={user.email} />

          <WebhooksPanel isOwner={user.role === 'owner'} />
        </>
      )}
      <QuickAddSettingsSection />
      <VoiceSettingsSection />

      <SecuritySettings user={user} />

      <CaptureSection />
      {!demo && (
        <>
          <EmailInboxPanel />

          {user.role === 'owner' && <BackupsPanel />}

          <AssistantsPanel isOwner={user.role === 'owner'} onTokenCreated={() => setTokenReload((n) => n + 1)} />

          <TokensSection reloadKey={tokenReload} />
        </>
      )}

      <section className="space-y-2">
        <HelpHeading screen="settings/session" className="font-semibold">Session</HelpHeading>
        <p className="text-sm text-slate-500">Signing out clears the local copy of your tasks on this device. Unsynced changes are uploaded first when online.</p>
        <button className="btn-ghost border border-slate-300 dark:border-slate-700" onClick={onLogout}>Sign out</button>
      </section>

      <section className="text-xs text-slate-400">
        OpenTodo is free software (AGPL-3.0). No telemetry, no tracking, no subscription.
        <a className="ml-1 underline" href="https://github.com/pixari/opentodo" target="_blank" rel="noreferrer">Source code</a>
      </section>
    </div>
  )
}

/** Features a demo instance refuses (OpenSpec `demo-mode`), listed where their sections would be. */
export const DEMO_RESTRICTED_FEATURES = [
  'password and two-factor authentication', 'passkeys', 'end-to-end encryption', 'push notifications', 'linked accounts',
  'users and invitations', 'single sign-on', 'calendar apps (CalDAV)', 'webhooks', 'email to task', 'backups',
  'AI assistants (MCP)', 'API tokens', 'import', 'sharing changes',
]

function DemoRestrictedSection() {
  return (
    <section className="space-y-2" aria-labelledby="demo-heading" data-testid="demo-restricted">
      <h2 id="demo-heading" className="font-semibold">Demo instance</h2>
      <p className="text-sm text-slate-500">
        This sandbox is private to you and is deleted after 2 hours of inactivity, and every night. Account, security and server settings are {DEMO_RESTRICTED_NOTE.toLowerCase().replace(/\.$/, '')}: {DEMO_RESTRICTED_FEATURES.join(', ')}.
        Run your own server to use them; it takes one container.
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
      <p className="text-sm text-slate-500">
        Normal, Insert and Command modes on top of the usual shortcuts: counts, <span className="kbd">gg</span>, <span className="kbd">dd</span>, <span className="kbd">:</span> commands. This device only; <span className="kbd">?</span> lists them.
      </p>
    </section>
  )
}

/** Per-device opt-out of automatic archiving (trash-and-history); stored in local meta. */
function AutoArchiveSection() {
  const on = useLiveQuery(getAutoArchive, [], true)
  return (
    <section className="space-y-2">
      <HelpHeading screen="settings/projects" className="font-semibold">Projects</HelpHeading>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={on} onChange={(e) => void setAutoArchive(e.target.checked)} />
        Archive projects automatically after 30 days without open tasks (this device)
      </label>
      <p className="text-sm text-slate-500">Each device keeps its own setting. Deleted items stay in the <a className="underline" href="/trash" onClick={(e) => { e.preventDefault(); navigate({ view: 'trash' }) }}>Trash</a> until restored or purged.</p>
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
      <p className="text-sm text-slate-500">
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
        <label className="block text-xs text-slate-500">
          Copy this code and paste it as a bookmark's address:
          <textarea className="input mt-1 font-mono text-xs" readOnly rows={3} value={code} onFocus={(e) => e.currentTarget.select()} />
        </label>
      )}
      <p className="text-xs text-slate-400">A browser extension for Chromium and Firefox is in the repository under <code>extension/</code>; see docs/capture.md.</p>
    </section>
  )
}
