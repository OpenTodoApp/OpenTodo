import { useLiveQuery } from 'dexie-react-hooks'
import { Skeleton } from '../ui'
import { Tooltip } from '../ui'
import { type FormEvent, useCallback, useEffect, useState } from 'react'
import { Button } from '../ui'
import { Badge } from '../ui'
import { Field, Input, Select } from '../ui'
import { Icon } from '../ui'
import { MenuGroup, MenuItem, MenuSeparator } from '../ui'
import { ConfirmDialog } from '../ui'
import { EmptyState } from '../ui'
import { ListRow } from '../ui'
import { Notice } from '../ui'
import { SettingRow, SettingsSection } from '../ui'
import { Checkbox, Switch } from '../ui'
import type { HueName } from '../ui'
import { Dialog } from './overlay/Dialog'
import { Menu } from './overlay/Menu'
import { SecretReveal } from './TokensSection'
import { api, isNetworkError } from '../lib/api'
import { db } from '../lib/db'
import { useOnline } from '../lib/online'
import type { Webhook, WebhookDelivery, WebhookEvent } from '../lib/types'
import {
  cacheWebhooks, deliveryOutcome, describeWebhookError, insecureTarget, loadCachedWebhooks,
  toggleEvent, WEBHOOK_EVENTS, webhookStatus, type WebhookTone,
} from '../lib/webhooks'
import { useDateTimeFormat } from './DateTimePrefsProvider'
import { t } from '../lib/i18n'

export interface WebhookDraft {
  /** null when creating a new webhook. */
  id: string | null
  url: string
  events: WebhookEvent[]
  projectId: string | null
  enabled: boolean
}

export const emptyDraft = (): WebhookDraft => ({ id: null, url: '', events: ['task.completed'], projectId: null, enabled: true })

export interface WebhooksViewProps {
  isOwner: boolean
  /** False while offline or while the server is unreachable: actions are disabled. */
  connected: boolean
  webhooks: Webhook[] | null
  projects: { id: string; name: string }[]
  allowPrivate: boolean | null
  busy: boolean
  error: string | null
  draft: WebhookDraft | null
  /** Secret of the webhook just created; shown once in the dialog's success step. */
  secret: { webhookId: string; value: string } | null
  testResults: Record<string, { ok: boolean; text: string }>
  log: { webhookId: string; deliveries: WebhookDelivery[] | null } | null
  onDraftChange: (d: WebhookDraft | null) => void
  onSave: () => void
  onDismissSecret: () => void
  onToggleEnabled: (h: Webhook) => void
  onTest: (h: Webhook) => void
  onDelete: (h: Webhook) => void
  onOpenLog: (h: Webhook | null) => void
  onRefreshLog: () => void
  onRedeliver: (d: WebhookDelivery) => void
  onPolicyChange: (allow: boolean) => void
}

const TONE: Record<WebhookTone, HueName> = { ok: 'green', warn: 'orange', off: 'slate' }
const DELIVERY_TONE: Record<WebhookDelivery['status'], HueName> = { delivered: 'green', pending: 'slate', retry: 'orange', failed: 'red' }

/** Pure rendering of the Webhooks section; all state lives in WebhooksPanel. */
export function WebhooksView(p: WebhooksViewProps) {
  const dt = useDateTimeFormat()
  const disabled = !p.connected || p.busy
  const projectName = (id: string | null) => (id ? p.projects.find((x) => x.id === id)?.name ?? t('Unknown project') : t('All projects'))
  const draft = p.draft
  const close = () => (p.secret ? p.onDismissSecret() : p.onDraftChange(null))
  const add = <Button variant="primary" size="sm" icon="plus" disabled={disabled} onClick={() => p.onDraftChange(emptyDraft())}>{t('Add webhook')}</Button>
  return (
    <SettingsSection title={t('Webhooks')} headingId="webhooks-heading" testId="webhooks-panel"
      description={t('Notify Home Assistant, n8n or any HTTP endpoint when your tasks and projects change. Each request is signed with the webhook\'s secret.')}>
      {!p.connected && (
        <Notice>{t('You are offline. Webhooks are delivered by the server, so changing or testing them requires a connection. The list below is the last one fetched.')}</Notice>
      )}
      {p.isOwner && (
        <SettingRow label={t('Allow private network targets')}
          description={t('For everyone on this server. Needed when a receiver runs on your LAN or this machine, for example Home Assistant at 192.168.x.x. Leave off on a public server.')}
          control={<Switch checked={p.allowPrivate === true} disabled={disabled || p.allowPrivate === null} onChange={p.onPolicyChange} label={t('Allow private network targets')} hideLabel />} />
      )}
      {p.error && !draft && !p.secret && <Notice tone="danger">{p.error}</Notice>}

      <div className="py-2">
        {p.webhooks && p.webhooks.length === 0 && (
          <EmptyState icon="link" title={t('No webhooks yet')} body={t('Nothing is sent until you add one. A webhook posts a signed request to your endpoint when tasks or projects change.')} />
        )}
        {p.webhooks === null && (p.connected ? <Skeleton shape="line" count={3} label={t('Loading webhooks')} /> : <p className="py-2 text-meta text-faint">{t('Nothing fetched yet.')}</p>)}
        {p.webhooks?.map((h) => {
          const st = webhookStatus(h)
          const result = p.testResults[h.id]
          const logOpen = p.log?.webhookId === h.id
          return (
            <div key={h.id} className="-mx-3 space-y-1">
              <ListRow leading={<Icon name="link" size="md" />} ariaLabel={h.url}
                label={<Tooltip label={h.url}><span className="block truncate font-mono text-meta">{h.url}</span></Tooltip>}
                meta={`${h.events.join(', ')} · ${projectName(h.projectId)}`}
                badges={<Badge hue={TONE[st.tone]}>{st.label}</Badge>}
                menu={(
                  <Menu label={t('Actions for webhook {url}', { url: h.url })} trigger={<Icon name="ellipsis" />} kind="menu" triggerClassName="ui-btn ui-btn--ghost ui-btn--sm ui-btn--icon">
                    <MenuGroup>
                      <MenuItem label={t('Send test')} icon="send" disabled={disabled} onSelect={() => p.onTest(h)} />
                      <MenuItem label={logOpen ? t('Hide delivery log') : t('Delivery log')} icon="history" onSelect={() => p.onOpenLog(logOpen ? null : h)} />
                      <MenuItem label={t('Edit')} icon="pencil" disabled={disabled}
                        onSelect={() => p.onDraftChange({ id: h.id, url: h.url, events: h.events, projectId: h.projectId, enabled: h.enabled })} />
                      <MenuItem label={h.enabled ? t('Disable') : t('Enable')} icon={h.enabled ? 'eye-off' : 'eye'} disabled={disabled} onSelect={() => p.onToggleEnabled(h)} />
                    </MenuGroup>
                    <MenuSeparator />
                    <MenuItem label={t('Delete')} icon="trash-2" danger disabled={disabled} onSelect={() => p.onDelete(h)} />
                  </Menu>
                )} />
              {result && <div className="px-3"><Notice tone={result.ok ? 'success' : 'danger'}>{result.text}</Notice></div>}
              {logOpen && p.log && (
                <div className="mx-3 rounded-control border border-default p-3" role="region" aria-label={t('Delivery log')}
                  onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); p.onOpenLog(null) } }}>
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-meta font-medium text-muted">{t('Last 100 deliveries')}</span>
                    <Button size="sm" variant="ghost" icon="rotate-ccw" disabled={!p.connected} onClick={p.onRefreshLog}>{t('Refresh')}</Button>
                  </div>
                  {p.log.deliveries === null && <Skeleton shape="line" count={3} label={t('Loading deliveries')} />}
                  {p.log.deliveries?.length === 0 && <p className="text-meta text-faint">{t('No deliveries yet.')}</p>}
                  <ul className="space-y-2">
                    {p.log.deliveries?.map((d) => (
                      <li key={d.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-meta">
                        <Badge hue={DELIVERY_TONE[d.status]}>{d.status}</Badge>
                        <code className="text-default">{d.event}</code>
                        <span className="text-faint">{dt.formatInstant(d.createdAt, 'datetime')}</span>
                        <span className="text-muted">
                          {t('{attempts} attempt', { attempts: d.attempts })}{d.attempts === 1 ? '' : 's'}{deliveryOutcome(d) ? ` · ${deliveryOutcome(d)}` : ''}
                        </span>
                        {(d.status === 'delivered' || d.status === 'failed') && (
                          <Button size="sm" variant="ghost" disabled={disabled} onClick={() => p.onRedeliver(d)}>{t('Redeliver')}</Button>
                        )}
                        {d.responseExcerpt && (
                          <details className="w-full">
                            <summary className="cursor-pointer text-faint">{t('Response')}</summary>
                            <pre className="whitespace-pre-wrap break-all text-muted">{d.responseExcerpt}</pre>
                          </details>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {(draft || p.secret) && (
        <Dialog title={p.secret ? t('Webhook created') : draft?.id ? t('Edit webhook') : t('New webhook')} onClose={close} size="lg">
          {p.secret ? (
            <div className="space-y-4">
              <SecretReveal what={t('signing secret')} secret={p.secret.value} testId="webhook-secret" />
              <p className="text-meta text-muted">{t('Your receiver uses it to check that requests come from your server; see the webhooks guide.')}</p>
              <div className="flex justify-end"><Button variant="primary" onClick={p.onDismissSecret}>{t('Done')}</Button></div>
            </div>
          ) : draft && (
            <form className="space-y-4" onSubmit={(e: FormEvent) => { e.preventDefault(); p.onSave() }}>
              <Field label={t('Target URL')}>
                <Input type="url" required data-autofocus placeholder={t('https://n8n.example.com/webhook/…')} value={draft.url}
                  onChange={(e) => p.onDraftChange({ ...draft, url: e.target.value })} disabled={disabled} />
              </Field>
              {insecureTarget(draft.url) && (
                <Notice tone="warning">{t('This is a plain http:// address: task content will travel unencrypted. Prefer https:// unless the receiver is on a network you trust.')}</Notice>
              )}
              <fieldset>
                <legend className="mb-2 text-body font-medium text-default">{t('Events')}</legend>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {WEBHOOK_EVENTS.map(({ event, label }) => (
                    <Checkbox key={event} checked={draft.events.includes(event)} disabled={disabled}
                      onChange={() => p.onDraftChange({ ...draft, events: toggleEvent(draft.events, event) })}
                      label={label} description={event} />
                  ))}
                </div>
              </fieldset>
              <Field label={t('Only for project')}>
                <Select value={draft.projectId ?? ''} onChange={(e) => p.onDraftChange({ ...draft, projectId: e.target.value || null })} disabled={disabled}>
                  <option value="">{t('All projects')}</option>
                  {p.projects.map((pr) => <option key={pr.id} value={pr.id}>{pr.name}</option>)}
                </Select>
              </Field>
              {draft.id && (
                <Checkbox checked={draft.enabled} onChange={(e) => p.onDraftChange({ ...draft, enabled: e.target.checked })} disabled={disabled} label={t('Enabled')} />
              )}
              {p.error && <Notice tone="danger">{p.error}</Notice>}
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => p.onDraftChange(null)}>{t('Cancel')}</Button>
                <Button variant="primary" type="submit" busy={p.busy} disabled={disabled || draft.events.length === 0 || !draft.url.trim()}>
                  {draft.id ? t('Save') : t('Create webhook')}
                </Button>
              </div>
            </form>
          )}
        </Dialog>
      )}
      <SettingRow label={t('Add a webhook')} description={t('Posts a signed request to your endpoint when tasks or projects change.')} control={add} />
    </SettingsSection>
  )
}

/** Settings → Webhooks: per-user webhooks plus the owner's private-network policy. */
export function WebhooksPanel({ isOwner }: { isOwner: boolean }) {
  const online = useOnline()
  const [webhooks, setWebhooks] = useState<Webhook[] | null>(null)
  const [unreachable, setUnreachable] = useState(false)
  const [allowPrivate, setAllowPrivate] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState<WebhookDraft | null>(null)
  const [secret, setSecret] = useState<{ webhookId: string; value: string } | null>(null)
  const [deleting, setDeleting] = useState<Webhook | null>(null)
  const [testResults, setTestResults] = useState<Record<string, { ok: boolean; text: string }>>({})
  const [log, setLog] = useState<{ webhookId: string; deliveries: WebhookDelivery[] | null } | null>(null)
  const projects = useLiveQuery(
    () => db.projects.filter((pr) => !pr.deleted_at).sortBy('position'),
    [], [],
  )

  const fail = useCallback((err: unknown) => {
    if (isNetworkError(err)) setUnreachable(true)
    setError(describeWebhookError(err))
  }, [])

  const load = useCallback(async () => {
    try {
      const res = await api.listWebhooks()
      setWebhooks(res.webhooks)
      setUnreachable(false)
      void cacheWebhooks(res.webhooks)
      if (isOwner) setAllowPrivate((await api.getWebhookPolicy()).allowPrivate)
    } catch (err) {
      if (isNetworkError(err)) setUnreachable(true)
      else setError(describeWebhookError(err))
    }
  }, [isOwner])

  useEffect(() => {
    void loadCachedWebhooks().then((cached) => setWebhooks((cur) => cur ?? cached))
  }, [])
  useEffect(() => {
    if (online) void load()
  }, [online, load])

  const connected = online && !unreachable

  async function run(action: () => Promise<void>) {
    setError(null)
    setBusy(true)
    try {
      await action()
    } catch (err) {
      fail(err)
    } finally {
      setBusy(false)
    }
  }

  async function loadLog(webhookId: string) {
    setLog({ webhookId, deliveries: null })
    try {
      const res = await api.listDeliveries(webhookId)
      setLog((cur) => (cur?.webhookId === webhookId ? { webhookId, deliveries: res.deliveries } : cur))
    } catch (err) {
      fail(err)
      setLog((cur) => (cur?.webhookId === webhookId ? { webhookId, deliveries: [] } : cur))
    }
  }

  const props: WebhooksViewProps = {
    isOwner, connected, webhooks, projects: projects.map((pr) => ({ id: pr.id, name: pr.name })), allowPrivate, busy, error,
    draft, secret, testResults, log,
    onDraftChange: (d) => {
      setDraft(d)
      if (d) setError(null)
    },
    onSave: () => void run(async () => {
      if (!draft) return
      const input = { url: draft.url.trim(), events: draft.events, projectId: draft.projectId }
      if (draft.id) {
        await api.updateWebhook(draft.id, { ...input, enabled: draft.enabled })
      } else {
        const res = await api.createWebhook(input)
        if (res.webhook.secret) setSecret({ webhookId: res.webhook.id, value: res.webhook.secret })
      }
      setDraft(null)
      await load()
    }),
    onDismissSecret: () => setSecret(null),
    onToggleEnabled: (h) => void run(async () => {
      await api.updateWebhook(h.id, { enabled: !h.enabled })
      await load()
    }),
    onTest: (h) => void run(async () => {
      setTestResults((r) => ({ ...r, [h.id]: { ok: true, text: t('Sending ping…') } }))
      const res = await api.testWebhook(h.id)
      const outcome = deliveryOutcome(res.delivery) || res.delivery.status
      setTestResults((r) => ({ ...r, [h.id]: { ok: res.ok, text: res.ok ? t('Ping delivered: {outcome}', { outcome }) : t('Ping failed: {outcome}', { outcome }) } }))
      if (log?.webhookId === h.id) await loadLog(h.id)
    }),
    onDelete: setDeleting,
    onOpenLog: (h) => {
      if (!h) setLog(null)
      else void loadLog(h.id)
    },
    onRefreshLog: () => {
      if (log) void loadLog(log.webhookId)
    },
    onRedeliver: (d) => void run(async () => {
      await api.redeliver(d.webhookId, d.id)
      await loadLog(d.webhookId)
    }),
    onPolicyChange: (allow) => void run(async () => {
      setAllowPrivate((await api.setWebhookPolicy(allow)).allowPrivate)
    }),
  }
  return (
    <>
      <WebhooksView {...props} />
      {deleting && (
        <ConfirmDialog title={t('Delete this webhook?')} confirmLabel={t('Delete webhook')}
          consequence={<>{t.rich('Nothing more is sent to <span>{url}</span>, and its delivery log is deleted too.', { url: deleting.url, span: (chunks) => <span className="user-text font-mono text-meta">{chunks}</span> })}</>}
          onConfirm={async () => {
            await api.deleteWebhook(deleting.id)
            if (log?.webhookId === deleting.id) setLog(null)
            await load()
          }}
          onCancel={() => setDeleting(null)} />
      )}
    </>
  )
}
