import type { Meta, StoryObj } from '@storybook/react-vite'
import { EISENHOWER } from '../lib/boardTemplates'
import { createLabel } from '../lib/labels'
import { useLiveSections } from '../lib/localData'
import { createTask } from '../lib/ops'
import { createBoardFromTemplate, createView, setOnDrop } from '../lib/views'
import { DashboardView } from './DashboardView'
import { RuleEditor } from './RuleEditor'
import { seeded, TODAY, withSeed } from './stories/fixtures'
import { useViewData } from './useViews'

// Core screen: a board of filters with on-drop rules (OpenSpec change rule-boards,
// task 3.6). The Eisenhower matrix created from its template over four sample
// tasks, and the rule editor of one column.
const meta: Meta = { title: 'Screens/Board of filters' }
export default meta

const noop = () => {}

function Board({ id }: { id: string }) {
  const data = useViewData()
  const dash = data.views.find((v) => v.id === id)
  return dash ? <DashboardView dashboard={dash} data={data} /> : null
}

/** The Eisenhower matrix: four quadrants with their rules (the bolt beside each count), one task in three of them, a parked task in none. */
export const Eisenhower: StoryObj = {
  ...withSeed(async () => {
    seeded.board = await createBoardFromTemplate(EISENHOWER, 'Eisenhower')
    await createTask({ title: 'Send the signed contract', priority: 1, due: { date: TODAY } })
    await createTask({ title: 'Plan the quarter', priority: 2 })
    await createTask({ title: 'Reply to the newsletter survey', priority: 4, due: { date: '2026-10-13' } })
    await createTask({ title: 'Learn the cello', priority: 3, start: 'someday' })
  }),
  render: () => <div className="-m-4 min-h-[36rem] bg-canvas"><Board id={seeded.board} /></div>,
}

function Editor({ id }: { id: string }) {
  const { views, labels, projects } = useViewData()
  const sections = useLiveSections()
  const view = views.find((v) => v.id === id)
  return view ? <RuleEditor view={view} labels={labels} projects={projects} sections={sections} onClose={noop} /> : null
}

/** The Rule dialog of "Errands": adds the errand label and sets today's date. */
export const RuleEditorDialog: StoryObj = {
  name: 'Rule editor',
  ...withSeed(async () => {
    const errand = await createLabel({ name: 'errand' })
    seeded.errands = await createView({ name: 'Errands', query: '@errand', pinned: false })
    await setOnDrop(seeded.errands, { add_labels: [errand], due: 'today' })
  }),
  render: () => <Editor id={seeded.errands} />,
}
