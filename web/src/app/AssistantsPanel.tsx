import { useCallback, useEffect, useState } from 'react'
import { Skeleton } from '../ui'
import { Button } from '../ui'
import { Badge } from '../ui'
import { Notice } from '../ui'
import { SettingRow, SettingsSection } from '../ui'
import { Switch } from '../ui'
import { SecretReveal } from './TokensSection'
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

/** Pure rendering of Settings → Integrations → AI assistants; state lives in AssistantsPanel. */
export function AssistantsView(p: AssistantsViewProps) {
  // Offline disables the controls; a request in flight only ignores input, so
  // keyboard focus stays on the control instead of falling back to the page.
  const disabled = !p.connected
  const endpoint = p.status?.endpoint ?? ''
  const snippet = endpoint ? connectionSnippet(endpoint, p.secret) : ''
  const copyLabel = (t: CopyTarget, label: string) => (p.copied === t ? 'Copied' : label)
  const ownerWrites = !!p.status?.writes_enabled
  const canOfferAgent = writesAllowed(p.status, p.access)
  const guard = (fn: (v: boolean) => void) => (v: boolean) => { if (!p.busy) fn(v) }
  return (
    <SettingsSection title="AI assistants" headingId="assistants-heading" testId="assistants-panel"
      description="Let an assistant that supports the Model Context Protocol (MCP) read your projects and tasks with a token you create. Read-only by default; the server itself contacts no one.">
      {!p.connected && (
        <Notice>You are offline. These settings live on the server; what you see is the last state fetched, and changing them needs a connection.</Notice>
      )}

      {p.status === null ? (
        p.connected ? <Skeleton shape="line" count={3} label="Loading assistant access" /> : <p className="py-2 text-meta text-faint">Nothing fetched yet.</p>
      ) : p.isOwner ? (
        <>
          <SettingRow label="Allow AI assistants (MCP endpoint)"
            description={p.status.enabled
              ? 'On: every account on this server can connect an assistant with its own token and sees only its own data.'
              : 'Off: the endpoint answers “not found” until you turn it on.'}
            control={<Switch checked={p.status.enabled} disabled={disabled} onChange={guard(p.onToggle)} label="Allow AI assistants (MCP endpoint)" hideLabel />} />
          {p.status.enabled && (
            <SettingRow label="AI assistants may make changes"
              description={ownerWrites
                ? 'On: each person can let an assistant with a dedicated token create, edit, complete, reschedule and move their tasks.'
                : 'Off: assistants can only read, whatever people choose for their own account.'}
              control={<Switch checked={ownerWrites} disabled={disabled} onChange={guard(p.onToggleWrites)} label="AI assistants may make changes" hideLabel />} />
          )}
        </>
      ) : (
        <SettingRow label="On this server" status={
          <span className="flex flex-wrap items-center gap-2">
            <Badge hue={p.status.enabled ? 'green' : 'slate'}>{p.status.enabled ? (ownerWrites ? 'On, can make changes' : 'On, read-only') : 'Off'}</Badge>
            <span>{p.status.enabled
              ? `The server owner has enabled AI assistant access${ownerWrites ? ' and allows assistants to make changes' : ' (read-only)'}. Your assistant sees only your own projects and the shared projects you are a member of.`
              : 'The server owner has not enabled AI assistant access on this server, so assistants cannot connect yet.'}</span>
          </span>
        } />
      )}

      {p.status?.enabled && (
        <SettingRow label="Allow AI assistants to make changes to my tasks"
          description={(
            <span id="assistant-writes-help" className="block space-y-1">
              <span className="block">
                An assistant with a token for making changes can create, edit, complete, reschedule and move tasks, create
                projects and labels, and comment. It cannot delete anything permanently or change sharing, members, tokens or
                settings, and it can move to the Trash only tasks it created. Every change shows in the task’s history as made by
                an AI assistant and can be undone. The server limits what it can do (at most 50 items per request).
              </span>
              {!ownerWrites && <span className="block">The server owner has not allowed assistants to make changes, so this has no effect yet.</span>}
              <span className="block">Turning this off stops all your assistants from making changes at once, without revoking their tokens.</span>
            </span>
          )}
          control={(
            <Switch checked={!!p.access?.allow_writes} disabled={disabled || p.access === null} onChange={guard(p.onToggleAccess)}
              label="Allow AI assistants to make changes to my tasks" hideLabel describedBy="assistant-writes-help" />
          )} />
      )}

      {p.status && (
        <>
          <SettingRow label="Endpoint" status={<code className="break-all rounded-chip bg-sunken px-1.5 py-0.5 font-mono text-meta text-default">{endpoint}</code>}
            control={<Button size="sm" icon="copy" onClick={() => p.onCopy('endpoint', endpoint)}>{copyLabel('endpoint', 'Copy URL')}</Button>} />
          <SettingRow label="Token for an assistant" description="Creates an API token that you paste into the assistant. Read-only is the safe default."
            control={(
              <span className="flex flex-wrap justify-end gap-2">
                <Button variant="primary" disabled={disabled} busy={p.busy} onClick={() => p.onCreateToken('read')}>Create read-only token</Button>
                {canOfferAgent && (
                  <Button variant="secondary" disabled={disabled} busy={p.busy} onClick={() => p.onCreateToken('agent')}>Create a token for an assistant that can make changes</Button>
                )}
              </span>
            )} />
        </>
      )}

      {p.secret && (
        <div className="space-y-2 py-3">
          <SecretReveal what={p.secretScope === 'agent' ? 'token for an assistant that can make changes' : 'read-only token'} secret={p.secret} />
          <div className="flex justify-end"><Button size="sm" variant="ghost" onClick={p.onDismissSecret}>Done</Button></div>
        </div>
      )}

      {p.error && <Notice tone="danger">{p.error}</Notice>}

      {p.status && (
        <details className="py-3 text-sm">
          <summary className="cursor-pointer font-medium text-default">Connection instructions</summary>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-muted">
            <li>Create a token above (or under Settings → Integrations → API tokens).</li>
            <li>In your assistant, add a remote MCP server (“streamable HTTP”) with the endpoint URL.</li>
            <li>Send the token as the header <code>Authorization: Bearer &lt;token&gt;</code>. Clients that take a JSON entry accept:</li>
          </ol>
          <pre className="mt-2 overflow-x-auto rounded-control bg-sunken p-2 font-mono text-meta text-default" data-scroll-x>{snippet}</pre>
          <Button size="sm" variant="ghost" icon="copy" className="mt-1" onClick={() => p.onCopy('snippet', snippet)}>{copyLabel('snippet', 'Copy configuration')}</Button>
          <p className="mt-2 text-meta text-faint">
            Tell the assistant your time zone: due dates are evaluated in the time zone it passes (UTC otherwise). Changes made offline on a device appear once it syncs.
          </p>
        </details>
      )}
    </SettingsSection>
  )
}

/** Settings → Integrations → AI assistants: the owner's switches, the user's switch, the endpoint and token shortcuts. */
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
