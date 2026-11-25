// One invitation's text and its Accept and Decline (member-add-consent), shared by the
// notification list and Settings → Account → Invitations.
import { type ReactNode, useState } from 'react'
import { Button } from '../ui'
import { errorText } from '../lib/errorText'
import { t } from '../lib/i18n'
import { answerInvitation } from '../lib/notifications'
import { useOnline } from '../lib/online'
import { roleName } from '../lib/roleNames'
import { requestSync } from '../lib/sync'

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
