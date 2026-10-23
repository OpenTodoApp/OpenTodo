import { useCallback, useEffect, useState } from 'react'
import { Button, Card, ConfirmDialog, Icon, Menu, MenuItem, Notice, SettingRow, SettingsSection, Switch, type HueName, StatusIndicator, toneForHue } from '../ui'
import { api, ApiError, isNetworkError } from '../lib/api'
import { cachedIssueConnections, cacheIssueConnections, useProjects } from '../lib/localData'
import { useEncryption } from '../lib/e2ee'
import { useOnline } from '../lib/online'
import { formatClock } from '../lib/dates'
import type { IssueConnection, Project } from '../lib/types'
import { t } from '../lib/i18n'
import { cardCopy, noticeCopy, rowCopy } from '../lib/settingsCopy'
import { ago } from './CalendarFeedsPanel'
import { draftBody, draftError, draftOf, IssueEditor, intervalLabel, newDraft, type FieldErrorState, type IssueDraft } from './IssueEditor'
import { useSettingsPending } from './settingsPending'

// Settings → Integrations → Issues (OpenSpec change issue-import, design D13): the
// owner's switch and the user's GitHub and GitLab connections as cards that lead with
// their state. The pure IssuesView renders every state; IssuesPanel loads and acts.
// Connections are server data: offline, the last loaded cards stay with actions off.

export const MAX_CONNECTIONS = 5

/** A stored reason (issue-connections design D10) as a sentence. */
export function reasonText(reason: string): string {
  switch (reason) {
    case 'unauthorized_provider': return t('The provider refused the token. Enter a new one.')
    case 'token_missing': return t('No token is stored, for example after a restore. Enter it again.')
    case 'private_target': return t('The host is on a private network the server owner has not allowed.')
    case 'redirect_refused': return t('The host answered with a redirect, which is never followed.')
    case 'too_large': return t('The provider sent more than 2 MB at once.')
    case 'provider_rate_limited': return t("The provider's rate limit was reached.")
    case 'encrypted_account': return t('Stopped because this account uses end-to-end encryption.')
    case 'timeout': return t('The host did not answer in time.')
    case 'connection_failed': return t('The host could not be reached.')
    case 'invalid_response': return t('The host did not answer like GitHub or GitLab.')
    case 'provider_not_found': return t('A repository or project was not found.')
    case 'limit_storage': case 'limit_ops_hour': case 'limit_ops_total': return t('This server reached a limit; the rest follows later.')
  }
  return t('Error: {reason}', { reason })
}

const STATE: Record<IssueConnection['state'] | 'polling', { hue: HueName; label: () => string }> = {
  off: { hue: 'slate', label: () => t('Off') },
  pending: { hue: 'slate', label: () => t('Waiting') },
  ok: { hue: 'green', label: () => t('Up to date') },
  failed: { hue: 'red', label: () => t('Failed') },
  stopped: { hue: 'orange', label: () => t('Stopped') },
  polling: { hue: 'blue', label: () => t('Polling') },
}

/** The card's first line: what the state means right now. */
export function stateLine(c: IssueConnection, now = Date.now()): string {
  const last = c.last_success_at ? t('last success {ago}', { ago: ago(c.last_success_at, now) }) : t('never succeeded')
  if (c.state === 'off') return t('Disabled; nothing is polled.')
  if (c.state === 'stopped') return reasonText(c.stopped_reason)
  if (c.state === 'failed') {
    const when = c.last_error === 'provider_rate_limited' ? t('resumes {when}', { when: formatClock(c.next_poll_at, false) }) : last
    return `${reasonText(c.last_error)} · ${when}`
  }
  if (c.state === 'ok' && c.last_success_at) return t('Checked {ago}', { ago: ago(c.last_success_at, now) })
  return t('Waiting for the first poll')
}

/** The filter in words: "Assigned to you", "3 repositories · label bug". */
export function filterText(c: IssueConnection): string {
  const f = c.filter
  const parts = [f.scope === 'repositories' ? t('{n, plural, one {# repository} other {# repositories}}', { n: f.repositories.length }) : t('Assigned to you')]
  if (f.labels.length) parts.push(t('{n, plural, one {label} other {labels}} {labels}', { n: f.labels.length, labels: f.labels.join(', ') }))
  return parts.join(' · ')
}

export function runText(c: IssueConnection): string | null {
  const r = c.last_run
  if (!r) return null
  const counts = t('Last run: {created} created, {completed} completed, {reopened} reopened, {renamed} renamed', r as unknown as Record<string, number>)
  return r.partial ? `${counts} · ${t('partial, the rest follows')}` : counts
}

export interface IssuesViewProps {
  isOwner: boolean
  /** null while unknown (offline before the first load). */
  enabled: boolean | null
  connected: boolean
  encrypted: boolean
  connections: IssueConnection[] | null
  projects: readonly Project[]
  busy: boolean
  /** Connections whose hand-triggered poll is running. */
  polling: ReadonlySet<string>
  error: string | null
  draft: IssueDraft | null
  fieldError: FieldErrorState | null
  now?: number
  onToggle: (on: boolean) => void
  onDraftChange: (d: IssueDraft | null) => void
  onSave: () => void
  onSync: (c: IssueConnection) => void
  onTest: (c: IssueConnection) => void
  onSetEnabled: (c: IssueConnection, enabled: boolean) => void
  onDelete: (c: IssueConnection) => Promise<void> | void
}

function ConnectionCard({ c, p, disabled, onDelete }: { c: IssueConnection; p: IssuesViewProps; disabled: boolean; onDelete: () => void }) {
  const now = p.now ?? Date.now()
  const state = p.polling.has(c.id) ? 'polling' : c.state
  const project = c.project_id ? (p.projects.find((x) => x.id === c.project_id)?.name ?? t('A project')) : t('Inbox')
  const provider = c.provider === 'github' ? 'GitHub' : 'GitLab'
  const run = runText(c)
  return (
    <Card as="article" padding="none" className="p-3" aria-label={c.name} data-issue-connection={c.id}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <StatusIndicator tone={toneForHue(STATE[state].hue)}>{STATE[state].label()}</StatusIndicator>
            <span className="text-body font-medium text-default">{c.name}</span>
          </div>
          <p className="text-meta text-default" data-issue-state>{stateLine(c, now)}</p>
          <p className="text-meta text-muted">{[provider, c.host.replace(/^https?:\/\//, ''), c.account_login && `@${c.account_login}`].filter(Boolean).join(' · ')}</p>
          <p className="text-meta text-muted">{t('Tasks go to {project} · {filter} · {interval}', { project, filter: filterText(c), interval: intervalLabel(c.interval_minutes).toLowerCase() })}</p>
          {c.can_read_issues === false && <p className="text-meta text-muted">{t('This token cannot read issues; give it read access to issues.')}</p>}
          {run && <p className="text-meta text-faint">{run}</p>}
        </div>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" icon="rotate-ccw" disabled={disabled || state === 'polling' || !c.enabled || c.state === 'stopped'} onClick={() => p.onSync(c)}>{t('Sync now')}</Button>
          <Menu label={t('Actions for {name}', { name: c.name })} trigger={<Icon name="ellipsis" />} kind="menu" triggerClassName="ui-btn ui-btn--ghost ui-btn--sm ui-btn--icon">
            <MenuItem label={t('Test token')} icon="key-round" disabled={disabled} onSelect={() => p.onTest(c)} />
            <MenuItem label={t('Edit')} icon="pencil" disabled={disabled} onSelect={() => p.onDraftChange(draftOf(c))} />
            <MenuItem label={c.enabled ? t('Disable') : t('Enable')} icon={c.enabled ? 'eye-off' : 'eye'} disabled={disabled || (!c.enabled && p.encrypted)} onSelect={() => p.onSetEnabled(c, !c.enabled)} />
            <MenuItem label={t('Delete')} icon="trash-2" danger disabled={disabled} onSelect={onDelete} />
          </Menu>
        </div>
      </div>
    </Card>
  )
}

export function IssuesView(p: IssuesViewProps) {
  const [deleting, setDeleting] = useState<IssueConnection | null>(null)
  const disabled = !p.connected || p.busy
  const on = p.enabled === true
  const list = p.connections ?? []
  return (
    <SettingsSection {...cardCopy('issues')} testId="issues-panel">
      {!p.connected && <Notice>{noticeCopy('issues', 'offline')}</Notice>}
      {p.enabled !== null && (
        <SettingRow label={rowCopy('issues', 'server', { variant: 'owner' }).label}
          description={p.isOwner || !on ? rowCopy('issues', 'server', { variant: p.isOwner ? 'owner' : 'member' }).description : undefined}
          status={<StatusIndicator tone={toneForHue(on ? 'green' : 'slate')}>{on ? t('On') : t('Off')}</StatusIndicator>}
          control={p.isOwner && <Switch checked={on} disabled={disabled} onChange={p.onToggle} label={t('Allow issue connections on this server')} hideLabel />} />
      )}
      {p.error && !p.draft && <Notice tone="danger">{p.error}</Notice>}
      {on && (
        <>
          <SettingRow {...rowCopy('issues', 'connections')}
            status={p.connections ? <span className="text-muted">{t('{n} of {max}', { n: list.length, max: MAX_CONNECTIONS })}</span> : undefined}
            control={<Button size="sm" icon="plus" disabled={disabled || p.encrypted || list.length >= MAX_CONNECTIONS} onClick={() => p.onDraftChange(newDraft())}>{t('Connect issues')}</Button>} />
          {p.encrypted && <Notice>{noticeCopy('issues', 'encrypted')}</Notice>}
          {list.length > 0 && (
            <div className="space-y-2 py-3" data-testid="issue-connections">
              {list.map((c) => <ConnectionCard key={c.id} c={c} p={p} disabled={disabled} onDelete={() => setDeleting(c)} />)}
            </div>
          )}
        </>
      )}
      {p.draft && (
        <IssueEditor draft={p.draft} projects={p.projects} busy={p.busy} connected={p.connected} error={p.fieldError} general={p.fieldError ? null : p.error}
          onChange={(d) => p.onDraftChange(d)} onSave={p.onSave} onClose={() => p.onDraftChange(null)}
          onTest={() => { const c = p.connections?.find((x) => x.id === p.draft?.id); if (c) p.onTest(c) }} />
      )}
      {deleting && (
        <ConfirmDialog title={t('Delete {name}?', { name: deleting.name })} confirmLabel={t('Delete')}
          consequence={t('The token is removed from the server and nothing is polled any more. The {n, plural, one {# task} other {# tasks}} it created stay as ordinary tasks.', { n: deleting.task_count })}
          onConfirm={async () => { await p.onDelete(deleting); setDeleting(null) }} onCancel={() => setDeleting(null)} />
      )}
    </SettingsSection>
  )
}

function describe(err: unknown): string {
  if (err instanceof ApiError) return err.message.charAt(0).toUpperCase() + err.message.slice(1)
  if (isNetworkError(err)) return t('The server could not be reached.')
  return t('Something went wrong.')
}

/** A server answer naming a field, as the editor shows it beside that field. */
function fieldErrorOf(err: unknown): FieldErrorState | null {
  if (!(err instanceof ApiError)) return null
  if (err.field) return { field: err.field, message: err.serverMessage.replace(new RegExp(`^${err.field}: `), '') }
  if (err.code === 'private_target') return { field: 'host', message: err.message }
  return null
}

export function IssuesPanel({ isOwner }: { isOwner: boolean }) {
  const online = useOnline()
  const projects = useProjects()
  const { enabled: encrypted } = useEncryption()
  const [enabled, setEnabled] = useState<boolean | null>(null)
  const [connections, setConnections] = useState<IssueConnection[] | null>(null)
  useSettingsPending(enabled === null || connections === null)
  const [unreachable, setUnreachable] = useState(false)
  const [busy, setBusy] = useState(false)
  const [polling, setPolling] = useState<ReadonlySet<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [fieldError, setFieldError] = useState<FieldErrorState | null>(null)
  const [draft, setDraft] = useState<IssueDraft | null>(null)

  const keep = useCallback((list: IssueConnection[]) => {
    setConnections(list)
    void cacheIssueConnections(list).catch(() => undefined)
  }, [])
  const load = useCallback(async () => {
    try {
      const { enabled: on } = await api.getIssuesSetting()
      setEnabled(on)
      setUnreachable(false)
      if (on) keep((await api.listIssueConnections()).connections)
    } catch (err) {
      if (isNetworkError(err)) setUnreachable(true)
      else setError(describe(err))
    }
  }, [keep])
  useEffect(() => {
    void cachedIssueConnections().then((cached) => {
      if (cached.length) {
        setConnections((cur) => cur ?? cached)
        setEnabled((cur) => cur ?? true)
      }
    }).catch(() => undefined)
  }, [])
  useEffect(() => {
    if (online) void load()
  }, [online, load])

  const connected = online && !unreachable
  const upsert = (c: IssueConnection) => {
    const list = connections ?? []
    keep(list.some((x) => x.id === c.id) ? list.map((x) => (x.id === c.id ? c : x)) : [...list, c])
  }
  async function act(action: () => Promise<void>) {
    setError(null)
    setFieldError(null)
    setBusy(true)
    try {
      await action()
    } catch (err) {
      if (isNetworkError(err)) setUnreachable(true)
      setError(describe(err))
      setFieldError(fieldErrorOf(err))
      throw err
    } finally {
      setBusy(false)
    }
  }
  const quiet = (action: () => Promise<void>) => act(action).catch(() => undefined)
  const poll = (c: IssueConnection, action: () => Promise<void>) => {
    setPolling((s) => new Set(s).add(c.id))
    void quiet(action).finally(() => setPolling((s) => { const n = new Set(s); n.delete(c.id); return n }))
  }

  return (
    <IssuesView isOwner={isOwner} enabled={enabled} connected={connected} encrypted={encrypted} connections={connections} projects={projects}
      busy={busy} polling={polling} error={error} draft={draft} fieldError={fieldError}
      onToggle={(on) => void quiet(async () => {
        await api.putIssuesSetting(on)
        setEnabled(on)
        if (on) await load()
      })}
      onDraftChange={(d) => { setDraft(d); setError(null); setFieldError(null) }}
      onSave={() => {
        if (!draft) return
        const local = draftError(draft)
        if (local) {
          setFieldError(local)
          setError(local.message)
          return
        }
        void quiet(async () => {
          const body = draftBody(draft)
          const res = draft.id ? await api.patchIssueConnection(draft.id, body) : await api.createIssueConnection(body)
          upsert(res.connection)
          setDraft(null)
        })
      }}
      onSync={(c) => poll(c, async () => {
        const res = await api.syncIssueConnection(c.id)
        if (res.connection) upsert(res.connection)
      })}
      onTest={(c) => poll(c, async () => {
        const res = await api.testIssueConnection(c.id)
        if (res.connection) upsert(res.connection)
      })}
      onSetEnabled={(c, on) => void quiet(async () => { upsert((await api.patchIssueConnection(c.id, { enabled: on })).connection) })}
      onDelete={(c) => act(async () => {
        await api.deleteIssueConnection(c.id)
        keep((connections ?? []).filter((x) => x.id !== c.id))
      })} />
  )
}
