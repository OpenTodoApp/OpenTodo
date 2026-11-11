import { useCallback, useEffect, useState } from 'react'
import { Button, Field, Input, Notice, Select, SettingRow } from '../ui'
import { SecretReveal } from './TokensSection'
import { api, isNetworkError } from '../lib/api'
import { describeAssistantsError, oauthClientApp, type McpOAuthClient, type McpOAuthPlatform, type McpOAuthTarget } from '../lib/assistants'
import { t } from '../lib/i18n'
import { copyText } from '../lib/clipboard'
import { rowCopy } from '../lib/settingsCopy'

/** The App choice for a custom redirect address. */
const CUSTOM = 'custom'

/**
 * OAuth clients for the MCP endpoint (OpenSpec changes mcp-oauth and
 * mcp-oauth-connector-redirects): the way in for an app that signs in instead
 * of taking a pasted token, such as Gemini, ChatGPT or Claude. A client is made
 * for one of the platforms the server knows, or for one exact redirect address.
 * The secret exists in the create response only, so it is shown once, next to
 * the client id the app also needs.
 */
export function OAuthClients({ disabled }: { disabled: boolean }) {
  const [clients, setClients] = useState<McpOAuthClient[] | null>(null)
  const [platforms, setPlatforms] = useState<McpOAuthPlatform[]>([])
  const [app, setApp] = useState('google')
  const [redirect, setRedirect] = useState('')
  const [name, setName] = useState('')
  const [scope, setScope] = useState<'read' | 'agent'>('read')
  const [created, setCreated] = useState<{ client: McpOAuthClient; secret: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await api.getMcpOAuthClients()
      setClients(res.clients)
      setPlatforms(res.platforms ?? [])
      setError(null)
    } catch (err) {
      if (!isNetworkError(err)) setError(describeAssistantsError(err))
    }
  }, [])
  useEffect(() => {
    void load()
  }, [load])

  const platform = platforms.find((p) => p.id === app)
  const custom = app === CUSTOM
  const create = async () => {
    const address = redirect.trim()
    if (custom && !address) {
      setError(t('Enter the address the app returns to after you sign in.'))
      return
    }
    // A platform's addresses, or the one exact address typed; before the list
    // has loaded, the server's default (Google's preset).
    const target: McpOAuthTarget | undefined = custom ? { redirect_uris: [address] } : platform ? { platform: platform.id } : undefined
    setBusy(true)
    setError(null)
    try {
      const res = await api.createMcpOAuthClient(name.trim() || platform?.name || '', scope, target)
      setCreated(res)
      setName('')
      setRedirect('')
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
          {t('Some apps, such as Gemini, ChatGPT and Claude, sign in with OAuth instead of taking a pasted token: create a client here for the app and paste its client ID and secret into it.')}
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        {platforms.length > 0 && (
          <Field label={t('App')}>
            <Select value={app} onChange={(e) => setApp(e.target.value)} disabled={disabled || busy} className="w-auto" data-oauth-client-app>
              {platforms.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              <option value={CUSTOM}>{t('Other app')}</option>
            </Select>
          </Field>
        )}
        <Field label={t('Client name')} className="min-w-40 flex-1">
          <Input value={name} onChange={(e) => setName(e.target.value)} disabled={disabled || busy} placeholder={platform?.name} data-oauth-client-name />
        </Field>
        <Field label={t('What the assistant may do')}>
          <Select value={scope} onChange={(e) => setScope(e.target.value === 'agent' ? 'agent' : 'read')} disabled={disabled || busy} className="w-auto" data-oauth-client-scope>
            <option value="read">{t('Read only')}</option>
            <option value="agent">{t('Can make changes')}</option>
          </Select>
        </Field>
        <Button variant="primary" size="sm" disabled={disabled || busy} busy={busy} onClick={() => void create()} data-oauth-create>
          {t('Create client')}
        </Button>
      </div>
      {custom && (
        <Field label={t('Redirect address')} description={t('The exact address the app returns to after you sign in, starting with https://. The app’s documentation names it.')}>
          <Input value={redirect} onChange={(e) => setRedirect(e.target.value)} disabled={disabled || busy} type="url" inputMode="url"
            spellCheck={false} autoComplete="off" className="font-mono" data-oauth-client-redirect />
        </Field>
      )}

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
            {oauthClientApp(c, platforms) && <span className="rounded-full bg-sunken px-2 text-meta text-muted" data-oauth-client-for>{oauthClientApp(c, platforms)}</span>}
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
