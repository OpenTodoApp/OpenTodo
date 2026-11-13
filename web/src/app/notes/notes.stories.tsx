import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState, type ReactNode } from 'react'
import type { NoteEntry } from '../../lib/noteList'
import type { NoteToken } from '../../lib/noteQuery'
import { NoteSearchField } from './NoteSearchField'
import { NoteMenu, NoteRow } from './NoteRow'
import { GroupHeading, NewNoteRow, NotesEmpty, NotesSortItems, sortHeading } from './NotesPage'
import { pickNoteSort, type NoteSort } from '../../lib/noteSort'
import { Icon, Menu } from '../../ui'
import { HEX, label, project } from '../stories/fixtures'

// Core screen: Notes (`/notes`, OpenSpec change notes-overview task 4.11): the note
// row, the empty state and the search field (weekly in the inventory); the home with
// Pinned and Recent and the New note row of the search field (notes-home); one-line
// rows and the search chips (notes-space); the header menu's Sort (notes-sort).
const meta: Meta = { title: 'Screens/Notes' }
export default meta

function Column({ children }: { children: ReactNode }) {
  return <div className="bg-canvas p-4">{children}</div>
}

const home = project({ id: 'p-home', name: 'Renovation', color: HEX.orange })
const work = project({ id: 'p-work', name: 'Work', color: HEX.blue })
const reference = label('l-ref', 'reference', HEX.teal)
const ideas = label('l-ideas', 'ideas', HEX.violet)

const entry = (over: Partial<NoteEntry> & Pick<NoteEntry, 'key' | 'source' | 'title' | 'text'>): NoteEntry => ({ id: over.key, projectId: null, labels: [], updated: 0, ...over })

/** The three sources, a long title, an untitled note and a completed task's note. */
export const Rows: StoryObj = {
  render: () => (
    <Column>
      <ul className="max-w-2xl space-y-0.5">
        <NoteRow entry={entry({ key: 'n1', source: 'note', title: 'Meeting with the architect', text: '- move the kitchen wall\n- skylight in the hall', projectId: home.id, labels: [reference.id] })}
          project={home} labels={[reference]} updated="5 min ago" onOpen={() => {}} menu={<NoteMenu pinned={false} onPin={() => {}} onTurnIntoTask={() => {}} onDelete={() => {}} />} />
        <NoteRow entry={entry({ key: 't1', source: 'task', title: 'Kitchen', text: '**Tiles**: white, matte. Ask about delivery before the end of the month and the price of grout in two colours.', projectId: home.id })}
          project={home} labels={[]} updated="2 h ago" onOpen={() => {}} current />
        <NoteRow entry={entry({ key: 'p1', source: 'project', title: 'Work', text: 'Quarterly goals and the team rota.', projectId: work.id })}
          project={work} labels={[]} updated="3 d ago" onOpen={() => {}} />
        <NoteRow entry={entry({ key: 'n2', source: 'note', title: '', text: 'Wi-Fi: home-5G', labels: [ideas.id] })}
          labels={[ideas]} updated="12 Oct" onOpen={() => {}} menu={<NoteMenu pinned={false} onPin={() => {}} onTurnIntoTask={() => {}} onDelete={() => {}} />} />
        <NoteRow entry={entry({ key: 't2', source: 'task', title: 'Renew passport', text: 'Two photos, the old passport.', marker: 'completed' })}
          labels={[]} updated="1 Oct" onOpen={() => {}} />
      </ul>
    </Column>
  ),
}

/** While searching: the snippet with the matched word highlighted. */
export const SearchResult: StoryObj = {
  render: () => (
    <Column>
      <ul className="max-w-2xl">
        <NoteRow entry={entry({ key: 'n3', source: 'note', title: 'Trip', text: 'the ferry leaves at 7' })} labels={[]} updated="just now" onOpen={() => {}}
          snippet={[{ text: '…the ', mark: false }, { text: 'ferry', mark: true }, { text: ' leaves at 7…', mark: false }]} />
      </ul>
    </Column>
  ),
}

/** The home (notes-home D4): pinned notes first, then the others under Recent. */
export const Home: StoryObj = {
  render: () => (
    <Column>
      <ul className="max-w-2xl space-y-0.5">
        <GroupHeading title="Pinned" count={2} testId="pinned" />
        <NoteRow entry={entry({ key: 'n4', source: 'note', title: 'Wi-Fi', text: 'home-5G, the password is on the router' })} labels={[]} updated="3 d ago" onOpen={() => {}}
          menu={<NoteMenu pinned onPin={() => {}} onTurnIntoTask={() => {}} onDelete={() => {}} />} />
        <NoteRow entry={entry({ key: 'n5', source: 'note', title: 'Packing list', text: 'Passport, chargers, the blue jacket', labels: [reference.id] })} labels={[reference]} updated="12 Oct" onOpen={() => {}}
          menu={<NoteMenu pinned onPin={() => {}} onTurnIntoTask={() => {}} onDelete={() => {}} />} />
        <GroupHeading title="Recent" count={2} testId="recent" />
        <NoteRow entry={entry({ key: 'n1', source: 'note', title: 'Meeting with the architect', text: '- move the kitchen wall\n- skylight in the hall', projectId: home.id })}
          project={home} labels={[]} updated="5 min ago" onOpen={() => {}} menu={<NoteMenu pinned={false} onPin={() => {}} onTurnIntoTask={() => {}} onDelete={() => {}} />} />
        <NoteRow entry={entry({ key: 't1', source: 'task', title: 'Kitchen', text: '**Tiles**: white, matte.', projectId: home.id })} project={home} labels={[]} updated="2 h ago" onOpen={() => {}} />
      </ul>
    </Column>
  ),
}

/** Typing in the search field (notes-home D3): New note "<text>" first, the cursor on the best match. */
export const WriteFromSearch: StoryObj = {
  render: () => (
    <Column>
      <ul className="max-w-2xl space-y-0.5">
        <NewNoteRow text="ferry" cursor={false} onCreate={() => {}} />
        <NoteRow entry={entry({ key: 'n3', source: 'note', title: 'Trip', text: 'the ferry leaves at 7' })} labels={[]} updated="just now" onOpen={() => {}} cursor
          snippet={[{ text: '…the ', mark: false }, { text: 'ferry', mark: true }, { text: ' leaves at 7…', mark: false }]} />
      </ul>
    </Column>
  ),
}

/** Nothing matches: New note "<text>" is under the cursor and Enter writes it. */
export const WriteNew: StoryObj = {
  render: () => (
    <Column>
      <ul className="max-w-2xl"><NewNoteRow text="Packing for Lisbon" cursor onCreate={() => {}} /></ul>
    </Column>
  ),
}

/** No notes yet: one sentence and New note. */
export const Empty: StoryObj = {
  render: () => <Column><NotesEmpty onNew={() => {}} /></Column>,
}

function Search({ text: initial = '', chips }: { text?: string; chips: NoteToken[] }) {
  const [tokens, setTokens] = useState<NoteToken[]>(chips)
  const [text, setText] = useState(initial)
  const world = { projects: [home, work], labels: [reference, ideas], notes: [] }
  return (
    <Column>
      <div className="flex max-w-2xl">
        <NoteSearchField text={text} onText={setText} tokens={tokens} onTokens={setTokens} projects={[home, work]} labels={[reference, ideas]} world={world}
          inputRef={null} onListKey={() => {}} label="Search notes" />
      </div>
    </Column>
  )
}

/** The search field with tokens as chips (notes-space D6): a project, a label, a kind and an age, then words. */
export const SearchChips: StoryObj = {
  render: () => <Search text="tiles" chips={[{ key: 'in', id: home.id, name: home.name }, { key: 'label', id: reference.id, name: reference.name }, { key: 'kind', value: 'note' }, { key: 'changed', value: '<7d' }]} />,
}

/** A chip whose project was deleted reads struck out and matches nothing. */
export const SearchChipGone: StoryObj = {
  render: () => <Search chips={[{ key: 'in', id: 'p-gone', name: 'Old flat' }, { key: 'pinned' }]} />,
}

function SortMenu() {
  const [sort, setSort] = useState<NoteSort>({ by: 'title', reversed: false })
  return (
    <Column>
      <div className="flex max-w-2xl justify-end" style={{ minHeight: 220 }}>
        <Menu kind="menu" label="More actions" open trigger={<Icon name="ellipsis" size="md" />} triggerClassName="ui-btn ui-btn--ghost ui-btn--sm touch-target px-2 py-1.5" width="sm:w-60">
          <NotesSortItems sort={sort} onSort={(by) => setSort(pickNoteSort(sort, by))} />
        </Menu>
      </div>
      <ul className="max-w-2xl space-y-0.5">
        <GroupHeading title={sortHeading(sort)} count={2} testId="recent" />
        <NoteRow entry={entry({ key: 'n6', source: 'note', title: 'Week 2', text: 'Retro notes' })} labels={[]} updated="9 Oct" onOpen={() => {}} />
        <NoteRow entry={entry({ key: 'n7', source: 'note', title: 'Week 10', text: 'Planning' })} labels={[]} updated="just now" onOpen={() => {}} />
      </ul>
    </Column>
  )
}

/** Sort in the header's menu (notes-sort D1): Title checked, its arrow, the heading named after the order. */
export const SortOrder: StoryObj = { render: () => <SortMenu /> }

/** Templates (note-templates): a template's row says Template; the template chip in the search field. */
export const Templates: StoryObj = {
  render: () => (
    <Column>
      <ul className="max-w-2xl space-y-0.5">
        <NoteRow entry={entry({ key: 'n3', source: 'note', title: 'Meeting {{date}}', text: '## Attendees\n## Notes\n## Actions', projectId: work.id, template: true })}
          project={work} labels={[]} updated="2 d ago" onOpen={() => {}} menu={<NoteMenu pinned={false} template onTemplate={() => {}} onPin={() => {}} onTurnIntoTask={() => {}} onDelete={() => {}} />} />
        <NoteRow entry={entry({ key: 'n4', source: 'note', title: 'Weekly review 12/11/2026', text: '## What went well', projectId: home.id })}
          project={home} labels={[]} updated="1 h ago" onOpen={() => {}} menu={<NoteMenu pinned={false} onTemplate={() => {}} onPin={() => {}} onTurnIntoTask={() => {}} onDelete={() => {}} />} />
      </ul>
      <div className="mt-4"><Search chips={[{ key: 'template' }]} /></div>
    </Column>
  ),
}

/** Ticking notes (notes-bulk-actions D2): checkboxes in the kind icon's slot, two notes ticked, a task note not tickable. */
export const Ticked: StoryObj = {
  render: () => (
    <Column>
      <ul className="max-w-2xl space-y-0.5">
        <NoteRow entry={entry({ key: 'note:a', source: 'note', title: 'Agenda 3 Nov', text: 'Budget, rota' })} labels={[]} updated="2 h ago" onOpen={() => {}} tick={{ ticked: true, shown: true, onTick: () => {} }} />
        <NoteRow entry={entry({ key: 'note:b', source: 'note', title: 'Agenda 4 Nov', text: 'Hiring' })} labels={[reference]} updated="1 d ago" onOpen={() => {}} tick={{ ticked: true, shown: true, onTick: () => {} }} />
        <NoteRow entry={entry({ key: 'task:c', source: 'task', title: 'Call the plumber', text: 'the boiler', projectId: home.id })} project={home} labels={[]} updated="2 d ago" onOpen={() => {}} />
        <NoteRow entry={entry({ key: 'note:d', source: 'note', title: 'Agenda 5 Nov', text: 'Launch plan' })} labels={[]} updated="3 d ago" onOpen={() => {}} tick={{ ticked: false, shown: true, onTick: () => {} }} />
      </ul>
    </Column>
  ),
}
