import { useCallback, useEffect, useState } from 'react'
import { HelpHeading } from './help/HelpLink'
import { api, ApiError } from '../lib/api'
import { scopeLabel, type ApiToken, type TokenScope } from '../lib/assistants'

export interface TokensViewProps {
  tokens: ApiToken[] | null
  name: string
  scope: TokenScope
  secret: string | null
  error: string | null
  onNameChange: (name: string) => void
  onScopeChange: (scope: TokenScope) => void
  onCreate: () => void
  onRevoke: (token: ApiToken) => void
}

/** Pure rendering of Settings → API tokens; state lives in TokensSection. */
export function TokensView(p: TokensViewProps) {
  return (
    <section className="space-y-2" aria-labelledby="tokens-heading">
      <HelpHeading screen="settings/tokens" id="tokens-heading" className="font-semibold">API tokens</HelpHeading>
      <p className="text-sm text-slate-500">
        Use a token from scripts or a CLI: <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">Authorization: Bearer &lt;token&gt;</code>.
        A read-only token can read everything you can but is refused on every change. See docs/api.md.
      </p>
      <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); p.onCreate() }}>
        <input className="input max-w-xs" aria-label="Token name" placeholder="Token name (e.g. laptop CLI)" value={p.name}
          onChange={(e) => p.onNameChange(e.target.value)} />
        <select className="input w-auto" aria-label="Token scope" value={p.scope} onChange={(e) => p.onScopeChange(e.target.value as TokenScope)}>
          <option value="full">Full access</option>
          <option value="read">Read-only</option>
        </select>
        <button type="submit" className="btn-primary">Create</button>
      </form>
      {p.secret && (
        <div className="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm dark:border-emerald-800 dark:bg-emerald-950" role="status">
          <p className="mb-1 font-medium">Copy this token now. It will not be shown again.</p>
          <code className="break-all">{p.secret}</code>
        </div>
      )}
      {p.error && <p className="text-sm text-red-600">{p.error}</p>}
      <ul className="divide-y divide-slate-200 dark:divide-slate-800">
        {p.tokens?.map((t) => (
          <li key={t.id} className="flex items-center gap-3 py-2 text-sm">
            <span className="flex-1">{t.name}</span>
            <span className={`rounded px-1.5 py-0.5 text-xs ${t.scope === 'read' ? 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>
              {scopeLabel(t.scope)}
            </span>
            <span className="text-xs text-slate-400">
              created {new Date(t.createdAt).toLocaleDateString()}{t.lastUsedAt ? ` · used ${new Date(t.lastUsedAt).toLocaleDateString()}` : ' · never used'}
            </span>
            <button type="button" className="btn-danger text-xs" aria-label={`Revoke ${t.name}`} onClick={() => p.onRevoke(t)}>Revoke</button>
          </li>
        ))}
        {p.tokens && p.tokens.length === 0 && <li className="py-2 text-sm text-slate-400">No tokens yet.</li>}
      </ul>
    </section>
  )
}

/** Settings → API tokens. `reloadKey` changes when another section created a token. */
export function TokensSection({ reloadKey = 0 }: { reloadKey?: number }) {
  const [tokens, setTokens] = useState<ApiToken[] | null>(null)
  const [name, setName] = useState('')
  const [scope, setScope] = useState<TokenScope>('full')
  const [secret, setSecret] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setTokens((await api.listTokens()).tokens)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Offline: tokens are managed on the server.')
    }
  }, [])
  useEffect(() => {
    void load()
  }, [load, reloadKey])

  return (
    <TokensView
      tokens={tokens} name={name} scope={scope} secret={secret} error={error}
      onNameChange={setName} onScopeChange={setScope}
      onCreate={() => void (async () => {
        setError(null)
        try {
          const res = await api.createToken(name || 'API token', scope)
          setSecret(res.secret)
          setName('')
          await load()
        } catch (err) {
          setError(err instanceof Error ? err.message : String(err))
        }
      })()}
      onRevoke={(t) => void api.deleteToken(t.id).then(load, (err: unknown) => setError(err instanceof Error ? err.message : String(err)))}
    />
  )
}
