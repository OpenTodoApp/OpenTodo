import { type FormEvent, useCallback, useEffect, useState } from 'react'
import { api, ApiError } from '../lib/api'
import { scopeLabel, type ApiToken, type TokenScope } from '../lib/assistants'
import { Button } from '../ui'
import { Badge } from '../ui'
import { Field, Input, Select } from '../ui'
import { Icon } from '../ui'
import { MenuItem } from '../ui'
import { ConfirmDialog } from '../ui'
import { EmptyState } from '../ui'
import { ListRow } from '../ui'
import { Notice } from '../ui'
import { SettingRow, SettingsSection } from '../ui'
import type { HueName } from '../ui'
import { Dialog } from './overlay/Dialog'
import { Menu } from './overlay/Menu'
import { useDateTimeFormat } from './DateTimePrefsProvider'
import { formatInstant } from '../lib/dates'
import { t } from '../lib/i18n'

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
      <Notice tone="success">{t('Copy this {what} now. It will not be shown again.', { what })}</Notice>
      <div className="flex items-center gap-2">
        <code tabIndex={0} data-testid={testId} className="min-w-0 flex-1 break-all rounded-control border border-default bg-sunken px-3 py-2 font-mono text-meta text-default">{secret}</code>
        <Button size="sm" icon="copy" onClick={() => void copy()}>{copied === 'yes' ? t('Copied') : t('Copy')}</Button>
      </div>
      {copied === 'failed' && <p className="text-meta text-muted">{t('Copying is blocked here; select the text above and copy it.')}</p>}
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
  const newButton = <Button variant="primary" size="sm" icon="plus" onClick={p.onNew}>{t('New token')}</Button>
  return (
    <SettingsSection title={t('API tokens')} headingId="tokens-heading" testId="tokens-panel"
      description={t('For scripts, the ot command and AI assistants. Send it as Authorization: Bearer <token>.')}>
      {p.error && <Notice tone="danger">{p.error}</Notice>}
      {p.tokens && p.tokens.length === 0 && (
        <EmptyState icon="key-round" title={t('No API tokens yet')}
          body={t('A token lets a script, the ot command or an AI assistant use your tasks without your password. You can revoke it any time.')}
          action={newButton} />
      )}
      {p.tokens && p.tokens.length > 0 && (
        <div className="-mx-3">
          {p.tokens.map((token) => (
            <ListRow key={token.id} leading={<Icon name="key-round" size="md" />} label={token.name}
              meta={token.lastUsedAt ? t('Created {day} · used {used}', { day: day(token.createdAt), used: day(token.lastUsedAt) }) : t('Created {day} · never used', { day: day(token.createdAt) })}
              badges={<Badge hue={SCOPE_HUE[token.scope ?? 'full']}>{scopeLabel(token.scope)}</Badge>}
              menu={(
                <Menu label={t('Actions for {name}', { name: token.name })} trigger={<Icon name="ellipsis" />} kind="menu"
                  triggerClassName="ui-btn ui-btn--ghost ui-btn--sm ui-btn--icon">
                  <MenuItem label={t('Revoke {name}', { name: token.name })} icon="trash-2" danger onSelect={() => p.onRevoke(token)} />
                </Menu>
              )} />
          ))}
        </div>
      )}
      {p.tokens && p.tokens.length > 0 && (
        <SettingRow label={t('New token')} description={t('A token is shown once, when you create it.')} control={newButton} />
      )}
      {p.creating && (
        <Dialog title={p.secret ? t('Token created') : t('New API token')} onClose={() => p.onCloseNew?.()} size="md">
          {p.secret ? (
            <div className="space-y-4">
              <SecretReveal what={t('token')} secret={p.secret} />
              <div className="flex justify-end"><Button variant="primary" onClick={p.onCloseNew}>{t('Done')}</Button></div>
            </div>
          ) : (
            <form className="space-y-4" onSubmit={(e: FormEvent) => { e.preventDefault(); p.onCreate() }}>
              <Field label={t('Name')} description={t('Something you will recognise later, such as the device or script.')}>
                <Input aria-label={t('Token name')} placeholder={t('e.g. laptop CLI')} value={p.name} onChange={(e) => p.onNameChange(e.target.value)} data-autofocus />
              </Field>
              <Field label={t('Access')}
                description={t('Read-only can read everything you can but is refused on every change. An AI assistant token can change tasks only through the assistant (MCP) tools, and only while the server owner and you allow assistant changes in Settings → AI; it can never create tokens or change settings.')}>
                <Select aria-label={t('Token scope')} value={p.scope} onChange={(e) => p.onScopeChange(e.target.value as TokenScope)}>
                  <option value="full">{t('Full access')}</option>
                  <option value="read">{t('Read-only')}</option>
                  <option value="agent">{t('AI assistant, can make changes')}</option>
                </Select>
              </Field>
              {p.error && <Notice tone="danger">{p.error}</Notice>}
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={p.onCloseNew}>{t('Cancel')}</Button>
                <Button variant="primary" type="submit" busy={p.busy}>{t('Create token')}</Button>
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
      setError(err instanceof ApiError ? err.message : t('You are offline. Tokens are managed on your server.'))
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
        <ConfirmDialog title={t('Revoke “{name}”?', { name: revoking.name })} confirmLabel={t('Revoke token')}
          consequence={t('Scripts, apps and assistants using this token stop working at once. You cannot undo this.')}
          onConfirm={() => api.deleteToken(revoking.id).then(load)} onCancel={() => setRevoking(null)} />
      )}
    </>
  )
}
