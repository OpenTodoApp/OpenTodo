import { type FormEvent, useCallback, useEffect, useState } from 'react'
import { api, ApiError } from '../lib/api'
import { scopeLabel, type ApiToken, type TokenScope } from '../lib/assistants'
import { Button } from '../ui/Button'
import { Badge } from '../ui/Card'
import { Field, Input, Select } from '../ui/Field'
import { Icon } from '../ui/Icon'
import { MenuItem } from '../ui/Menu'
import { ConfirmDialog } from '../ui/patterns/ConfirmDialog'
import { EmptyState } from '../ui/patterns/EmptyState'
import { ListRow } from '../ui/patterns/ListRow'
import { Notice } from '../ui/patterns/Notice'
import { SettingsSection } from '../ui/patterns/SettingsSection'
import type { HueName } from '../ui/tokens/palette'
import { Dialog } from './overlay/Dialog'
import { Menu } from './overlay/Menu'
import { useDateTimeFormat } from './DateTimePrefsProvider'
import { formatInstant } from '../lib/dates'

/**
 * A secret shown once, with a copy action (API tokens, app passwords). The parent
 * keeps it until the user is done; it is never shown again (web-app "Token shown once").
 */
export function SecretReveal({ what, secret, testId }: { what: string; secret: string; testId?: string }) {
  const [copied, setCopied] = useState<'yes' | 'failed' | null>(null)
  async function copy() {
    try {
      await navigator.clipboard.writeText(secret)
      setCopied('yes')
    } catch {
      setCopied('failed')
    }
  }
  return (
    <div className="space-y-2" data-testid="secret-reveal">
      <Notice tone="success">Copy this {what} now. It will not be shown again.</Notice>
      <div className="flex items-center gap-2">
        <code tabIndex={0} data-testid={testId} className="min-w-0 flex-1 break-all rounded-control border border-default bg-sunken px-3 py-2 font-mono text-meta text-default">{secret}</code>
        <Button size="sm" icon="copy" onClick={() => void copy()}>{copied === 'yes' ? 'Copied' : 'Copy'}</Button>
      </div>
      {copied === 'failed' && <p className="text-meta text-muted">Copying is blocked here; select the text above and copy it.</p>}
    </div>
  )
}

const SCOPE_HUE: Record<TokenScope, HueName> = { full: 'slate', read: 'blue', agent: 'violet' }
const day = (ms: number) => formatInstant(ms, 'date')

export interface TokensViewProps {
  tokens: ApiToken[] | null
  name: string
  scope: TokenScope
  secret: string | null
  error: string | null
  /** The "New token" dialog is open (form, then the one-time secret). */
  creating?: boolean
  busy?: boolean
  onNameChange: (name: string) => void
  onScopeChange: (scope: TokenScope) => void
  onCreate: () => void
  onRevoke: (token: ApiToken) => void
  onNew?: () => void
  onCloseNew?: () => void
}

/** Pure rendering of Settings → Integrations → API tokens; state lives in TokensSection. */
export function TokensView(p: TokensViewProps) {
  useDateTimeFormat()
  const newButton = <Button variant="primary" size="sm" icon="plus" onClick={p.onNew}>New token</Button>
  return (
    <SettingsSection title="API tokens" helpId="settings/tokens" headingId="tokens-heading" testId="tokens-panel"
      description="For scripts, the ot command and AI assistants. Send it as Authorization: Bearer <token>."
      actions={p.tokens && p.tokens.length > 0 ? newButton : undefined}>
      {p.error && <Notice tone="danger">{p.error}</Notice>}
      {p.tokens && p.tokens.length === 0 && (
        <EmptyState icon="key-round" title="No API tokens yet"
          body="A token lets a script, the ot command or an AI assistant use your tasks without your password. You can revoke it any time."
          action={newButton} />
      )}
      {p.tokens && p.tokens.length > 0 && (
        <div className="-mx-3">
          {p.tokens.map((t) => (
            <ListRow key={t.id} leading={<Icon name="key-round" size="md" />} label={t.name}
              meta={`Created ${day(t.createdAt)} · ${t.lastUsedAt ? `used ${day(t.lastUsedAt)}` : 'never used'}`}
              badges={<Badge hue={SCOPE_HUE[t.scope ?? 'full']}>{scopeLabel(t.scope)}</Badge>}
              menu={(
                <Menu label={`Actions for ${t.name}`} trigger={<Icon name="ellipsis" />} kind="menu"
                  triggerClassName="ui-btn ui-btn--ghost ui-btn--sm ui-btn--icon">
                  <MenuItem label={`Revoke ${t.name}`} icon="trash-2" danger onSelect={() => p.onRevoke(t)} />
                </Menu>
              )} />
          ))}
        </div>
      )}
      {p.creating && (
        <Dialog title={p.secret ? 'Token created' : 'New API token'} onClose={() => p.onCloseNew?.()} size="md">
          {p.secret ? (
            <div className="space-y-4">
              <SecretReveal what="token" secret={p.secret} />
              <div className="flex justify-end"><Button variant="primary" onClick={p.onCloseNew}>Done</Button></div>
            </div>
          ) : (
            <form className="space-y-4" onSubmit={(e: FormEvent) => { e.preventDefault(); p.onCreate() }}>
              <Field label="Name" description="Something you will recognise later, such as the device or script.">
                <Input aria-label="Token name" placeholder="e.g. laptop CLI" value={p.name} onChange={(e) => p.onNameChange(e.target.value)} data-autofocus />
              </Field>
              <Field label="Access"
                description="Read-only can read everything you can but is refused on every change. An AI assistant token can change tasks only through the assistant (MCP) tools, and only while the server owner and you allow assistant changes in Settings → AI; it can never create tokens or change settings.">
                <Select aria-label="Token scope" value={p.scope} onChange={(e) => p.onScopeChange(e.target.value as TokenScope)}>
                  <option value="full">Full access</option>
                  <option value="read">Read-only</option>
                  <option value="agent">AI assistant, can make changes</option>
                </Select>
              </Field>
              {p.error && <Notice tone="danger">{p.error}</Notice>}
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={p.onCloseNew}>Cancel</Button>
                <Button variant="primary" type="submit" busy={p.busy}>Create token</Button>
              </div>
            </form>
          )}
        </Dialog>
      )}
    </SettingsSection>
  )
}

/** Settings → API tokens. `reloadKey` changes when another section created a token. */
export function TokensSection({ reloadKey = 0 }: { reloadKey?: number }) {
  const [tokens, setTokens] = useState<ApiToken[] | null>(null)
  const [name, setName] = useState('')
  const [scope, setScope] = useState<TokenScope>('full')
  const [secret, setSecret] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [busy, setBusy] = useState(false)
  const [revoking, setRevoking] = useState<ApiToken | null>(null)

  const load = useCallback(async () => {
    try {
      setTokens((await api.listTokens()).tokens)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'You are offline. Tokens are managed on your server.')
    }
  }, [])
  useEffect(() => {
    void load()
  }, [load, reloadKey])

  return (
    <>
      <TokensView
        tokens={tokens} name={name} scope={scope} secret={secret} error={error} creating={creating} busy={busy}
        onNameChange={setName} onScopeChange={setScope}
        onNew={() => { setError(null); setSecret(null); setCreating(true) }}
        onCloseNew={() => { setCreating(false); setSecret(null); setName(''); setScope('full') }}
        onCreate={() => void (async () => {
          setError(null)
          setBusy(true)
          try {
            const res = await api.createToken(name || 'API token', scope)
            setSecret(res.secret)
            setName('')
            await load()
          } catch (err) {
            setError(err instanceof Error ? err.message : String(err))
          } finally {
            setBusy(false)
          }
        })()}
        onRevoke={setRevoking}
      />
      {revoking && (
        <ConfirmDialog title={`Revoke “${revoking.name}”?`} confirmLabel="Revoke token"
          consequence="Scripts, apps and assistants using this token stop working at once. You cannot undo this."
          onConfirm={() => api.deleteToken(revoking.id).then(load)} onCancel={() => setRevoking(null)} />
      )}
    </>
  )
}
