// Invitations to join a project or workspace (OpenSpec change
// member-add-consent): someone the person shares nothing with asked to add
// them. They answer from the notification list or from Settings → Account →
// Invitations; nothing is shared until they accept. Answering needs a
// connection, like every membership change.
import { useCallback, useEffect, useState } from 'react'
import { Notice, SettingsSection } from '../ui'
import { api } from '../lib/api'
import { useDemo } from '../lib/demo'
import { errorText } from '../lib/errorText'
import { t } from '../lib/i18n'
import { useOnline } from '../lib/online'
import type { MemberInvitation } from '../lib/types'
import { cardCopy, noticeCopy } from '../lib/settingsCopy'
import { useDateTimeFormat } from './DateTimePrefsProvider'
import { InvitationAnswer, InvitationText } from './InvitationAnswer'

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
