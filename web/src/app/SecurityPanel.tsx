import { type FormEvent, type KeyboardEvent, useCallback, useEffect, useState } from 'react'
import { Button } from '../ui/Button'
import { Badge } from '../ui/Card'
import { Field, Input } from '../ui/Field'
import { Icon } from '../ui/Icon'
import { MenuItem, MenuSeparator } from '../ui/Menu'
import { ConfirmDialog } from '../ui/patterns/ConfirmDialog'
import { EmptyState } from '../ui/patterns/EmptyState'
import { ListRow } from '../ui/patterns/ListRow'
import { Notice } from '../ui/patterns/Notice'
import { SettingRow, SettingsSection } from '../ui/patterns/SettingsSection'
import { Menu } from './overlay/Menu'
import { api, ApiError } from '../lib/api'
import { useOnline } from '../lib/online'
import { createPasskey, isCancellation, passkeysSupported, rpIdMatches } from '../lib/passkeys'
import type { Passkey } from '../lib/types'

// Settings → Security → Passkeys (OpenSpec change `passkeys`; layout by settings-redesign). The server list is
// authoritative and not cached for offline use: offline, the panel shows what
// it fetched earlier in this session, read-only.

const AVAILABLE_KEY = 'opentodo.passkeysAvailable'

export function relativeTime(ts: number | null, now = Date.now()): string {
  if (ts === null) return 'never'
  const s = Math.max(0, Math.round((now - ts) / 1000))
  if (s < 60) return 'just now'
  const m = Math.round(s / 60)
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} h ago`
  return new Date(ts).toLocaleDateString()
}

function readCachedAvailability(): boolean {
  try {
    return localStorage.getItem(AVAILABLE_KEY) === 'true'
  } catch {
    return false
  }
}

/** Container: learns availability from auth/status, loads and mutates the list. */
export function SecurityPanel() {
  const [available, setAvailable] = useState<boolean>(readCachedAvailability)
  const [passkeys, setPasskeys] = useState<Passkey[] | null>(null)
  const [domain, setDomain] = useState<string | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const online = useOnline()
  const [removing, setRemoving] = useState<Passkey | null>(null)

  const load = useCallback(async () => {
    try {
      const status = await api.authStatus()
      const ok = status.passkeysAvailable === true
      setAvailable(ok)
      setDomain(status.passkeyDomain || undefined)
      try {
        localStorage.setItem(AVAILABLE_KEY, String(ok))
      } catch {
        /* storage unavailable: availability is re-read next time */
      }
      if (ok) setPasskeys((await api.listPasskeys()).passkeys)
    } catch (err) {
      // Offline or server unreachable: keep whatever we had.
      if (err instanceof ApiError) setError(err.message)
    }
  }, [])

  useEffect(() => {
    if (online) void load()
  }, [online, load])

  const run = useCallback(async (fn: () => Promise<unknown>) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
      await load()
    } catch (err) {
      if (isCancellation(err)) return // user closed the browser prompt
      setError(err instanceof ApiError && err.code === 'passkey_challenge_invalid'
        ? 'That took too long. Please try again.'
        : err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }, [load])

  return (
    <>
    <SecurityPanelView
      available={available}
      supported={passkeysSupported()}
      online={online}
      passkeys={passkeys}
      domain={domain}
      pageHost={typeof location === 'undefined' ? undefined : location.hostname}
      busy={busy}
      error={error}
      onAdd={(name) => run(async () => {
        const { publicKey } = await api.passkeyRegisterOptions()
        const credential = await createPasskey(publicKey)
        await api.passkeyRegister(name, credential)
      })}
      onRename={(id, name) => run(() => api.renamePasskey(id, name))}
      onDelete={(id) => setRemoving(passkeys?.find((k) => k.id === id) ?? null)}
    />
    {removing && (
      <ConfirmDialog title={`Remove the passkey “${removing.name}”?`} confirmLabel="Remove passkey"
        consequence="It will no longer sign you in. Your password and other passkeys keep working."
        onConfirm={() => run(() => api.deletePasskey(removing.id))} onCancel={() => setRemoving(null)} />
    )}
    </>
  )
}

export interface SecurityPanelViewProps {
  available: boolean
  supported: boolean
  online: boolean
  passkeys: Passkey[] | null
  /** Host the server binds passkeys to, and the host this page is open at. */
  domain?: string
  pageHost?: string
  busy: boolean
  error: string | null
  onAdd: (name: string) => Promise<void> | void
  onRename: (id: string, name: string) => Promise<void> | void
  onDelete: (id: string) => Promise<void> | void
  now?: number
}

/** Presentational part, rendered without effects so it can be tested directly. */
export function SecurityPanelView(p: SecurityPanelViewProps) {
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState('')

  if (!p.available) return null
  const disabled = !p.online || p.busy || !p.supported
  const count = p.passkeys?.length ?? 0

  function submitAdd(e: FormEvent) {
    e.preventDefault()
    const name = newName.trim() || defaultDeviceName()
    setAdding(false)
    setNewName('')
    void p.onAdd(name)
  }
  function submitRename(e: FormEvent, id: string) {
    e.preventDefault()
    if (draft.trim()) void p.onRename(id, draft.trim())
    setEditing(null)
  }
  function escapeTo(e: KeyboardEvent, close: () => void) {
    if (e.key === 'Escape') {
      e.stopPropagation()
      close()
    }
  }

  const addForm = (
    <form className="flex flex-wrap items-end gap-2 py-3" onSubmit={submitAdd}>
      <div className="min-w-0 flex-1 basis-56">
        <Field label="Passkey name" description="So you can tell your devices apart.">
          <Input autoFocus placeholder="Device name (e.g. Work laptop)" value={newName} onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => escapeTo(e, () => setAdding(false))} disabled={disabled} />
        </Field>
      </div>
      <div className="flex gap-2 pb-0.5">
        <Button variant="ghost" onClick={() => setAdding(false)}>Cancel</Button>
        <Button variant="primary" type="submit" disabled={disabled}>Continue</Button>
      </div>
    </form>
  )

  return (
    <SettingsSection title="Passkeys" helpId="settings/security" headingId="security-heading" testId="security-panel"
      description="Sign in with your device's fingerprint, face or PIN instead of your password. Your password keeps working; add a passkey on a second device so losing one is never a problem.">
      {p.domain && p.pageHost && !rpIdMatches(p.domain, p.pageHost) && (
        <Notice tone="danger">
          This page is open at <span className="font-mono">{p.pageHost}</span>, so passkeys will not work here. Open the app at{' '}
          <a className="underline" href={`https://${p.domain}`}>https://{p.domain}</a>, or set <span className="font-mono">OPENTODO_BASE_URL</span> to{' '}
          <span className="font-mono">https://{p.pageHost}</span> and redeploy.
        </Notice>
      )}
      {!p.online && <Notice>You are offline. Managing passkeys needs a connection to your server.</Notice>}
      {p.online && !p.supported && <Notice>This browser does not support passkeys.</Notice>}
      {p.error && <Notice tone="danger">{p.error}</Notice>}

      {p.passkeys && count === 0 ? (
        adding ? addForm : (
          <EmptyState icon="key-round" title="No passkeys yet"
            body="A passkey is the fastest way to sign in: no password to type, and it cannot be phished."
            action={<Button variant="primary" icon="plus" disabled={disabled} onClick={() => setAdding(true)}>Add passkey</Button>} />
        )
      ) : (
        <>
          <SettingRow label={count === 1 ? '1 passkey' : `${count} passkeys`}
            description={p.domain ? <span data-passkey-domain>Tied to <span className="font-mono">{p.domain}</span>.</span> : undefined}
            control={!adding && <Button variant="primary" icon="plus" disabled={disabled} onClick={() => setAdding(true)}>Add passkey</Button>} />
          {adding && addForm}
          <div className="-mx-3 py-1">
            {p.passkeys?.map((k) => (editing === k.id ? (
              <form key={k.id} className="flex flex-wrap items-end gap-2 px-3 py-2" onSubmit={(e) => submitRename(e, k.id)}>
                <div className="min-w-0 flex-1 basis-56">
                  <Field label={`New name for ${k.name}`} hideLabel>
                    <Input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => escapeTo(e, () => setEditing(null))} />
                  </Field>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setEditing(null)}>Cancel</Button>
                <Button variant="primary" size="sm" type="submit" disabled={disabled}>Save</Button>
              </form>
            ) : (
              <ListRow key={k.id} leading={<Icon name="key-round" size="md" />} label={k.name}
                meta={`Created ${new Date(k.createdAt).toLocaleDateString()} · used ${relativeTime(k.lastUsedAt, p.now)}`}
                badges={k.suspiciousAt !== null ? (
                  <Badge hue="red" title="A sign-in with this passkey was refused because its counter went backwards. It may have been copied. Delete it unless you can explain this.">Suspicious</Badge>
                ) : undefined}
                menu={(
                  <Menu label={`Actions for ${k.name}`} trigger={<Icon name="ellipsis" />} kind="menu" triggerClassName="ui-btn ui-btn--ghost ui-btn--sm ui-btn--icon">
                    <MenuItem label="Rename" icon="pencil" disabled={disabled} onSelect={() => { setDraft(k.name); setEditing(k.id) }} />
                    <MenuSeparator />
                    <MenuItem label="Remove" icon="trash-2" danger disabled={disabled} onSelect={() => void p.onDelete(k.id)} />
                  </Menu>
                )} />
            )))}
          </div>
        </>
      )}
    </SettingsSection>
  )
}

function defaultDeviceName(): string {
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent
  if (/iPhone|iPad/.test(ua)) return 'iPhone or iPad'
  if (/Android/.test(ua)) return 'Android device'
  if (/Mac/.test(ua)) return 'Mac'
  if (/Windows/.test(ua)) return 'Windows PC'
  return 'Passkey'
}
