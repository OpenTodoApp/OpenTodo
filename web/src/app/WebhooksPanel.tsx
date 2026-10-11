import { useLiveQuery } from 'dexie-react-hooks'
import { HelpHeading } from './help/HelpLink'
import { type FormEvent, type KeyboardEvent, useCallback, useEffect, useState } from 'react'
import { api, isNetworkError } from '../lib/api'
import { db } from '../lib/db'
import { useOnline } from '../lib/online'
import type { Webhook, WebhookDelivery, WebhookEvent } from '../lib/types'
import {
  cacheWebhooks, deliveryOutcome, describeWebhookError, insecureTarget, loadCachedWebhooks,
  toggleEvent, WEBHOOK_EVENTS, webhookStatus, type WebhookTone,
} from '../lib/webhooks'

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
  /** Secret of the webhook just created; shown once, until dismissed. */
  secret: { webhookId: string; value: string } | null
  copied: boolean
  testResults: Record<string, { ok: boolean; text: string }>
  log: { webhookId: string; deliveries: WebhookDelivery[] | null } | null
  onDraftChange: (d: WebhookDraft | null) => void
  onSave: () => void
  onCopySecret: () => void
  onDismissSecret: () => void
  onToggleEnabled: (h: Webhook) => void
  onTest: (h: Webhook) => void
  onDelete: (h: Webhook) => void
  onOpenLog: (h: Webhook | null) => void
  onRefreshLog: () => void
  onRedeliver: (d: WebhookDelivery) => void
  onPolicyChange: (allow: boolean) => void
}

const TONE: Record<WebhookTone, string> = {
  ok: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200',
  warn: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
  off: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
}

const DELIVERY_TONE: Record<WebhookDelivery['status'], string> = {
  delivered: TONE.ok,
  pending: TONE.off,
  retry: TONE.warn,
  failed: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-200',
}

/** Pure rendering of the Webhooks section; all state lives in WebhooksPanel. */
export function WebhooksView(p: WebhooksViewProps) {
  const disabled = !p.connected || p.busy
  const projectName = (id: string | null) => (id ? p.projects.find((x) => x.id === id)?.name ?? 'Unknown project' : 'All projects')

  function onDialogKey(e: KeyboardEvent<HTMLElement>, close: () => void) {
    if (e.key === 'Escape') {
      e.preventDefault()
      close()
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    p.onSave()
  }

  const draft = p.draft
  return (
    <section className="space-y-3" aria-labelledby="webhooks-heading">
      <HelpHeading screen="settings/webhooks" id="webhooks-heading" className="font-semibold">Webhooks</HelpHeading>
      <p className="text-sm text-slate-500">
        Notify Home Assistant, n8n or any HTTP endpoint when your tasks and projects change. Each request is signed with the
        webhook's secret; see docs/webhooks.md for how to verify it.
      </p>

      {!p.connected && (
        <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200" role="status">
          You are offline. Webhooks are delivered by the server, so changing or testing them requires a connection. The list below is the last one fetched.
        </p>
      )}

      {p.isOwner && (
        <label className="flex items-start gap-2 rounded-md border border-slate-200 p-3 text-sm dark:border-slate-800">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={p.allowPrivate === true}
            disabled={disabled || p.allowPrivate === null}
            onChange={(e) => p.onPolicyChange(e.target.checked)}
          />
          <span>
            <span className="font-medium">Allow private network targets</span>
            <span className="block text-slate-500">
              Owner setting for everyone on this server. Needed when a receiver runs on your LAN or this machine (for example Home Assistant at 192.168.x.x). Leave off on a public server.
            </span>
          </span>
        </label>
      )}

      {p.secret && (
        <div className="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm dark:border-emerald-800 dark:bg-emerald-950" role="status">
          <p className="mb-1 font-medium">Copy this signing secret now. It will not be shown again.</p>
          <div className="flex flex-wrap items-center gap-2">
            <code className="break-all" tabIndex={0} data-testid="webhook-secret">{p.secret.value}</code>
            <button type="button" className="btn-ghost border border-emerald-300 text-xs dark:border-emerald-700" onClick={p.onCopySecret}>
              {p.copied ? 'Copied' : 'Copy secret'}
            </button>
            <button type="button" className="btn-ghost text-xs" onClick={p.onDismissSecret}>Done</button>
          </div>
        </div>
      )}
      {p.error && <p className="text-sm text-red-600 dark:text-red-400" role="alert">{p.error}</p>}

      {draft ? (
        <form
          role="dialog"
          aria-labelledby="webhook-form-heading"
          onSubmit={submit}
          onKeyDown={(e) => onDialogKey(e, () => p.onDraftChange(null))}
          className="space-y-3 rounded-md border border-slate-200 p-3 dark:border-slate-800"
        >
          <h3 id="webhook-form-heading" className="text-sm font-semibold">{draft.id ? 'Edit webhook' : 'New webhook'}</h3>
          <label className="block text-sm">
            <span className="mb-1 block text-slate-600 dark:text-slate-300">Target URL</span>
            <input
              className="input"
              type="url"
              required
              autoFocus
              placeholder="https://n8n.example.com/webhook/…"
              value={draft.url}
              onChange={(e) => p.onDraftChange({ ...draft, url: e.target.value })}
              disabled={disabled}
            />
          </label>
          {insecureTarget(draft.url) && (
            <p className="text-xs text-amber-700 dark:text-amber-300" role="note">
              This is a plain http:// address: task content will travel unencrypted. Prefer https:// unless the receiver is on a network you trust.
            </p>
          )}
          <fieldset className="text-sm">
            <legend className="mb-1 text-slate-600 dark:text-slate-300">Events</legend>
            <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
              {WEBHOOK_EVENTS.map(({ event, label }) => (
                <label key={event} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={draft.events.includes(event)}
                    onChange={() => p.onDraftChange({ ...draft, events: toggleEvent(draft.events, event) })}
                    disabled={disabled}
                  />
                  {label} <code className="text-xs text-slate-400">{event}</code>
                </label>
              ))}
            </div>
          </fieldset>
          <label className="block text-sm">
            <span className="mb-1 block text-slate-600 dark:text-slate-300">Only for project</span>
            <select
              className="input max-w-xs"
              value={draft.projectId ?? ''}
              onChange={(e) => p.onDraftChange({ ...draft, projectId: e.target.value || null })}
              disabled={disabled}
            >
              <option value="">All projects</option>
              {p.projects.map((pr) => <option key={pr.id} value={pr.id}>{pr.name}</option>)}
            </select>
          </label>
          {draft.id && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={draft.enabled} onChange={(e) => p.onDraftChange({ ...draft, enabled: e.target.checked })} disabled={disabled} />
              Enabled
            </label>
          )}
          <div className="flex gap-2">
            <button className="btn-primary" disabled={disabled || draft.events.length === 0 || !draft.url.trim()}>
              {p.busy ? 'Saving…' : draft.id ? 'Save' : 'Create webhook'}
            </button>
            <button type="button" className="btn-ghost" onClick={() => p.onDraftChange(null)}>Cancel</button>
          </div>
        </form>
      ) : (
        <button type="button" className="btn-primary" disabled={disabled} onClick={() => p.onDraftChange(emptyDraft())}>Add webhook</button>
      )}

      <ul className="divide-y divide-slate-200 dark:divide-slate-800" aria-label="Webhooks">
        {p.webhooks?.map((h) => {
          const st = webhookStatus(h)
          const result = p.testResults[h.id]
          return (
            <li key={h.id} className="space-y-1 py-2 text-sm">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${TONE[st.tone]}`}>{st.label}</span>
                <span className="min-w-0 flex-1 truncate font-mono text-xs" title={h.url}>{h.url}</span>
              </div>
              <p className="text-xs text-slate-500">
                {h.events.join(', ')} · {projectName(h.projectId)}
              </p>
              <div className="flex flex-wrap gap-1">
                <button type="button" className="btn-ghost text-xs" disabled={disabled} onClick={() => p.onTest(h)}>Send test</button>
                <button type="button" className="btn-ghost text-xs" onClick={() => p.onOpenLog(p.log?.webhookId === h.id ? null : h)} aria-expanded={p.log?.webhookId === h.id}>
                  Delivery log
                </button>
                <button
                  type="button"
                  className="btn-ghost text-xs"
                  disabled={disabled}
                  onClick={() => p.onDraftChange({ id: h.id, url: h.url, events: h.events, projectId: h.projectId, enabled: h.enabled })}
                >
                  Edit
                </button>
                <button type="button" className="btn-ghost text-xs" disabled={disabled} onClick={() => p.onToggleEnabled(h)}>
                  {h.enabled ? 'Disable' : 'Enable'}
                </button>
                <button type="button" className="btn-danger text-xs" disabled={disabled} onClick={() => p.onDelete(h)}>Delete</button>
              </div>
              {result && (
                <p className={`text-xs ${result.ok ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-600 dark:text-red-400'}`} role="status">
                  {result.text}
                </p>
              )}
              {p.log?.webhookId === h.id && (
                <div
                  className="rounded-md border border-slate-200 p-2 dark:border-slate-800"
                  role="region"
                  aria-label="Delivery log"
                  onKeyDown={(e) => onDialogKey(e, () => p.onOpenLog(null))}
                >
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-500">Last 100 deliveries</span>
                    <button type="button" className="btn-ghost text-xs" disabled={!p.connected} onClick={p.onRefreshLog}>Refresh</button>
                  </div>
                  {p.log.deliveries === null && <p className="text-xs text-slate-400">Loading…</p>}
                  {p.log.deliveries?.length === 0 && <p className="text-xs text-slate-400">No deliveries yet.</p>}
                  <ul className="space-y-1">
                    {p.log.deliveries?.map((d) => (
                      <li key={d.id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
                        <span className={`rounded px-1 py-0.5 font-medium ${DELIVERY_TONE[d.status]}`}>{d.status}</span>
                        <code>{d.event}</code>
                        <span className="text-slate-400">{new Date(d.createdAt).toLocaleString()}</span>
                        <span className="text-slate-500">
                          {d.attempts} attempt{d.attempts === 1 ? '' : 's'}{deliveryOutcome(d) ? ` · ${deliveryOutcome(d)}` : ''}
                        </span>
                        {(d.status === 'delivered' || d.status === 'failed') && (
                          <button type="button" className="btn-ghost px-2 py-0.5 text-xs" disabled={disabled} onClick={() => p.onRedeliver(d)}>Redeliver</button>
                        )}
                        {d.responseExcerpt && (
                          <details className="w-full">
                            <summary className="cursor-pointer text-slate-400">Response</summary>
                            <pre className="whitespace-pre-wrap break-all text-slate-500">{d.responseExcerpt}</pre>
                          </details>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </li>
          )
        })}
        {p.webhooks && p.webhooks.length === 0 && <li className="py-2 text-sm text-slate-400">No webhooks yet. Nothing is sent until you add one.</li>}
        {p.webhooks === null && <li className="py-2 text-sm text-slate-400">{p.connected ? 'Loading…' : 'Nothing fetched yet.'}</li>}
      </ul>
      <p className="text-xs text-slate-400">Keyboard: <span className="kbd">Tab</span> reaches every action, <span className="kbd">Esc</span> closes the form or the delivery log.</p>
    </section>
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
  const [copied, setCopied] = useState(false)
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
    draft, secret, copied, testResults, log,
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
        setCopied(false)
      }
      setDraft(null)
      await load()
    }),
    onCopySecret: () => {
      if (!secret) return
      navigator.clipboard.writeText(secret.value).then(
        () => setCopied(true),
        () => setError('Could not access the clipboard; select the secret and copy it manually.'),
      )
    },
    onDismissSecret: () => {
      setSecret(null)
      setCopied(false)
    },
    onToggleEnabled: (h) => void run(async () => {
      await api.updateWebhook(h.id, { enabled: !h.enabled })
      await load()
    }),
    onTest: (h) => void run(async () => {
      setTestResults((r) => ({ ...r, [h.id]: { ok: true, text: 'Sending ping…' } }))
      const res = await api.testWebhook(h.id)
      const outcome = deliveryOutcome(res.delivery) || res.delivery.status
      setTestResults((r) => ({ ...r, [h.id]: { ok: res.ok, text: res.ok ? `Ping delivered: ${outcome}` : `Ping failed: ${outcome}` } }))
      if (log?.webhookId === h.id) await loadLog(h.id)
    }),
    onDelete: (h) => {
      if (!window.confirm(`Delete the webhook to ${h.url}? Its delivery log is deleted too.`)) return
      void run(async () => {
        await api.deleteWebhook(h.id)
        if (log?.webhookId === h.id) setLog(null)
        await load()
      })
    },
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
  return <WebhooksView {...props} />
}
