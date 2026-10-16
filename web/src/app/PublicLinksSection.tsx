// "Share with a public link" in the share dialog (OpenSpec change public-links,
// "Public links in the share dialog"): the project's owner and admins create a
// link anyone can open without an account, read-only or with ticking, see the
// active links and revoke them. Server data: nothing is kept on the device, and
// offline the controls are disabled.
import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react'
import { Button, ConfirmDialog, Field, Input, Notice, Select } from '../ui'
import { api, ApiError, isNetworkError } from '../lib/api'
import { formatInstant } from '../lib/dates'
import { useOnline } from '../lib/online'
import type { PublicLink } from '../lib/types'
import { useDateTimeFormat } from './DateTimePrefsProvider'
import { t } from '../lib/i18n'

const EXPIRY: readonly (number | null)[] = [null, 1, 7, 30, 90]

export const rightsText = (r: PublicLink['rights']) => (r === 'tick' ? t('Anyone with this link can tick items') : t('Anyone with this link can view the list'))

function describe(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === 'encryption_enabled') return t('This project is end-to-end encrypted, so it cannot be published: the server cannot read its tasks.')
    if (err.code === 'rate_limited') return t('Too many links created recently. Try again later.')
    if (err.code === 'reauth_required') return t('Confirm your password, then create the link again.')
    return err.message.charAt(0).toUpperCase() + err.message.slice(1)
  }
  return t('The server could not be reached; public links need a connection.')
}

export function PublicLinksSection({ projectId, focus = false, onChange }: {
  projectId: string
  /** Opened from the project's "Public" badge: bring the section into view. */
  focus?: boolean
  /** Called with the number of active links after every load. */
  onChange?: (active: number) => void
}) {
  useDateTimeFormat()
  const online = useOnline()
  const [links, setLinks] = useState<PublicLink[] | null>(null)
  const [unreachable, setUnreachable] = useState(false)
  const [rights, setRights] = useState<PublicLink['rights']>('view')
  const [name, setName] = useState('')
  const [days, setDays] = useState<number | null>(null)
  const [created, setCreated] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [revoking, setRevoking] = useState<PublicLink | null>(null)
  const ref = useRef<HTMLElement>(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  const load = useCallback(async () => {
    try {
      const res = await api.listPublicLinks(projectId)
      setLinks(res.links)
      setUnreachable(false)
      onChangeRef.current?.(res.links.length)
    } catch (err) {
      if (isNetworkError(err)) setUnreachable(true)
      else setLinks([])
    }
  }, [projectId])
  useEffect(() => { if (online) void load() }, [online, load])
  useEffect(() => { if (focus) ref.current?.scrollIntoView?.({ block: 'nearest' }) }, [focus])

  const offline = !online || unreachable
  const disabled = offline || busy

  async function create(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const res = await api.createPublicLink(projectId, { rights, ...(name.trim() ? { name: name.trim() } : {}), ...(days ? { expiresInDays: days } : {}) })
      setCreated(res.link)
      setCopied(false)
      setName('')
      await load()
    } catch (err) {
      setError(describe(err))
    } finally {
      setBusy(false)
    }
  }

  async function copy() {
    if (!created) return
    try {
      await navigator.clipboard.writeText(created)
      setCopied(true)
    } catch {
      setError(t('Could not access the clipboard; select the link and copy it manually.'))
    }
  }

  async function revoke(l: PublicLink) {
    await api.revokePublicLink(projectId, l.id)
    await load()
  }

  return (
    <section ref={ref} aria-labelledby="public-links-heading" className="mb-4 rounded-card border border-default p-3" data-testid="public-links">
      <h3 id="public-links-heading" className="text-body font-medium text-default">{t('Share with a public link')}</h3>
      <p className="mt-1 text-meta text-muted">{t('Anyone with the link sees this project\'s open tasks without an account: no notes, labels or names. Use it for a shopping list in a group chat.')}</p>
      {offline && <div className="mt-2"><Notice tone="warning">{t('You are offline. Public links live on the server, so creating and revoking them needs a connection.')}</Notice></div>}
      <form onSubmit={(e) => void create(e)} className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto_auto]">
        <Field label={t('Name (optional)')}>
          <Input value={name} maxLength={60} placeholder={t('Group chat')} onChange={(e) => setName(e.target.value)} disabled={disabled} />
        </Field>
        <Field label={t('Rights')}>
          <Select value={rights} onChange={(e) => setRights(e.target.value as PublicLink['rights'])} disabled={disabled}>
            <option value="view">{t('View only')}</option>
            <option value="tick">{t('Can tick items')}</option>
          </Select>
        </Field>
        <Field label={t('Expires')}>
          <Select value={days ?? ''} onChange={(e) => setDays(e.target.value ? Number(e.target.value) : null)} disabled={disabled}>
            {EXPIRY.map((d) => <option key={d ?? 'never'} value={d ?? ''}>{d === null ? t('Never') : t('{n, plural, one {# day} other {# days}}', { n: d })}</option>)}
          </Select>
        </Field>
        <div className="sm:col-span-3">
          <Button type="submit" variant="primary" size="sm" busy={busy} disabled={offline}>{t('Create public link')}</Button>
        </div>
      </form>
      {created && (
        <div className="mt-3 space-y-2" data-testid="public-link-created">
          <Notice tone="success">{t('Copy this link now. It is shown only once.')}</Notice>
          <div className="flex flex-wrap items-center gap-2">
            <code tabIndex={0} className="min-w-0 flex-1 break-all rounded-control border border-default bg-sunken px-2 py-1.5 font-mono text-meta text-default">{created}</code>
            <Button size="sm" icon="copy" onClick={() => void copy()}>{copied ? t('Copied') : t('Copy link')}</Button>
          </div>
        </div>
      )}
      {error && <div className="mt-2"><Notice tone="danger">{error}</Notice></div>}
      {links && links.length > 0 && (
        <ul aria-label={t('Active public links')} className="mt-3 divide-y divide-default">
          {links.map((l) => (
            <li key={l.id} className="flex flex-wrap items-center gap-2 py-2" data-public-link={l.id}>
              <span className="min-w-0 flex-1">
                <span className="user-text block truncate text-body text-default">{l.name || t('Unnamed link')}</span>
                <span className="block text-meta text-muted">
                  {rightsText(l.rights)} · {l.expiresAt ? t('expires {instant}', { instant: formatInstant(l.expiresAt, 'date') }) : t('no expiry')} · {l.lastUsedAt ? t('opened {instant}', { instant: formatInstant(l.lastUsedAt, 'datetime') }) : t('not opened yet')}
                </span>
              </span>
              <Button size="sm" variant="ghost" disabled={disabled} aria-label={(l.name ? t('Revoke {name}', { name: l.name }) : t('Revoke the unnamed link'))} onClick={() => setRevoking(l)}>{t('Revoke')}</Button>
            </li>
          ))}
        </ul>
      )}
      {revoking && (
        <ConfirmDialog title={(revoking.name ? t('Revoke “{name}”?', { name: revoking.name }) : t('Revoke this public link?'))} confirmLabel={t('Revoke')}
          consequence={t('The link stops working at once. Anyone who opens it sees that it no longer works.')}
          onConfirm={async () => { await revoke(revoking); setRevoking(null) }} onCancel={() => setRevoking(null)} />
      )}
    </section>
  )
}
