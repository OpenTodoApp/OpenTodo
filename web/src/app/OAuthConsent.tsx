// The consent screen of an app connecting to the MCP endpoint through OAuth
// (OpenSpec change mcp-oauth, design D5). /oauth/authorize never issues a code
// by itself: it sends the signed-in browser here, and only Allow asks the
// server for one. A link someone else sent therefore grants nothing unless the
// person reads who is asking and agrees.
import { useEffect, useState } from 'react'
import { Button, Dialog } from '../ui'
import { api } from '../lib/api'
import type { McpConsentInfo } from '../lib/assistants'
import { t } from '../lib/i18n'
import { APP_CLIENT_ID } from '../lib/appSessions'
import { AppSignIn } from './AppSignIn'
import { useWorkspaceChoices, WorkspaceChoice } from './WorkspaceChoice'

export interface OAuthConsentViewProps {
  info: McpConsentInfo
  busy: boolean
  /** The account's workspaces; the choice is offered when there are two or more (token-workspaces D5). */
  workspaces?: { id: string; name: string }[]
  only?: string[] | null
  onOnlyChange?: (only: string[] | null) => void
  onAllow: () => void
  onDeny: () => void
}

/** Pure rendering of the consent dialog. */
export function OAuthConsentView({ info, busy, onAllow, onDeny, workspaces = [], only = null, onOnlyChange }: OAuthConsentViewProps) {
  const client = info.client.name
  return (
    <Dialog title={t('Connect {client} to your account?', { client })} onClose={onDeny} dismissable={false} size="md" testId="oauth-consent">
      <div className="space-y-3 text-body">
        <p className="text-default">
          {info.scope === 'agent'
            ? t('{client} will be able to read your tasks, projects and notes and, where you allow AI assistants to make changes, create and change them.', { client })
            : t('{client} will be able to read your tasks, projects and notes.', { client })}
        </p>
        <p className="text-muted">
          {info.client.dynamic
            ? t('This app registered itself with your server. It receives the answer at {host}.', { host: info.redirectHost })
            : t('Your server’s owner added this app. It receives the answer at {host}.', { host: info.redirectHost })}
        </p>
        <p className="text-muted">{t('Only allow this if you started connecting {client} yourself just now.', { client })}</p>
        {workspaces.length > 1 && <WorkspaceChoice workspaces={workspaces} only={only} onChange={(v) => onOnlyChange?.(v)} />}
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" onClick={onDeny} disabled={busy} data-oauth-deny>{t('Cancel')}</Button>
        <Button variant="primary" onClick={onAllow} disabled={busy || (only !== null && only.length === 0)} data-oauth-allow>{t('Allow')}</Button>
      </div>
    </Dialog>
  )
}

/**
 * The consent for the request `query` describes: the OpenTodo app's built-in
 * client gets its sign-in confirmation (native-app-foundation D5), every other
 * client the MCP consent.
 */
export function OAuthConsent({ query, onDone }: { query: string; onDone: () => void }) {
  if (new URLSearchParams(query).get('client_id') === APP_CLIENT_ID) return <AppSignIn query={query} onDone={onDone} />
  return <McpConsent query={query} onDone={onDone} />
}

/** Loads the request `query` describes and sends the browser on with the person's answer. */
function McpConsent({ query, onDone }: { query: string; onDone: () => void }) {
  const [info, setInfo] = useState<McpConsentInfo | null>(null)
  const [failed, setFailed] = useState(false)
  const [busy, setBusy] = useState(false)
  const workspaces = useWorkspaceChoices()
  const [only, setOnly] = useState<string[] | null>(null)
  useEffect(() => {
    api.getMcpConsent(query).then(setInfo, () => setFailed(true))
  }, [query])
  const answer = async (allow: boolean) => {
    setBusy(true)
    try {
      const { redirect } = await api.answerMcpConsent(query, allow, allow && only ? only : undefined)
      if (/^https:\/\//.test(redirect)) window.location.assign(redirect)
      else onDone()
    } catch {
      setBusy(false)
      setFailed(true)
    }
  }
  if (failed) {
    return (
      <Dialog title={t('This connection request can’t be used')} onClose={onDone} size="sm" testId="oauth-consent-failed">
        <p className="text-body text-muted">{t('It may have expired or been changed. Start connecting again from the app.')}</p>
        <div className="mt-4 flex justify-end"><Button variant="primary" onClick={onDone}>{t('Close')}</Button></div>
      </Dialog>
    )
  }
  if (!info) return null
  return <OAuthConsentView info={info} busy={busy} workspaces={workspaces} only={only} onOnlyChange={setOnly} onAllow={() => void answer(true)} onDeny={() => void answer(false)} />
}
