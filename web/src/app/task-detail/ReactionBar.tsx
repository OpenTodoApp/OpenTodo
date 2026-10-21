// Reactions under a comment (OpenSpec change editor-everywhere, comments
// "Reactions", design D8): one icon per reaction someone chose, with its count,
// toggling the viewer's own; who reacted is in the tooltip and the accessible
// name. Never an emoji glyph: icons from the app's set.
import { Icon, type IconName, Menu, MenuGroup, MenuItem, Tooltip } from '../../ui'
import { myReactions, REACTION_NAMES, reactionCounts, type ReactionName } from '../../lib/comments'
import type { Comment } from '../../lib/types'
import { t } from '../../lib/i18n'

export const REACTION_ICON: Record<ReactionName, IconName> = {
  thumbs_up: 'thumbs-up', heart: 'heart', check: 'check', eyes: 'eye', party: 'party-popper', question: 'circle-help',
}

export function reactionLabel(name: ReactionName): string {
  switch (name) {
    case 'thumbs_up': return t('Thumbs up')
    case 'heart': return t('Heart')
    case 'check': return t('Check')
    case 'eyes': return t('Eyes')
    case 'party': return t('Party popper')
    case 'question': return t('Question')
  }
}

/** The six reactions as menu items, checked when the viewer chose them (Add reaction, touch's More actions). */
export function ReactionMenuItems({ comment, me, onReact }: { comment: Pick<Comment, 'id' | 'reactions'>; me: string | null; onReact: (id: string, name: ReactionName) => void }) {
  const mine = myReactions(comment, me)
  return (
    <MenuGroup label={t('React')}>
      {REACTION_NAMES.map((n) => (
        <MenuItem key={n} label={reactionLabel(n)} icon={REACTION_ICON[n]} checked={mine.includes(n)} onSelect={() => onReact(comment.id, n)} />
      ))}
    </MenuGroup>
  )
}

export function ReactionBar({ comment, me, name, onReact, coarse }: {
  comment: Pick<Comment, 'id' | 'reactions'>
  me: string | null
  /** An account's display name. */
  name: (id: string) => string
  onReact: (id: string, reaction: ReactionName) => void
  /** Touch screens: with no reactions yet, adding one is in the comment's More actions. */
  coarse: boolean
}) {
  const counts = reactionCounts(comment)
  const mine = myReactions(comment, me)
  if (counts.length === 0 && coarse) return null
  return (
    <div className={`mt-1 flex flex-wrap items-center gap-1 ${counts.length === 0 ? 'hover-reveal' : ''}`} data-reactions>
      {counts.map(({ name: r, accounts }) => {
        const who = accounts.map(name).join(', ')
        const pressed = mine.includes(r)
        return (
          <Tooltip key={r} label={who}>
            <button type="button" aria-pressed={pressed} data-reaction={r}
              aria-label={t('{reaction}: {count} ({names})', { reaction: reactionLabel(r), count: accounts.length, names: who })}
              className={`inline-flex min-h-7 items-center gap-1 rounded-chip border px-1.5 text-meta ${pressed ? 'border-accent bg-accent-soft text-accent' : 'border-default text-muted hover:bg-sunken'}`}
              onClick={() => onReact(comment.id, r)}>
              <Icon name={REACTION_ICON[r]} size="xs" />{accounts.length}
            </button>
          </Tooltip>
        )
      })}
      {me && (
        <Menu kind="menu" label={t('Add reaction')} align="start" trigger={<Icon name="smile-plus" size="sm" />} triggerClassName="ui-btn ui-btn--icon ui-btn--ghost ui-btn--sm" triggerProps={{ 'data-add-reaction': true }}>
          <ReactionMenuItems comment={comment} me={me} onReact={onReact} />
        </Menu>
      )}
    </div>
  )
}
