import type { Meta, StoryObj } from '@storybook/react-vite'
import type { Decorator } from '@storybook/react-vite'
import type { ReactNode } from 'react'
import { createView } from '../../lib/views'
import { SavedViewRoute } from '../SavedViewView'
import { seedInbox, withSeed } from '../stories/fixtures'
import { DisplayOptionsBody } from './DisplayPanel'
import { SaveViewCard } from './SaveViewCard'

// A saved view with its toolbar, filter panel and display options (OpenSpec change
// views-and-display; mock-ups view-display.png, view-save.png, filter-builder.png).
const meta: Meta = { title: 'Screens/Saved view' }
export default meta

function Column({ children }: { children: ReactNode }) {
  return <div className="-m-4 h-[48rem] overflow-y-auto bg-canvas">{children}</div>
}

let viewId = ''
const seedView = (over: Parameters<typeof createView>[0]) => async () => {
  await seedInbox()
  viewId = await createView(over)
}

/** The filter panel open on this device (it is closed by default on a saved view). */
const filterOpen: Decorator = (Story) => {
  try { localStorage.setItem('opentodo.filterBuilder.view', 'open') } catch { /* storage unavailable */ }
  return <Story />
}

/** "Errands": the conditions as chips in the toolbar, grouped by project. */
export const List: StoryObj = {
  ...withSeed(seedView({ name: 'Errands', query: '@errand | @waiting' })),
  render: () => <Column><SavedViewRoute id={viewId} /></Column>,
}

/** The same view as a board: one column of cards per group. */
export const Board: StoryObj = {
  ...withSeed(seedView({ name: 'Errands', query: '@errand | @waiting', layout: 'board' })),
  render: () => <Column><SavedViewRoute id={viewId} /></Column>,
}

/** Rows that leave out the estimate, the labels and the project ("Show on rows"). */
export const HiddenProperties: StoryObj = {
  ...withSeed(seedView({ name: 'Plain list', query: 'open', group_by: 'none', hidden_props: ['estimate', 'labels', 'project'] })),
  render: () => <Column><SavedViewRoute id={viewId} /></Column>,
}

const errandsSeed = withSeed(seedView({ name: 'Errands', query: '@errand & (p2 | no date)' }))
/** The filter panel under the toolbar: the builder, the count and the formula line. */
export const FilterPanelOpen: StoryObj = {
  ...errandsSeed,
  decorators: [...(errandsSeed.decorators as Decorator[]), filterOpen],
  render: () => <Column><SavedViewRoute id={viewId} /></Column>,
}

/** The display panel's content: board layout, completed shown, two properties hidden, more options folded. */
export const DisplayOptions: StoryObj = {
  render: () => (
    <div className="w-[22rem] rounded-card border border-strong bg-pop">
      <DisplayOptionsBody onChange={() => {}}
        value={{ layout: 'board', groupBy: 'project', sortBy: 'due', sortDir: 'asc', showCompleted: true, hidden: ['estimate', 'origin'] }} />
    </div>
  ),
}

/** "Save as view" in place of the New view page's header. */
export const SaveCard: StoryObj = {
  render: () => <SaveViewCard onSave={async () => {}} onCancel={() => {}} />,
}
