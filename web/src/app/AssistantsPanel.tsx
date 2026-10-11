import { useCallback, useEffect, useState } from 'react'
import { api, isNetworkError } from '../lib/api'
import {
  cacheStatus, connectionSnippet, describeAssistantsError, loadCachedStatus, type McpStatus,
} from '../lib/assistants'
import { useOnline } from '../lib/online'

export type CopyTarget = 'endpoint' | 'token' | 'snippet'

export interface AssistantsViewProps {
  isOwner: boolean
  /** False while offline or while the server is unreachable: actions are disabled. */
  connected: boolean
  status: McpStatus | null
  busy: boolean
  error: string | null
  /** A read-only token created here, shown exactly once. */
  secret: string | null
  copied: CopyTarget | null
  onToggle: (enabled: boolean) => void
  onCreateToken: () => void
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
  return (
    <section className="space-y-3" aria-labelledby="assistants-heading">
      <h2 id="assistants-heading" className="font-semibold">AI assistants</h2>
      <p className="text-sm text-slate-500">
        Let an AI assistant that supports the Model Context Protocol (MCP) read your projects and tasks, for questions like
        “what is on my plate today?”. Access is read-only: an assistant can never change anything. The assistant connects to
        this server with a token you create; the server itself contacts no one. See docs/mcp.md.
      </p>

      {!p.connected && (
        <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200" role="status">
          You are offline. This setting lives on the server; what you see is the last state fetched.
        </p>
      )}

      {p.status === null ? (
        <p className="text-sm text-slate-400">{p.connected ? 'Loading…' : 'Nothing fetched yet.'}</p>
      ) : p.isOwner ? (
        <label className="flex items-start gap-2 rounded-md border border-slate-200 p-3 text-sm dark:border-slate-800">
          <input type="checkbox" className="mt-0.5" checked={p.status.enabled} disabled={disabled}
            aria-busy={p.busy} onChange={(e) => { if (!p.busy) p.onToggle(e.target.checked) }} />
          <span>
            <span className="font-medium">Allow AI assistants (MCP endpoint)</span>
            <span className="block text-slate-500">
              {p.status.enabled
                ? 'On: every account on this server can connect an assistant with its own token and sees only its own data.'
                : 'Off: the endpoint answers “not found” until you turn it on.'}
            </span>
          </span>
        </label>
      ) : (
        <p className="rounded-md border border-slate-200 p-3 text-sm dark:border-slate-800" role="status">
          {p.status.enabled
            ? 'The server owner has enabled AI assistant access. Your assistant sees only your own projects and the shared projects you are a member of.'
            : 'The server owner has not enabled AI assistant access on this server, so assistants cannot connect yet.'}
        </p>
      )}

      {p.status && (
        <div className="space-y-2 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-slate-500">Endpoint</span>
            <code className="break-all rounded bg-slate-100 px-1 dark:bg-slate-800">{endpoint}</code>
            <button type="button" className="btn-ghost text-xs" onClick={() => p.onCopy('endpoint', endpoint)}>{copyLabel('endpoint', 'Copy URL')}</button>
          </div>
          <div>
            <button type="button" className="btn-primary" disabled={disabled}
              aria-busy={p.busy} onClick={() => { if (!p.busy) p.onCreateToken() }}>Create read-only token</button>
          </div>
        </div>
      )}

      {p.secret && (
        <div className="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm dark:border-emerald-800 dark:bg-emerald-950" role="status">
          <p className="mb-1 font-medium">Copy this read-only token now. It will not be shown again.</p>
          <code className="break-all">{p.secret}</code>
          <div className="mt-2 flex gap-2">
            <button type="button" className="btn-ghost text-xs" onClick={() => p.onCopy('token', p.secret ?? '')}>{copyLabel('token', 'Copy token')}</button>
            <button type="button" className="btn-ghost text-xs" onClick={p.onDismissSecret}>Done</button>
          </div>
        </div>
      )}

      {p.error && <p className="text-sm text-red-600" role="alert">{p.error}</p>}

      {p.status && (
        <details className="text-sm">
          <summary className="cursor-pointer text-slate-600 dark:text-slate-300">Connection instructions</summary>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-slate-500">
            <li>Create a read-only token above (or in API tokens below).</li>
            <li>In your assistant, add a remote MCP server (“streamable HTTP”) with the endpoint URL.</li>
            <li>Send the token as the header <code>Authorization: Bearer &lt;token&gt;</code>. Clients that take a JSON entry accept:</li>
          </ol>
          <pre className="mt-2 overflow-x-auto rounded bg-slate-100 p-2 text-xs dark:bg-slate-800" data-scroll-x>{snippet}</pre>
          <button type="button" className="btn-ghost mt-1 text-xs" onClick={() => p.onCopy('snippet', snippet)}>{copyLabel('snippet', 'Copy configuration')}</button>
          <p className="mt-2 text-xs text-slate-400">
            Tell the assistant your time zone: due dates are evaluated in the time zone it passes (UTC otherwise). Changes made offline on a device appear once it syncs.
          </p>
        </details>
      )}
    </section>
  )
}

/** Settings → AI assistants: the owner's MCP toggle, endpoint and read-only token shortcut. */
export function AssistantsPanel({ isOwner, onTokenCreated }: { isOwner: boolean; onTokenCreated?: () => void }) {
  const online = useOnline()
  const [status, setStatus] = useState<McpStatus | null>(null)
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
    } catch (err) {
      if (isNetworkError(err)) setUnreachable(true)
      else setError(describeAssistantsError(err))
    }
  }, [])
  useEffect(() => {
    void loadCachedStatus().then((cached) => setStatus((cur) => cur ?? cached))
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
      isOwner={isOwner} connected={online && !unreachable} status={status} busy={busy} error={error} secret={secret} copied={copied}
      onToggle={(enabled) => void run(async () => {
        const s = await api.setMcpSettings(enabled)
        setStatus(s)
        void cacheStatus(s)
      })}
      onCreateToken={() => void run(async () => {
        const res = await api.createToken('AI assistant', 'read')
        setSecret(res.secret)
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
