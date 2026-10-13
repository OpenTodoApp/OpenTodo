import { useCallback, useEffect, useState } from 'react'
import { HelpHeading } from './help/HelpLink'
import { api, isNetworkError } from '../lib/api'
import {
  cacheAccess, cacheStatus, connectionSnippet, describeAssistantsError, loadCachedAccess, loadCachedStatus, writesAllowed,
  type AgentAccess, type McpStatus,
} from '../lib/assistants'
import { useOnline } from '../lib/online'

export type CopyTarget = 'endpoint' | 'token' | 'snippet'

export interface AssistantsViewProps {
  isOwner: boolean
  /** False while offline or while the server is unreachable: actions are disabled. */
  connected: boolean
  status: McpStatus | null
  /** The user's own "Allow AI assistants to make changes" switch (null until fetched). */
  access: AgentAccess | null
  busy: boolean
  error: string | null
  /** A token created here, shown exactly once, and its kind. */
  secret: string | null
  secretScope?: 'read' | 'agent'
  copied: CopyTarget | null
  onToggle: (enabled: boolean) => void
  /** Owner: "AI assistants may make changes". */
  onToggleWrites: (enabled: boolean) => void
  /** Everyone: their own switch. */
  onToggleAccess: (allow: boolean) => void
  onCreateToken: (scope: 'read' | 'agent') => void
  onCopy: (target: CopyTarget, text: string) => void
  onDismissSecret: () => void
}

/** Pure rendering of Settings → AI assistants; state lives in AssistantsPanel. */
export function AssistantsView(p: AssistantsViewProps) {
  // Offline disables the controls; a request in flight only ignores input, so
  // keyboard focus stays on the control instead of falling back to the page.
  const disabled = !p.connected
  const endpoint = p.status?.endpoint ?? ''
  const snippet = endpoint ? connectionSnippet(endpoint, p.secret) : ''
  const copyLabel = (t: CopyTarget, label: string) => (p.copied === t ? 'Copied' : label)
  const ownerWrites = !!p.status?.writes_enabled
  const canOfferAgent = writesAllowed(p.status, p.access)
  return (
    <section className="space-y-3" aria-labelledby="assistants-heading">
      <HelpHeading screen="settings/assistants" id="assistants-heading" className="font-semibold">AI assistants</HelpHeading>
      <p className="text-sm text-muted">
        Let an AI assistant that supports the Model Context Protocol (MCP) read your projects and tasks, for questions like
        “what is on my plate today?”. By default access is read-only. If the server owner and you both allow it, an assistant
        with its own token can also make changes. The assistant connects to this server with a token you create; the server
        itself contacts no one. See docs/mcp.md.
      </p>

      {!p.connected && (
        <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200" role="status">
          You are offline. These settings live on the server; what you see is the last state fetched, and changing them needs a connection.
        </p>
      )}

      {p.status === null ? (
        <p className="text-sm text-faint">{p.connected ? 'Loading…' : 'Nothing fetched yet.'}</p>
      ) : p.isOwner ? (
        <div className="space-y-2">
          <label className="flex items-start gap-2 rounded-md border border-slate-200 p-3 text-sm dark:border-slate-800">
            <input type="checkbox" className="mt-0.5" checked={p.status.enabled} disabled={disabled}
              aria-busy={p.busy} onChange={(e) => { if (!p.busy) p.onToggle(e.target.checked) }} />
            <span>
              <span className="font-medium">Allow AI assistants (MCP endpoint)</span>
              <span className="block text-muted">
                {p.status.enabled
                  ? 'On: every account on this server can connect an assistant with its own token and sees only its own data.'
                  : 'Off: the endpoint answers “not found” until you turn it on.'}
              </span>
            </span>
          </label>
          {p.status.enabled && (
            <label className="flex items-start gap-2 rounded-md border border-slate-200 p-3 text-sm dark:border-slate-800">
              <input type="checkbox" className="mt-0.5" checked={ownerWrites} disabled={disabled}
                aria-busy={p.busy} onChange={(e) => { if (!p.busy) p.onToggleWrites(e.target.checked) }} />
              <span>
                <span className="font-medium">AI assistants may make changes</span>
                <span className="block text-muted">
                  {ownerWrites
                    ? 'On: each person can let an assistant with a dedicated token create, edit, complete, reschedule and move their tasks.'
                    : 'Off: assistants can only read, whatever people choose for their own account.'}
                </span>
              </span>
            </label>
          )}
        </div>
      ) : (
        <p className="rounded-md border border-slate-200 p-3 text-sm dark:border-slate-800" role="status">
          {p.status.enabled
            ? `The server owner has enabled AI assistant access${ownerWrites ? ' and allows assistants to make changes' : ' (read-only)'}. Your assistant sees only your own projects and the shared projects you are a member of.`
            : 'The server owner has not enabled AI assistant access on this server, so assistants cannot connect yet.'}
        </p>
      )}

      {p.status?.enabled && (
        <div className="space-y-2 rounded-md border border-slate-200 p-3 text-sm dark:border-slate-800">
          <label className="flex items-start gap-2">
            <input type="checkbox" className="mt-0.5" checked={!!p.access?.allow_writes} disabled={disabled || p.access === null}
              aria-busy={p.busy} aria-describedby="assistant-writes-help"
              onChange={(e) => { if (!p.busy) p.onToggleAccess(e.target.checked) }} />
            <span className="font-medium">Allow AI assistants to make changes to my tasks</span>
          </label>
          <div id="assistant-writes-help" className="space-y-1 text-muted">
            <p>
              An assistant with a token for making changes can create, edit, complete, reschedule and move tasks, create
              projects and labels, and comment. It cannot delete anything permanently or change sharing, members, tokens or
              settings, and it can move to the Trash only tasks it created. Every change shows in the task’s history as made by
              an AI assistant and can be undone. Text in your tasks could try to mislead an assistant, so the server limits
              what it can do (at most 50 items per request) rather than trusting it.
            </p>
            {!ownerWrites && <p>The server owner has not allowed assistants to make changes, so this has no effect yet.</p>}
            <p>Turning this off stops all your assistants from making changes at once, without revoking their tokens.</p>
          </div>
        </div>
      )}

      {p.status && (
        <div className="space-y-2 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-muted">Endpoint</span>
            <code className="break-all rounded bg-slate-100 px-1 dark:bg-slate-800">{endpoint}</code>
            <button type="button" className="btn-ghost text-xs" onClick={() => p.onCopy('endpoint', endpoint)}>{copyLabel('endpoint', 'Copy URL')}</button>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-primary" disabled={disabled}
              aria-busy={p.busy} onClick={() => { if (!p.busy) p.onCreateToken('read') }}>Create read-only token</button>
            {canOfferAgent && (
              <button type="button" className="btn-ghost" disabled={disabled}
                aria-busy={p.busy} onClick={() => { if (!p.busy) p.onCreateToken('agent') }}>Create a token for an assistant that can make changes</button>
            )}
          </div>
        </div>
      )}

      {p.secret && (
        <div className="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm dark:border-emerald-800 dark:bg-emerald-950" role="status">
          <p className="mb-1 font-medium">
            {p.secretScope === 'agent'
              ? 'Copy this token for an assistant that can make changes now. It will not be shown again.'
              : 'Copy this read-only token now. It will not be shown again.'}
          </p>
          <code className="break-all">{p.secret}</code>
          <div className="mt-2 flex gap-2">
            <button type="button" className="btn-ghost text-xs" onClick={() => p.onCopy('token', p.secret ?? '')}>{copyLabel('token', 'Copy token')}</button>
            <button type="button" className="btn-ghost text-xs" onClick={p.onDismissSecret}>Done</button>
          </div>
        </div>
      )}

      {p.error && <p className="text-sm text-red-600 dark:text-red-400" role="alert">{p.error}</p>}

      {p.status && (
        <details className="text-sm">
          <summary className="cursor-pointer text-slate-600 dark:text-slate-300">Connection instructions</summary>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-muted">
            <li>Create a token above (or under Settings → Integrations → API tokens).</li>
            <li>In your assistant, add a remote MCP server (“streamable HTTP”) with the endpoint URL.</li>
            <li>Send the token as the header <code>Authorization: Bearer &lt;token&gt;</code>. Clients that take a JSON entry accept:</li>
          </ol>
          <pre className="mt-2 overflow-x-auto rounded bg-slate-100 p-2 text-xs dark:bg-slate-800" data-scroll-x>{snippet}</pre>
          <button type="button" className="btn-ghost mt-1 text-xs" onClick={() => p.onCopy('snippet', snippet)}>{copyLabel('snippet', 'Copy configuration')}</button>
          <p className="mt-2 text-xs text-faint">
            Tell the assistant your time zone: due dates are evaluated in the time zone it passes (UTC otherwise). Changes made offline on a device appear once it syncs.
          </p>
        </details>
      )}
    </section>
  )
}

/** Settings → AI assistants: the owner's switches, the user's switch, the endpoint and token shortcuts. */
export function AssistantsPanel({ isOwner, onTokenCreated }: { isOwner: boolean; onTokenCreated?: () => void }) {
  const online = useOnline()
  const [status, setStatus] = useState<McpStatus | null>(null)
  const [access, setAccess] = useState<AgentAccess | null>(null)
  const [secretScope, setSecretScope] = useState<'read' | 'agent'>('read')
  const [unreachable, setUnreachable] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [secret, setSecret] = useState<string | null>(null)
  const [copied, setCopied] = useState<CopyTarget | null>(null)

  const load = useCallback(async () => {
    try {
      const s = await api.getMcpSettings()
      setStatus(s)
      setUnreachable(false)
      void cacheStatus(s)
      const a = await api.getAgentAccess()
      setAccess(a)
      void cacheAccess(a)
    } catch (err) {
      if (isNetworkError(err)) setUnreachable(true)
      else setError(describeAssistantsError(err))
    }
  }, [])
  useEffect(() => {
    void loadCachedStatus().then((cached) => setStatus((cur) => cur ?? cached))
    void loadCachedAccess().then((cached) => setAccess((cur) => cur ?? cached))
  }, [])
  useEffect(() => {
    if (online) void load()
  }, [online, load])

  async function run(action: () => Promise<void>) {
    setError(null)
    setBusy(true)
    try {
      await action()
    } catch (err) {
      if (isNetworkError(err)) setUnreachable(true)
      setError(describeAssistantsError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AssistantsView
      isOwner={isOwner} connected={online && !unreachable} status={status} access={access} busy={busy} error={error}
      secret={secret} secretScope={secretScope} copied={copied}
      onToggle={(enabled) => void run(async () => {
        const s = await api.setMcpSettings(enabled)
        setStatus(s)
        void cacheStatus(s)
      })}
      onToggleWrites={(enabled) => void run(async () => {
        const s = await api.setMcpWrites(enabled)
        setStatus(s)
        void cacheStatus(s)
        setAccess((a) => (a ? { ...a, owner_allows_writes: !!s.writes_enabled } : a))
      })}
      onToggleAccess={(allow) => void run(async () => {
        const a = await api.setAgentAccess(allow)
        setAccess(a)
        void cacheAccess(a)
      })}
      onCreateToken={(scope) => void run(async () => {
        const res = await api.createToken(scope === 'agent' ? 'AI assistant (can make changes)' : 'AI assistant', scope)
        setSecret(res.secret)
        setSecretScope(scope)
        setCopied(null)
        onTokenCreated?.()
      })}
      onCopy={(target, text) => {
        navigator.clipboard.writeText(text).then(
          () => setCopied(target),
          () => setError('Could not access the clipboard; select the text and copy it manually.'),
        )
      }}
      onDismissSecret={() => {
        setSecret(null)
        setCopied(null)
      }}
    />
  )
}
