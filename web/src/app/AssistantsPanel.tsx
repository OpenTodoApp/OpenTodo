import { type ReactNode, useCallback, useEffect, useState } from 'react'
import { Skeleton, StatusIndicator, toneForHue } from '../ui'
import { Button } from '../ui'
import { Notice } from '../ui'
import { SettingRow, SettingsSection } from '../ui'
import { Switch } from '../ui'
import { SecretReveal } from './TokensSection'
import { RelaySettings } from './RelaySettings'
import { api, isNetworkError } from '../lib/api'
import {
  cacheAccess, cacheStatus, connectionSnippet, describeAssistantsError, loadCachedAccess, loadCachedStatus, writesAllowed,
  type AgentAccess, type McpStatus,
} from '../lib/assistants'
import { useEncryption } from '../lib/e2ee'
import { useOnline } from '../lib/online'
import { t } from '../lib/i18n'
import { cardCopy, noticeCopy, rowCopy } from '../lib/settingsCopy'

export type CopyTarget = 'endpoint' | 'token' | 'snippet'

export interface AssistantsViewProps {
  isOwner: boolean
  /** The account uses end-to-end encryption (mcp-projects: what remote assistants can do, and ot mcp --decrypt). */
  encrypted?: boolean
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

/** The clients the third step has instructions for (mcp-server "Settings screen for assistants"). */
export type McpClient = 'desktop' | 'code' | 'other'

/** The configuration a client takes, with the endpoint and, right after creation, the token. */
export function clientSnippet(client: McpClient, endpoint: string, token?: string | null): string {
  if (client === 'code') return `claude mcp add --transport http opentodo ${endpoint} --header "Authorization: Bearer ${token || '<your token>'}"`
  return connectionSnippet(endpoint, token)
}

const CLIENTS: { id: McpClient; label: () => string }[] = [
  { id: 'desktop', label: () => 'Claude Desktop' }, { id: 'code', label: () => 'Claude Code' }, { id: 'other', label: () => t('Other MCP clients') },
]

/** One numbered step of connecting an assistant. */
function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <li className="space-y-2 py-3" data-mcp-step={n}>
      <h3 className="flex items-center gap-2 text-body font-semibold text-default">
        <span aria-hidden className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-accent-soft text-meta text-on-accent-soft">{n}</span>
        {title}
      </h3>
      {children}
    </li>
  )
}

/** The owner's switches, a group of their own above the steps. */
function OwnerSwitches({ p, disabled, guard }: { p: AssistantsViewProps; disabled: boolean; guard: (fn: (v: boolean) => void) => (v: boolean) => void }) {
  const status = p.status!
  const ownerWrites = !!status.writes_enabled
  return (
    <div className="rounded-control border border-default px-3" role="group" aria-label={t('On this server')} data-mcp-owner>
      <SettingRow {...rowCopy('assistants', 'endpoint', { variant: status.enabled ? 'on' : 'off' })}
        control={<Switch checked={status.enabled} disabled={disabled} onChange={guard(p.onToggle)} label={t('Allow AI assistants (MCP endpoint)')} hideLabel />} />
      {status.enabled && (
        <SettingRow {...rowCopy('assistants', 'writes', { variant: ownerWrites ? 'on' : 'off' })}
          control={<Switch checked={ownerWrites} disabled={disabled} onChange={guard(p.onToggleWrites)} label={t('AI assistants may make changes')} hideLabel />} />
      )}
    </div>
  )
}

function MemberStatus({ status }: { status: McpStatus }) {
  const ownerWrites = !!status.writes_enabled
  return (
    <SettingRow {...rowCopy('assistants', 'server')} status={
      <span className="flex flex-wrap items-center gap-2">
        <StatusIndicator tone={toneForHue(status.enabled ? 'green' : 'slate')}>{status.enabled ? (ownerWrites ? t('On, can make changes') : t('On, read-only')) : t('Off')}</StatusIndicator>
        <span>{status.enabled
          ? (ownerWrites ? t('The server owner has enabled AI assistant access and allows assistants to make changes. Your assistant sees only your own projects and the shared projects you are a member of.') : t('The server owner has enabled AI assistant access (read-only). Your assistant sees only your own projects and the shared projects you are a member of.'))
          : t('The server owner has not enabled AI assistant access on this server, so assistants cannot connect yet.')}</span>
      </span>
    } />
  )
}

/** The three steps: endpoint, token, the client's configuration. */
function ConnectSteps({ p, disabled }: { p: AssistantsViewProps; disabled: boolean }) {
  const [choice, setChoice] = useState<'read' | 'agent'>('read')
  const [client, setClient] = useState<McpClient>('desktop')
  const endpoint = p.status?.endpoint ?? ''
  const canOfferAgent = writesAllowed(p.status, p.access)
  const scope = canOfferAgent ? choice : 'read'
  const snippet = clientSnippet(client, endpoint, p.secret)
  const copyLabel = (item: CopyTarget, label: string) => (p.copied === item ? t('Copied') : label)
  const options: { scope: 'read' | 'agent'; label: string; line: string }[] = [
    { scope: 'read', label: t('Read only'), line: t('The assistant can read your tasks and projects but never change them.') },
    ...(canOfferAgent ? [{ scope: 'agent' as const, label: t('Can make changes'), line: t('The assistant can also add and change tasks through its tools, while you allow it.') }] : []),
  ]
  return (
    <ol className="divide-y divide-(--ot-border)" data-mcp-steps>
      <Step n={1} title={t('Endpoint')}>
        <div className="flex items-center gap-2">
          <code className="min-w-0 flex-1 break-all rounded-control border border-default bg-sunken px-3 py-2 font-mono text-meta text-default" data-mcp-endpoint>{endpoint}</code>
          <Button size="sm" icon="copy" onClick={() => p.onCopy('endpoint', endpoint)}>{copyLabel('endpoint', t('Copy URL'))}</Button>
        </div>
      </Step>
      <Step n={2} title={t('Token')}>
        <div role="radiogroup" aria-label={t('What the assistant may do')} className="space-y-1">
          {options.map((o) => (
            <label key={o.scope} className={`flex cursor-pointer items-start gap-3 rounded-control border px-3 py-2 ${scope === o.scope ? 'border-accent bg-accent-soft' : 'border-default'}`}>
              <input type="radio" name="mcp-token-scope" value={o.scope} checked={scope === o.scope} onChange={() => setChoice(o.scope)} className="mt-1" data-mcp-scope={o.scope} />
              <span className="min-w-0"><span className="block text-body font-medium text-default">{o.label}</span><span className="block text-meta text-muted">{o.line}</span></span>
            </label>
          ))}
        </div>
        {p.secret ? (
          <div className="space-y-2">
            <SecretReveal what={p.secretScope === 'agent' ? t('token for an assistant that can make changes') : t('read-only token')} secret={p.secret} />
            <div className="flex justify-end"><Button size="sm" variant="ghost" onClick={p.onDismissSecret}>{t('Done')}</Button></div>
          </div>
        ) : (
          <Button variant="primary" disabled={disabled} busy={p.busy} onClick={() => p.onCreateToken(scope)} data-mcp-create>{t('Create token')}</Button>
        )}
      </Step>
      <Step n={3} title={t('Add it to your assistant')}>
        <div role="radiogroup" aria-label={t('Assistant')} className="flex flex-wrap gap-1" data-mcp-clients>
          {CLIENTS.map((c) => (
            <button key={c.id} type="button" role="radio" aria-checked={client === c.id} onClick={() => setClient(c.id)} data-mcp-client={c.id}
              className={`rounded-control border px-3 py-1 text-meta font-medium ${client === c.id ? 'border-accent bg-accent-soft text-on-accent-soft' : 'border-default text-default hover:bg-sunken'}`}>
              {c.label()}
            </button>
          ))}
        </div>
        <p className="text-meta text-muted">{client === 'desktop'
          ? t('Settings → Developer → Edit Config, then add this entry to claude_desktop_config.json and restart Claude Desktop.')
          : client === 'code' ? t('Run this in a terminal.')
          : t('Add a remote MCP server (streamable HTTP) with the endpoint and send the token as the Authorization header. Clients that take a JSON entry accept this.')}</p>
        <pre tabIndex={0} aria-label={t('Configuration')} className="overflow-x-auto rounded-control bg-sunken p-2 font-mono text-meta text-default focus-visible:outline-2 focus-visible:outline-focus" data-scroll-x data-mcp-snippet>{snippet}</pre>
        <Button size="sm" variant="ghost" icon="copy" className="mt-1" onClick={() => p.onCopy('snippet', snippet)}>{copyLabel('snippet', t('Copy configuration'))}</Button>
        <p className="text-meta text-faint">{t('Tell the assistant your time zone: due dates are evaluated in the time zone it passes (UTC otherwise). Changes made offline on a device appear once it syncs.')}</p>
      </Step>
    </ol>
  )
}

/** Pure rendering of Settings → Integrations → AI assistants; state lives in AssistantsPanel. */
export function AssistantsView(p: AssistantsViewProps) {
  // Offline disables the controls; a request in flight only ignores input, so
  // keyboard focus stays on the control instead of falling back to the page.
  const disabled = !p.connected
  const ownerWrites = !!p.status?.writes_enabled
  const guard = (fn: (v: boolean) => void) => (v: boolean) => { if (!p.busy) fn(v) }
  return (
    <SettingsSection {...cardCopy('assistants')} testId="assistants-panel">
      {!p.connected && <Notice>{noticeCopy('assistants', 'offline')}</Notice>}
      {p.status === null ? (
        p.connected ? <Skeleton shape="line" count={3} label={t('Loading assistant access')} /> : <p className="py-2 text-meta text-faint">{t('Nothing fetched yet.')}</p>
      ) : p.isOwner ? <OwnerSwitches p={p} disabled={disabled} guard={guard} /> : <MemberStatus status={p.status} />}

      {p.status?.enabled && (
        <SettingRow label={rowCopy('assistants', 'mine', { variant: 'on' }).label}
          description={<span id="assistant-writes-help">{rowCopy('assistants', 'mine', { variant: ownerWrites ? 'on' : 'ownerOff' }).description}</span>}
          control={(
            <Switch checked={!!p.access?.allow_writes} disabled={disabled || p.access === null} onChange={guard(p.onToggleAccess)}
              label={t('Allow AI assistants to make changes to my tasks')} hideLabel describedBy="assistant-writes-help" />
          )} />
      )}

      {p.status && (p.status.enabled
        ? <ConnectSteps p={p} disabled={disabled} />
        : p.isOwner && <p className="py-3 text-meta text-muted" data-mcp-why>{t('Turn on the endpoint above to connect an assistant.')}</p>)}

      {p.error && <Notice tone="danger">{p.error}</Notice>}

      {p.encrypted && p.status?.enabled && (
        <div data-assistants-encrypted><Notice>
          {t.rich('Your account uses end-to-end encryption, so a remote assistant sees your text as “Encrypted item” and can change only colours, icons, order and dates. To let an assistant on your computer read and write your text, run {unlock} once, then connect it with {bridge}. Your AI provider then receives that text in plain form; the server still receives only ciphertext.', {
            unlock: <code>ot encryption unlock</code>, bridge: <code>ot mcp --decrypt</code>,
          })}
        </Notice></div>
      )}

      {p.encrypted && p.status?.enabled && <RelaySettings />}
    </SettingsSection>
  )
}

/** Settings → Integrations → AI assistants: the owner's switches, the user's switch, the endpoint and token shortcuts. */
export function AssistantsPanel({ isOwner, onTokenCreated }: { isOwner: boolean; onTokenCreated?: () => void }) {
  const online = useOnline()
  const encryption = useEncryption()
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
      isOwner={isOwner} encrypted={encryption.enabled} connected={online && !unreachable} status={status} access={access} busy={busy} error={error}
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
          () => setError(t('Could not access the clipboard; select the text and copy it manually.')),
        )
      }}
      onDismissSecret={() => {
        setSecret(null)
        setCopied(null)
      }}
    />
  )
}
