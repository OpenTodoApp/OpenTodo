// Time-sensitive tasks under Today's folded Waiting for a slot heading (OpenSpec change
// today-waiting-time-sensitive, design D2): the waiting tasks due today with a time or
// with a deadline today, soonest first, each with its time and Take a slot. The fill
// order is untouched; Take a slot is the usual command (refused while Today is full).
import { formatTime } from '../../lib/dates'
import { t } from '../../lib/i18n'
import type { WaitingSoon as Soon } from '../../lib/listGroups'
import { Button } from '../../ui'
import { act } from '../actionError'
import { openTaskPanel } from '../panel'
import { runTakeSlot } from './slotActions'

/** At most this many are listed; the rest are behind "n more", which opens the group. */
export const SOON_SHOWN = 3

const titleOf = (s: Soon) => (s.task._e2ee?.raw?.title || !s.task.title ? t('Untitled') : s.task.title)

export function WaitingSoonList({ soon, onOpenGroup }: { soon: readonly Soon[]; onOpenGroup: () => void }) {
  const shown = soon.slice(0, SOON_SHOWN)
  const more = soon.length - shown.length
  return (
    <div className="mb-1" data-waiting-soon>
      <ul className="flex flex-col" aria-label={t('Waiting tasks with a time today')}>
        {shown.map((s) => {
          const title = titleOf(s)
          return (
            <li key={s.task.id} className="flex min-h-9 items-center gap-2 rounded-control pl-2 hover:bg-hover" data-waiting-soon-task={s.task.id}>
              <span className="w-16 shrink-0 truncate text-meta tabular-nums text-muted" data-soon-time>
                {s.time ? formatTime(s.time) : t('Deadline')}
              </span>
              <button type="button" className="min-w-0 flex-1 truncate rounded-control py-1 text-left text-body text-default hover:text-strong"
                onClick={() => openTaskPanel(s.task.id)}>
                {title}
              </button>
              <Button variant="ghost" size="sm" className="shrink-0 text-meta"
                aria-label={t('Take a slot for {title}', { title })} onClick={() => act(runTakeSlot(s.task.id))} data-take-slot={s.task.id}>
                {t('Take a slot')}
              </Button>
            </li>
          )
        })}
      </ul>
      {more > 0 && (
        <Button variant="ghost" size="sm" className="ml-[4.5rem] text-meta text-muted" onClick={onOpenGroup} data-waiting-soon-more>
          {t('{n, plural, one {# more with a time} other {# more with a time}}', { n: more })}
        </Button>
      )}
    </div>
  )
}
