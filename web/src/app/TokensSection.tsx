import { type FormEvent, useCallback, useEffect, useState } from 'react'
import { api, ApiError } from '../lib/api'
import type { ApiToken, TokenScope } from '../lib/assistants'
import { Button, Dialog } from '../ui'
import { Badge } from '../ui'
import { Field, Input } from '../ui'
import { Icon } from '../ui'
import { ConfirmDialog } from '../ui'
import { EmptyState } from '../ui'
import { ListRow } from '../ui'
import { Notice } from '../ui'
import { SettingRow, SettingsSection } from '../ui'
import type { HueName } from '../ui'
import { useDateTimeFormat } from './DateTimePrefsProvider'
import { addDaysISO, formatInstant, todayISO } from '../lib/dates'
import { t } from '../lib/i18n'
import { useOnline } from '../lib/online'
import { cardCopy, rowCopy } from '../lib/settingsCopy'

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

const SCOPE_HUE: Record<TokenScope, HueName> = { full: 'slate', read: 'blue', agent: 'violet', admin: 'red' }
const day = (ms: number) => formatInstant(ms, 'date')

/** The scope badge of a token row (account-access "API tokens in Settings"). */
export function scopeBadge(scope: TokenScope | undefined): string {
  if (scope === 'read') return t('Read only')
  if (scope === 'agent') return t('Assistant')
  if (scope === 'admin') return t('Admin')
  return t('Full access')
}

/** A coarse day: "today", "yesterday", then the date in the user's format. */
export function coarseDay(ms: number, now = Date.now()): string {
  const d = todayISO(new Date(ms))
  const today = todayISO(new Date(now))
  if (d === today) return t('today')
  if (d === addDaysISO(today, -1)) return t('yesterday')
  return day(ms)
}

/** "Created 3 Oct · Last used today" (or "· Never used"). */
export function tokenMeta(token: ApiToken, now = Date.now()): string {
  return token.lastUsedAt
    ? t('Created {day} · Last used {used}', { day: day(token.createdAt), used: coarseDay(token.lastUsedAt, now) })
    : t('Created {day} · Never used', { day: day(token.createdAt) })
}

/** The scopes offered in the create dialog, each with one line saying what it allows. */
const SCOPES: { scope: TokenScope; label: () => string; line: () => string }[] = [
  { scope: 'full', label: () => t('Full access'), line: () => t('Everything you can do, except sign-in credentials and administration.') },
  { scope: 'read', label: () => t('Read only'), line: () => t('Reads everything you can; every change is refused.') },
  { scope: 'agent', label: () => t('Assistant'), line: () => t('An AI assistant changes tasks only through its tools, while you and the owner allow it.') },
  { scope: 'admin', label: () => t('Admin'), line: () => t('Full access plus credentials and administration. Keep it like a password.') },
]

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
  /** No connection: the last loaded list stays, actions are disabled. */
  offline?: boolean
  now?: number
}

/** Pure rendering of Settings → Integrations → API tokens; state lives in TokensSection. */
export function TokensView(p: TokensViewProps) {
  useDateTimeFormat()
  const newButton = <Button variant="primary" size="sm" icon="plus" disabled={p.offline} onClick={p.onNew}>{t('New token')}</Button>
  return (
    <SettingsSection {...cardCopy('tokens', { values: { header: 'Authorization: Bearer <token>' } })} tier="primary" testId="tokens-panel">
      {p.error && <Notice tone="danger">{p.error}</Notice>}
      {p.tokens && p.tokens.length === 0 && (
        <EmptyState icon="key-round" title={t('No API tokens yet')}
          body={t('A token lets a script, the ot command or an AI assistant use your tasks without your password. You can revoke it any time.')}
          control={newButton} />
      )}
      {p.tokens && p.tokens.length > 0 && (
        <div className="-mx-3">
          {p.tokens.map((token) => (
            <ListRow key={token.id} leading={<Icon name="key-round" size="md" />} label={<span data-token-name>{token.name}</span>}
              meta={<span data-token-meta>{tokenMeta(token, p.now)}</span>}
              badges={<Badge hue={SCOPE_HUE[token.scope ?? 'full']}>{scopeBadge(token.scope)}</Badge>}
              menu={<Button variant="ghost" size="sm" disabled={p.offline} aria-label={t('Revoke {name}', { name: token.name })} onClick={() => p.onRevoke(token)} data-token-revoke>{t('Revoke')}</Button>} />
          ))}
        </div>
      )}
      {p.tokens && p.tokens.length > 0 && (
        <SettingRow {...rowCopy('tokens', 'new')} control={newButton} />
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
              <fieldset className="space-y-2">
                <legend className="text-body font-medium text-default">{t('Access')}</legend>
                <div role="radiogroup" aria-label={t('Token scope')} className="space-y-1">
                  {SCOPES.map((o) => (
                    <label key={o.scope} className={`flex cursor-pointer items-start gap-3 rounded-control border px-3 py-2 ${p.scope === o.scope ? 'border-accent bg-accent-soft' : 'border-default'}`}>
                      <input type="radio" name="token-scope" value={o.scope} checked={p.scope === o.scope} onChange={() => p.onScopeChange(o.scope)} className="mt-1" data-token-scope={o.scope} />
                      <span className="min-w-0">
                        <span className="block text-body font-medium text-default">{o.label()}</span>
                        <span className="block text-meta text-muted">{o.line()}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
              {p.scope === 'admin' && (
                <Notice tone="warning">
                  {t('An admin token can turn off two-factor authentication, create more tokens and app passwords, manage accounts and change single sign-on and other secret settings, without your password or a code. Create one only for a script that needs it, keep it like a password and revoke it when you are done.')}
                </Notice>
              )}
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
  const online = useOnline()

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
        tokens={tokens} name={name} scope={scope} secret={secret} error={error} creating={creating} busy={busy} offline={!online}
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
