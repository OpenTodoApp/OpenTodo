import type { Meta, StoryObj } from '@storybook/react-vite'
import type { ReactNode } from 'react'
import type { LinkCandidate } from '../../lib/linkPicker'
import type { Reference } from '../../lib/noteLinks'
import { t } from '../../lib/i18n'
import { Icon } from '../../ui'
import { ReferencesSection } from '../LinkedReferences'
import { LinkOption, linkGroupLabel } from '../LinkOption'
import { RefChip } from '../RefChip'

// Links between notes, tasks and projects (OpenSpec change note-links): the link as
// it reads in a note (live, done, unreachable), the `[[` picker and Linked references.
const meta: Meta = { title: 'Screens/Note links' }
export default meta

function Column({ children }: { children: ReactNode }) {
  return <div className="bg-canvas p-4">{children}</div>
}

/** A note with a link to a task, a project, a done task and one the reader cannot open. */
export const Links: StoryObj = {
  render: () => (
    <Column>
      <div className="markdown user-text max-w-xl text-body">
        <p>
          Next: <RefChip kind="task" id="t1" title="Call the plumber" label="Call the plumber" /> about the sink, budget in{' '}
          <RefChip kind="project" id="p1" title="Renovation" label="Renovation" />. Already done:{' '}
          <RefChip kind="task" id="t2" title="Order tiles" label="Order tiles" done />. See also{' '}
          <RefChip kind="note" id="n1" title={null} label="Private plan" />.
        </p>
      </div>
    </Column>
  ),
}

const rows: LinkCandidate[] = [
  { kind: 'note', id: 'n1', title: 'Plumber quotes', secondary: 'Renovation', done: false },
  { kind: 'task', id: 't1', title: 'Call the plumber', secondary: 'Renovation', done: false },
  { kind: 'task', id: 't2', title: 'Plumbing budget', secondary: null, done: true },
  { kind: 'project', id: 'p1', title: 'Plumbing', secondary: null, done: false },
]

/** The `[[` picker: grouped by kind, the first row selected, New note last. */
export const Picker: StoryObj = {
  render: () => (
    <Column>
      <ul role="listbox" aria-label={t('Link to')} className="slash-menu link-menu" data-suggest="link">
        {rows.map((c, i) => [
          (i === 0 || rows[i - 1].kind !== c.kind) && <li key={`g${i}`} role="presentation" className="link-menu__group">{linkGroupLabel(c.kind)}</li>,
          <li key={c.id} role="option" aria-selected={i === 0} className="flex min-h-11 items-center gap-2 rounded-control px-2 py-1 text-body sm:min-h-9"><LinkOption c={c} /></li>,
        ])}
        <li role="option" aria-selected={false} className="flex min-h-11 items-center gap-2 rounded-control px-2 py-1 text-body sm:min-h-9">
          <Icon name="plus" size="sm" className="text-muted" /><span className="user-text truncate">{t('New note "{title}"', { title: 'plum' })}</span>
        </li>
      </ul>
    </Column>
  ),
}

const refs: Reference[] = [
  { kind: 'note', id: 'n2', title: 'Kitchen meeting', projectId: 'p1', updated: 3, snippet: { before: 'Next: ', link: 'Call the plumber', after: ' about the sink and the tiles.' } },
  { kind: 'task', id: 't3', title: 'Book the electrician', projectId: 'p1', updated: 2, snippet: { before: '…after ', link: 'Call the plumber', after: '' } },
  { kind: 'project', id: 'p2', title: 'House', projectId: null, updated: 1, snippet: { before: 'Open: ', link: 'Call the plumber', after: ', windows, garden.' } },
]

/** Below a task's notes: what links to it, with the line around each link. */
export const LinkedReferences: StoryObj = {
  render: () => <Column><div className="max-w-xl"><ReferencesSection target="task:t1" refs={refs} folded={false} project={(r) => (r.projectId ? 'Renovation' : null)} /></div></Column>,
}

/** In a project's note area: one folded line with the count. */
export const LinkedReferencesFolded: StoryObj = {
  render: () => <Column><div className="max-w-xl"><ReferencesSection target="project:p1" refs={refs} folded project={() => null} /></div></Column>,
}
