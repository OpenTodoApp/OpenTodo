// The open invitations of a project or workspace (OpenSpec change
// member-add-consent): addresses asked to join that have not answered yet, for
// the owner and admins, with Cancel. A row never says whether the address has
// an account.
import { useId } from 'react'
import { Badge, Button, TruncatedText } from '../ui'
import { t } from '../lib/i18n'
import { roleName } from '../lib/roleNames'
import type { PendingMember } from '../lib/types'
import { useDateTimeFormat } from './DateTimePrefsProvider'

export function PendingInvitations({ pending, disabled, onCancel }: { pending: PendingMember[]; disabled?: boolean; onCancel: (p: PendingMember) => void }) {
  const dt = useDateTimeFormat()
  const heading = useId()
  if (pending.length === 0) return null
  return (
    <section aria-labelledby={heading} className="mt-3" data-pending-invitations>
      <h3 id={heading} className="mb-1 px-1 text-meta font-medium text-muted">{t('Waiting for an answer')}</h3>
      <ul className="space-y-1">
        {pending.map((p) => (
          <li key={p.id} className="flex items-center gap-2 rounded-control px-1 py-1 text-body" data-pending-invitation={p.id}>
            <span className="min-w-0 flex-1">
              <TruncatedText className="block" text={p.email} />
              <span className="block text-meta text-faint">{t('Invited, open until {date}', { date: dt.formatInstant(p.expiresAt, 'date') })}</span>
            </span>
            <Badge>{roleName(p.role)}</Badge>
            <Button variant="ghost" size="sm" disabled={disabled} onClick={() => onCancel(p)} aria-label={t('Cancel the invitation of {email}', { email: p.email })}>
              {t('Cancel')}
            </Button>
          </li>
        ))}
      </ul>
    </section>
  )
}
