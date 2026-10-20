import { type FormEvent, type KeyboardEvent, useCallback, useEffect, useState } from 'react'
import { Button, Menu } from '../ui'
import { Badge } from '../ui'
import { Field, Input } from '../ui'
import { Icon } from '../ui'
import { MenuItem, MenuSeparator } from '../ui'
import { ConfirmDialog } from '../ui'
import { EmptyState } from '../ui'
import { ListRow } from '../ui'
import { Notice } from '../ui'
import { SettingRow, SettingsSection } from '../ui'
import { api, ApiError } from '../lib/api'
import { useOnline } from '../lib/online'
import { createPasskey, isCancellation, passkeysSupported, rpIdMatches } from '../lib/passkeys'
import type { Passkey } from '../lib/types'
import { useDateTimeFormat } from './DateTimePrefsProvider'
import { formatInstant } from '../lib/dates'
import { t } from '../lib/i18n'
import { cardCopy, noticeCopy, SETTINGS_COPY } from '../lib/settingsCopy'

// Settings → Account → Passkeys (OpenSpec change `passkeys`; layout by settings-redesign). The server list is
// authoritative and not cached for offline use: offline, the panel shows what
// it fetched earlier in this session, read-only.

const AVAILABLE_KEY = 'opentodo.passkeysAvailable'

export function relativeTime(ts: number | null, now = Date.now()): string {
  if (ts === null) return t('never')
  const s = Math.max(0, Math.round((now - ts) / 1000))
  if (s < 60) return t('just now')
  const m = Math.round(s / 60)
  if (m < 60) return t('{m} min ago', { m })
  const h = Math.round(m / 60)
  if (h < 24) return t('{h} h ago', { h })
  return formatInstant(ts, 'date')
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
        ? t('That took too long. Please try again.')
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
      <ConfirmDialog title={t('Remove the passkey “{name}”?', { name: removing.name })} confirmLabel={t('Remove passkey')}
        consequence={t('It will no longer sign you in. Your password and other passkeys keep working.')}
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
  const dt = useDateTimeFormat()
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
        <Field label={t('Passkey name')} description={t('So you can tell your devices apart.')}>
          <Input autoFocus placeholder={t('Device name (e.g. Work laptop)')} value={newName} onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => escapeTo(e, () => setAdding(false))} disabled={disabled} />
        </Field>
      </div>
      <div className="flex gap-2 pb-0.5">
        <Button variant="ghost" onClick={() => setAdding(false)}>{t('Cancel')}</Button>
        <Button variant="primary" type="submit" disabled={disabled}>{t('Continue')}</Button>
      </div>
    </form>
  )

  return (
    <SettingsSection {...cardCopy('security')} testId="security-panel">
      {p.domain && p.pageHost && !rpIdMatches(p.domain, p.pageHost) && (
        <Notice tone="danger">
          {t.rich(SETTINGS_COPY.security.notices.domain, { host: <span className="font-mono">{p.pageHost}</span>, link: <a className="underline" href={`https://${p.domain}`}>https://{p.domain}</a>, variable: <span className="font-mono">OPENTODO_BASE_URL</span>, url: <span className="font-mono">https://{p.pageHost}</span> })}
        </Notice>
      )}
      {!p.online && <Notice>{noticeCopy('security', 'offline')}</Notice>}
      {p.online && !p.supported && <Notice>{noticeCopy('security', 'unsupported')}</Notice>}
      {p.error && <Notice tone="danger">{p.error}</Notice>}

      {p.passkeys && count === 0 ? (
        adding ? addForm : (
          <EmptyState icon="key-round" title={t('No passkeys yet')}
            body={t('A passkey is the fastest way to sign in: no password to type, and it cannot be phished.')}
            control={<Button variant="primary" icon="plus" disabled={disabled} onClick={() => setAdding(true)}>{t('Add passkey')}</Button>} />
        )
      ) : (
        <>
          <SettingRow label={count === 1 ? t('1 passkey') : t('{count} passkeys', { count })}
            description={p.domain ? <span data-passkey-domain>{t.rich(SETTINGS_COPY.security.rows.count.description, { domain: p.domain, span: (chunks) => <span className="font-mono">{chunks}</span> })}</span> : undefined}
            control={!adding && <Button variant="primary" icon="plus" disabled={disabled} onClick={() => setAdding(true)}>{t('Add passkey')}</Button>} />
          {adding && addForm}
          <div className="-mx-3 py-1">
            {p.passkeys?.map((k) => (editing === k.id ? (
              <form key={k.id} className="flex flex-wrap items-end gap-2 px-3 py-2" onSubmit={(e) => submitRename(e, k.id)}>
                <div className="min-w-0 flex-1 basis-56">
                  <Field label={t('New name for {name}', { name: k.name })} hideLabel>
                    <Input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => escapeTo(e, () => setEditing(null))} />
                  </Field>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setEditing(null)}>{t('Cancel')}</Button>
                <Button variant="primary" size="sm" type="submit" disabled={disabled}>{t('Save')}</Button>
              </form>
            ) : (
              <ListRow key={k.id} leading={<Icon name="key-round" size="md" />} label={k.name}
                meta={t('Created {instant} · used {relativeTime}', { instant: dt.formatInstant(k.createdAt, 'date'), relativeTime: relativeTime(k.lastUsedAt, p.now) })}
                badges={k.suspiciousAt !== null ? (
                  <Badge hue="red" title={t('A sign-in with this passkey was refused because its counter went backwards. It may have been copied. Delete it unless you can explain this.')}>{t('Suspicious')}</Badge>
                ) : undefined}
                menu={(
                  <Menu label={t('Actions for {name}', { name: k.name })} trigger={<Icon name="ellipsis" />} kind="menu" triggerClassName="ui-btn ui-btn--ghost ui-btn--sm ui-btn--icon">
                    <MenuItem label={t('Rename')} icon="pencil" disabled={disabled} onSelect={() => { setDraft(k.name); setEditing(k.id) }} />
                    <MenuSeparator />
                    <MenuItem label={t('Remove')} icon="trash-2" danger disabled={disabled} onSelect={() => void p.onDelete(k.id)} />
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
  if (/iPhone|iPad/.test(ua)) return t('iPhone or iPad')
  if (/Android/.test(ua)) return t('Android device')
  if (/Mac/.test(ua)) return 'Mac'
  if (/Windows/.test(ua)) return t('Windows PC')
  return t('Passkey')
}
