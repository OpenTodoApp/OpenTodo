import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState, type ReactNode } from 'react'
import { NO_NOTE_FILTERS, type NoteEntry, type NoteFilters } from '../../lib/noteList'
import { NoteFiltersSheet, NoteFilterControls } from './NoteFilters'
import { NoteMenu, NoteRow } from './NoteRow'
import { NotesEmpty } from './NotesPage'
import { HEX, label, project } from '../stories/fixtures'

// Core screen: Notes (`/notes`, OpenSpec change notes-overview task 4.11): the note
// row, the empty state and the filter row (weekly in the inventory).
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
          project={home} labels={[reference]} updated="5 min ago" onOpen={() => {}} menu={<NoteMenu onTurnIntoTask={() => {}} onDelete={() => {}} />} />
        <NoteRow entry={entry({ key: 't1', source: 'task', title: 'Kitchen', text: '**Tiles**: white, matte. Ask about delivery before the end of the month and the price of grout in two colours.', projectId: home.id })}
          project={home} labels={[]} updated="2 h ago" onOpen={() => {}} current />
        <NoteRow entry={entry({ key: 'p1', source: 'project', title: 'Work', text: 'Quarterly goals and the team rota.', projectId: work.id })}
          project={work} labels={[]} updated="3 d ago" onOpen={() => {}} />
        <NoteRow entry={entry({ key: 'n2', source: 'note', title: '', text: 'Wi-Fi: home-5G', labels: [ideas.id] })}
          labels={[ideas]} updated="12 Oct" onOpen={() => {}} menu={<NoteMenu onTurnIntoTask={() => {}} onDelete={() => {}} />} />
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

/** No notes yet: one sentence and New note. */
export const Empty: StoryObj = {
  render: () => <Column><NotesEmpty onNew={() => {}} /></Column>,
}

function Filters({ phone }: { phone?: boolean }) {
  const [filters, setFilters] = useState<NoteFilters>({ ...NO_NOTE_FILTERS, source: 'note', projectId: home.id })
  const props = { filters, onChange: setFilters, projects: [home, work], labels: [reference, ideas] }
  return (
    <Column>
      <div className="flex flex-wrap items-center gap-2">
        <input type="search" className="ui-input min-w-0 flex-[1_1_14rem]" aria-label="Search notes" placeholder="Search notes" />
        {phone ? <NoteFiltersSheet {...props} /> : <NoteFilterControls {...props} />}
      </div>
    </Column>
  )
}

/** The filter row on a computer: Source, Project and Label, two of them set. */
export const FilterRow: StoryObj = { render: () => <Filters /> }

/** On a phone the filters sit behind one Filters button. */
export const FilterButton: StoryObj = { render: () => <Filters phone /> }
