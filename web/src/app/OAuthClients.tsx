import { useCallback, useEffect, useState } from 'react'
import { Button, Notice, SettingRow } from '../ui'
import { SecretReveal } from './TokensSection'
import { api, isNetworkError } from '../lib/api'
import { describeAssistantsError, type McpOAuthClient } from '../lib/assistants'
import { t } from '../lib/i18n'
import { copyText } from '../lib/clipboard'
import { rowCopy } from '../lib/settingsCopy'

/**
 * OAuth clients for the MCP endpoint (OpenSpec change mcp-oauth): the way in for
 * an app that cannot be handed a pasted token, Google Gemini's Connected apps
 * being the one this exists for. The secret exists in the create response only,
 * so it is shown once, next to the client id the app also needs.
 */
export function OAuthClients({ disabled }: { disabled: boolean }) {
  const [clients, setClients] = useState<McpOAuthClient[] | null>(null)
  const [name, setName] = useState('Gemini')
  const [scope, setScope] = useState<'read' | 'agent'>('read')
  const [created, setCreated] = useState<{ client: McpOAuthClient; secret: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await api.getMcpOAuthClients()
      setClients(res.clients)
      setError(null)
    } catch (err) {
      if (!isNetworkError(err)) setError(describeAssistantsError(err))
    }
  }, [])
  useEffect(() => {
    void load()
  }, [load])

  const create = async () => {
    setBusy(true)
    setError(null)
    try {
      const res = await api.createMcpOAuthClient(name.trim() || 'Gemini', scope)
      setCreated(res)
      // A second client usually has another name; keeping "Gemini" invites a duplicate.
      setName('')
      await load()
    } catch (err) {
      setError(describeAssistantsError(err))
    } finally {
      setBusy(false)
    }
  }
  const remove = async (id: string) => {
    setBusy(true)
    setError(null)
    try {
      await api.deleteMcpOAuthClient(id)
      if (created?.client.id === id) setCreated(null)
      await load()
    } catch (err) {
      setError(describeAssistantsError(err))
    } finally {
      setBusy(false)
    }
  }
  const copy = (what: string, text: string) => {
    copyText(text).then(
      () => setCopied(what),
      () => setError(t('Could not access the clipboard; select the text and copy it manually.')),
    )
  }

  return (
    <div className="space-y-3 border-t border-default pt-3" data-mcp-oauth>
      <div>
        <h3 className="text-body font-semibold text-default">{t('Apps that sign in with OAuth')}</h3>
        <p className="text-meta text-muted">
          {t('Some apps, such as Google Gemini, cannot take a pasted token. They sign in with OAuth instead: create a client here and paste its client ID and secret into the app.')}
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-40 flex-1 text-meta text-muted">
          <span className="mb-1 block">{t('Client name')}</span>
          <input value={name} onChange={(e) => setName(e.target.value)} disabled={disabled || busy}
            className="w-full rounded-control border border-default bg-surface px-2 py-1 text-body text-default" data-oauth-client-name />
        </label>
        <label className="text-meta text-muted">
          <span className="mb-1 block">{t('What the assistant may do')}</span>
          <select value={scope} onChange={(e) => setScope(e.target.value === 'agent' ? 'agent' : 'read')} disabled={disabled || busy}
            className="rounded-control border border-default bg-surface px-2 py-1 text-body text-default" data-oauth-client-scope>
            <option value="read">{t('Read only')}</option>
            <option value="agent">{t('Can make changes')}</option>
          </select>
        </label>
        <Button variant="primary" size="sm" disabled={disabled || busy} busy={busy} onClick={() => void create()} data-oauth-create>
          {t('Create client')}
        </Button>
      </div>

      {created && (
        <div className="space-y-2" data-oauth-created>
          <SettingRow {...rowCopy('assistants', 'oauthClient')}
            control={<div className="flex items-center gap-2">
              <code className="max-w-64 truncate rounded-control border border-default bg-sunken px-2 py-1 font-mono text-meta text-default">{created.client.id}</code>
              <Button size="sm" icon="copy" onClick={() => copy('id', created.client.id)}>{copied === 'id' ? t('Copied') : t('Copy')}</Button>
            </div>} />
          <SecretReveal what={t('client secret')} secret={created.secret} />
          <div className="flex justify-end"><Button size="sm" variant="ghost" onClick={() => setCreated(null)}>{t('Done')}</Button></div>
        </div>
      )}

      {clients && clients.length === 0 && <p className="text-meta text-faint">{t('No OAuth clients yet.')}</p>}
      {clients?.map((c) => (
        <SettingRow key={c.id} data-oauth-client={c.id}
          label={<span className="flex flex-wrap items-center gap-2">{c.name}
            <span className="rounded-full bg-sunken px-2 text-meta text-muted">{c.scope === 'agent' ? t('Can make changes') : t('Read only')}</span>
            {c.dynamic && <span className="rounded-full bg-sunken px-2 text-meta text-faint">{t('Registered by the app')}</span>}
          </span>}
          description={<code className="font-mono text-meta text-faint">{c.id}</code>}
          control={<Button size="sm" variant="ghost" disabled={disabled || busy} onClick={() => void remove(c.id)}>{t('Delete client')}</Button>} />
      ))}

      {error && <Notice tone="danger">{error}</Notice>}
    </div>
  )
}
