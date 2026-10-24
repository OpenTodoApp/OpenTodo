// One entry of the @mention list, shared by the plain composer and the editor's
// suggest list: a person with their email, or a workspace group with its icon and
// the number of people it reaches (OpenSpec change group-mentions, D4).
import type { MentionTarget } from '../../lib/comments'
import { t } from '../../lib/i18n'
import { Icon } from '../../ui'

export function MentionOption({ m }: { m: MentionTarget }) {
  if (m.group) {
    return (
      <span className="flex min-w-0 items-center gap-2" data-mention-group="">
        <Icon name="users" size="sm" className="text-muted" />
        <span className="user-text truncate">{m.name}</span>
        <span className="text-meta text-faint">{t('Group · {n, plural, one {# person} other {# people}}', { n: m.group.size })}</span>
      </span>
    )
  }
  return <>{m.name || m.email} <span className="user-text text-meta text-faint">{m.email}</span></>
}
