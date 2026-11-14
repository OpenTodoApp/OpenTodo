// Check-ins (OpenSpec change habit-notes, design D3): the habit's records that have a
// note, newest first, each with its date, its state and the note, paged by 20. Read
// from the device's rows (lib/habits checkInsOf, which leaves out records written
// before D1 that only hold a copy of the habit's note), so it renders offline. The
// date opens that day's note for editing.
import { useMemo, useState } from 'react'
import { formatDate } from '../../lib/dates'
import { checkInsOf } from '../../lib/habitNotes'
import { t } from '../../lib/i18n'
import type { Task } from '../../lib/types'
import { Button, Icon, ListGroupHeader } from '../../ui'
import { Markdown } from '../Markdown'
import { openDayNote } from './dayNoteStore'
import { STATE_TEXT } from './habitText'

const PAGE = 20

export function CheckIns({ series, rows, today }: { series: Task; rows: readonly Task[]; today: string }) {
  const all = useMemo(() => checkInsOf(series, rows), [series, rows])
  const [shown, setShown] = useState(PAGE)
  if (all.length === 0) return null
  return (
    <section aria-label={t('Check-ins')} data-check-ins>
      <ListGroupHeader title={t('Check-ins')} count={all.length} countLabel={(n) => t('{n, plural, one {# check-in} other {# check-ins}}', { n })} />
      <ul className="divide-y divide-soft">
        {all.slice(0, shown).map((c) => (
          <li key={c.record.id} className="py-2" data-check-in-entry={c.date}>
            <button type="button" onClick={() => openDayNote(series.id, c.date)}
              className="group flex w-full items-center gap-2 rounded-chip text-left text-meta text-muted hover:text-default focus-visible:outline-2 focus-visible:outline-focus">
              <span className="text-default">{formatDate(c.date, 'full', undefined, today)}</span>
              <span>· {STATE_TEXT[c.state]}</span>
              <Icon name="pencil" size="xs" className="ml-auto opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100" />
            </button>
            <Markdown source={c.record.description} taskId={c.record.id} className="mt-1 text-body text-default" />
          </li>
        ))}
      </ul>
      {shown < all.length && (
        <Button size="sm" variant="ghost" className="mt-1" onClick={() => setShown(shown + PAGE)} data-check-ins-more>{t('Show more')}</Button>
      )}
    </section>
  )
}
