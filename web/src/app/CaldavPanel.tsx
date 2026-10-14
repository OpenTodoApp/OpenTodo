import { useEffect, useState } from 'react'
import { Button, IconButton } from '../ui/Button'
import { Badge } from '../ui/Card'
import { Field, Input } from '../ui/Field'
import { Icon } from '../ui/Icon'
import { MenuItem } from '../ui/Menu'
import { ConfirmDialog } from '../ui/patterns/ConfirmDialog'
import { ListRow } from '../ui/patterns/ListRow'
import { Notice } from '../ui/patterns/Notice'
import { SettingRow, SettingsSection } from '../ui/patterns/SettingsSection'
import { Switch } from '../ui/Switch'
import { Dialog } from './overlay/Dialog'
import { Menu } from './overlay/Menu'
import { SecretReveal } from './TokensSection'
import { api, ApiError } from '../lib/api'
import type { AppPassword, CaldavSetting } from '../lib/types'
import { useDateTimeFormat } from './DateTimePrefsProvider'
import { formatInstant } from '../lib/dates'

// Settings → Calendar apps (OpenSpec change `caldav`): the owner's toggle, the
// server address with per-client setup hints, and per-user app passwords. The
// pure CaldavView renders every state; CaldavPanel loads and acts.

export interface CaldavViewProps {
  isOwner: boolean
  email: string
  setting: CaldavSetting | null
  passwords: AppPassword[] | null
  newName: string
  /** The app password just created; shown once in the dialog's success step. */
  secret: string | null
  error: string | null
  busy: boolean
  /** The "New app password" dialog is open. */
  creating?: boolean
  onToggle: (enabled: boolean) => void
  onNameChange: (name: string) => void
  onCreate: () => void
  onRevoke: (id: string) => void
  onNew?: () => void
  onCloseNew?: () => void
}

const day = (ms: number) => formatInstant(ms, 'date')

function CopyValue({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <span className="flex min-w-0 items-center gap-2">
      <code className="min-w-0 break-all rounded-chip bg-sunken px-1.5 py-0.5 font-mono text-meta text-default">{value}</code>
      <IconButton icon={copied ? 'check' : 'copy'} label={`Copy ${label}`} size="sm"
        onClick={() => void navigator.clipboard?.writeText(value).then(() => setCopied(true), () => {})} />
    </span>
  )
}

export function CaldavView(p: CaldavViewProps) {
  useDateTimeFormat()
  const on = p.setting?.enabled ?? false
  const live = (p.passwords ?? []).filter((x) => !x.revokedAt)
  const revoked = (p.passwords ?? []).filter((x) => x.revokedAt)
  const newButton = <Button size="sm" icon="plus" disabled={p.busy || p.setting === null} onClick={p.onNew}>New app password</Button>
  return (
    <SettingsSection title="Calendar apps (CalDAV)" helpId="settings/caldav" headingId="caldav-heading" testId="caldav-panel"
      description="Sync your tasks with Apple Reminders, Thunderbird or Nextcloud Tasks. Each project is a list, and the Inbox is its own list.">
      {p.setting === null ? (
        <Notice>CalDAV status is available when you are online.</Notice>
      ) : (
        <SettingRow label="Calendar apps on this server"
          description={p.isOwner ? 'Let calendar apps sync with this server.' : on ? undefined : 'Ask the server owner to turn it on.'}
          status={<span className="flex items-center gap-2"><Badge hue={on ? 'green' : 'slate'}>{on ? 'On' : 'Off'}</Badge>{!p.isOwner && <span>{on ? 'CalDAV is on for this server.' : 'CalDAV is off.'}</span>}</span>}
          control={p.isOwner && <Switch checked={on} disabled={p.busy} onChange={p.onToggle} label="Allow calendar apps to sync with this server" hideLabel />} />
      )}
      {p.setting?.encryption && (
        <Notice tone="warning">
          Not available for your account: end-to-end encryption is on, and calendar apps cannot read or write encrypted titles.
        </Notice>
      )}
      {p.setting && on && !p.setting.encryption && (
        <>
          <SettingRow label="Server address" status={<CopyValue value={p.setting.url} label="server address" />} />
          <SettingRow label="User name" status={<CopyValue value={p.email} label="user name" />} description="Sign in with an app password, never your account password." />
          {!p.setting.secure && (
            <Notice tone="danger">
              This address uses plain http: app passwords would travel unencrypted. Put the server behind HTTPS and set
              OPENTODO_BASE_URL before connecting devices outside your home network.
            </Notice>
          )}
          <details className="py-3 text-sm">
            <summary className="cursor-pointer font-medium text-default">How to connect a calendar app</summary>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-muted">
              <li><strong className="text-default">Apple Reminders</strong> (iPhone, iPad, Mac): Settings → Calendar → Accounts → Add Account → Other → Add CalDAV Account. Server: the address above, then your email and an app password.</li>
              <li><strong className="text-default">Thunderbird</strong>: New Calendar → On the Network → your email and the address above; pick the lists to show and enter an app password when asked.</li>
              <li><strong className="text-default">Android / Nextcloud Tasks</strong>: in DAVx⁵ choose “Login with URL and user name”, enter the address, your email and an app password, then enable the task lists for Tasks.org or jtx Board.</li>
            </ul>
          </details>
        </>
      )}

      <div className="space-y-2 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-medium text-default">App passwords</h3>
            <p className="text-meta text-muted">One per device, so you can revoke a lost phone without touching the others. They only work for CalDAV.</p>
          </div>
          {newButton}
        </div>
        {p.error && <Notice tone="danger">{p.error}</Notice>}
        {p.passwords && p.passwords.length === 0 && <p className="py-2 text-meta text-faint">No app passwords yet.</p>}
        <div className="-mx-3">
          {live.map((x) => (
            <ListRow key={x.id} leading={<Icon name="key-round" size="md" />} label={x.name}
              meta={`Created ${day(x.createdAt)} · ${x.lastUsedAt ? `used ${day(x.lastUsedAt)}` : 'never used'}`}
              menu={(
                <Menu label={`Actions for ${x.name}`} trigger={<Icon name="ellipsis" />} kind="menu" triggerClassName="ui-btn ui-btn--ghost ui-btn--sm ui-btn--icon">
                  <MenuItem label="Revoke" icon="trash-2" danger disabled={p.busy} onSelect={() => p.onRevoke(x.id)} />
                </Menu>
              )} />
          ))}
          {revoked.map((x) => (
            <ListRow key={x.id} leading={<Icon name="key-round" size="md" />} label={<span className="text-faint line-through">{x.name}</span>}
              ariaLabel={`${x.name}, revoked`} meta={`Revoked ${day(x.revokedAt as number)}`} badges={<Badge hue="slate">Revoked</Badge>} />
          ))}
        </div>
      </div>
      {p.creating && (
        <Dialog title={p.secret ? 'App password created' : 'New app password'} onClose={() => p.onCloseNew?.()} size="md">
          {p.secret ? (
            <div className="space-y-4">
              <SecretReveal what="app password" secret={p.secret} />
              <p className="text-meta text-muted">Use it with your email ({p.email}) in the calendar app.</p>
              <div className="flex justify-end"><Button variant="primary" onClick={p.onCloseNew}>Done</Button></div>
            </div>
          ) : (
            <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); p.onCreate() }}>
              <Field label="Device name" description="So you know which one to revoke later.">
                <Input aria-label="App password name" placeholder="e.g. iPhone" value={p.newName} onChange={(e) => p.onNameChange(e.target.value)} data-autofocus />
              </Field>
              {p.error && <Notice tone="danger">{p.error}</Notice>}
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={p.onCloseNew}>Cancel</Button>
                <Button variant="primary" type="submit" busy={p.busy}>Create app password</Button>
              </div>
            </form>
          )}
        </Dialog>
      )}
    </SettingsSection>
  )
}

const message = (err: unknown) => (err instanceof ApiError ? err.message : 'Offline: CalDAV is managed on the server.')

export function CaldavPanel({ isOwner, email }: { isOwner: boolean; email: string }) {
  const [setting, setSetting] = useState<CaldavSetting | null>(null)
  const [passwords, setPasswords] = useState<AppPassword[] | null>(null)
  const [newName, setNewName] = useState('')
  const [secret, setSecret] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [creating, setCreating] = useState(false)
  const [revoking, setRevoking] = useState<AppPassword | null>(null)

  async function load() {
    try {
      const [s, list] = await Promise.all([api.caldavSetting(), api.listAppPasswords()])
      setSetting(s)
      setPasswords(list.appPasswords)
    } catch (err) {
      setError(message(err))
    }
  }
  useEffect(() => {
    void load()
  }, [])

  async function run(fn: () => Promise<void>) {
    setBusy(true)
    setError(null)
    try {
      await fn()
    } catch (err) {
      setError(message(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <CaldavView isOwner={isOwner} email={email} setting={setting} passwords={passwords} newName={newName} secret={secret}
        error={error} busy={busy} creating={creating} onNameChange={setNewName}
        onNew={() => { setError(null); setSecret(null); setCreating(true) }}
        onCloseNew={() => { setCreating(false); setSecret(null); setNewName('') }}
        onToggle={(enabled) => void run(async () => setSetting(await api.setCaldavEnabled(enabled)))}
        onCreate={() => void run(async () => {
          const res = await api.createAppPassword(newName.trim() || 'Calendar app')
          setSecret(res.secret)
          setNewName('')
          await load()
        })}
        onRevoke={(id) => setRevoking(passwords?.find((x) => x.id === id) ?? null)} />
      {revoking && (
        <ConfirmDialog title={`Revoke “${revoking.name}”?`} confirmLabel="Revoke app password"
          consequence="Calendar apps using this app password stop syncing at once. Other devices keep working."
          onConfirm={async () => { await api.revokeAppPassword(revoking.id); await load() }} onCancel={() => setRevoking(null)} />
      )}
    </>
  )
}
