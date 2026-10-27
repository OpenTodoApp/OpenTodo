// Invitations to join a project or workspace (OpenSpec change
// member-add-consent): someone the person shares nothing with asked to add
// them. They answer from the notification list or from Settings → Account →
// Invitations; nothing is shared until they accept. Answering needs a
// connection, like every membership change.
import { type ReactNode, useCallback, useEffect, useState } from 'react'
import { Button, Notice, SettingsSection } from '../ui'
import { api } from '../lib/api'
import { useDemo } from '../lib/demo'
import { errorText } from '../lib/errorText'
import { t } from '../lib/i18n'
import { answerInvitation } from '../lib/notifications'
import { useOnline } from '../lib/online'
import { roleName } from '../lib/roleNames'
import { requestSync } from '../lib/sync'
import type { MemberInvitation } from '../lib/types'
import { cardCopy, noticeCopy } from '../lib/settingsCopy'
import { useDateTimeFormat } from './DateTimePrefsProvider'

const strong = (chunks: ReactNode) => <strong>{chunks}</strong>

/** "Alice invited you to the project Garden as editor." */
export function InvitationText({ inviter, target, name, role }: { inviter: string; target: 'project' | 'workspace'; name?: string; role: string }) {
  const fallback = target === 'workspace' ? t('a workspace') : t('a project')
  const v = { inviter: inviter || t('Someone'), name: name || fallback, role: roleName(role), b: strong, b2: strong }
  return target === 'workspace'
    ? <>{t.rich('<b>{inviter}</b> invited you to the workspace <b2>{name}</b2> as {role}', v)}</>
    : <>{t.rich('<b>{inviter}</b> invited you to the project <b2>{name}</b2> as {role}', v)}</>
}

/**
 * Accept and Decline for one invitation. A failure is shown under the buttons;
 * an invitation that is gone or no longer valid counts as answered.
 */
export function InvitationAnswer({ invitationId, notificationId, onAnswered }: { invitationId: string; notificationId?: string; onAnswered?: (accepted: boolean) => void }) {
  const online = useOnline()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function answer(accept: boolean) {
    setBusy(true)
    setError(null)
    try {
      await answerInvitation(invitationId, accept, notificationId)
      requestSync(0)
      onAnswered?.(accept)
    } catch (err) {
      setError(errorText(err, { offline: t('Answering needs a connection to your server.') }))
    } finally {
      setBusy(false)
    }
  }
  return (
    <span className="mt-2 block" data-invitation-answer={invitationId}>
      <span className="flex flex-wrap gap-2">
        <Button size="sm" variant="primary" disabled={busy || !online} onClick={() => void answer(true)}>{t('Accept')}</Button>
        <Button size="sm" variant="secondary" disabled={busy || !online} onClick={() => void answer(false)}>{t('Decline')}</Button>
      </span>
      {error && <span role="alert" className="mt-1 block text-meta text-danger">{error}</span>}
    </span>
  )
}

/** Settings → Account → Invitations: the open invitations, newest first. */
export function InvitationsPanel() {
  const online = useOnline()
  // A demo sandbox is never invited (the routes are refused there): nothing to load.
  const demo = useDemo() !== null
  const [list, setList] = useState<MemberInvitation[] | null>(demo ? [] : null)
  const [error, setError] = useState<string | null>(null)
  const load = useCallback(() => {
    api.listMemberInvitations().then((r) => { setList(r.invitations); setError(null) }, (err) => setError(errorText(err)))
  }, [])
  useEffect(() => {
    if (online && !demo) load()
  }, [online, demo, load])
  return <InvitationsView list={list} online={online} error={error} onAnswered={load} />
}

/** The Invitations card for a list: null while loading. */
export function InvitationsView({ list, online, error, onAnswered }: { list: MemberInvitation[] | null; online: boolean; error: string | null; onAnswered: () => void }) {
  const dt = useDateTimeFormat()
  return (
    <SettingsSection {...cardCopy('invitations')}>
      {!online && <div className="py-3"><Notice tone="info">{noticeCopy('invitations', 'offline')}</Notice></div>}
      {error && <p role="alert" className="py-3 text-meta text-danger">{error}</p>}
      {list && list.length === 0 && <p className="py-3 text-body text-muted" data-no-invitations>{noticeCopy('invitations', 'empty')}</p>}
      {list && list.map((inv) => (
        <div key={inv.id} className="py-3" data-invitation={inv.id}>
          <span className="user-text block text-body"><InvitationText inviter={inv.inviterName} target={inv.kind} name={inv.targetName} role={inv.role} /></span>
          <span className="block text-meta text-faint">{t('Open until {date}', { date: dt.formatInstant(inv.expiresAt, 'date') })}</span>
          <InvitationAnswer invitationId={inv.id} onAnswered={onAnswered} />
        </div>
      ))}
    </SettingsSection>
  )
}
