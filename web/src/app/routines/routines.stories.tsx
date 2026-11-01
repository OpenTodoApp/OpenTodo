import type { Meta, StoryObj } from '@storybook/react-vite'
import { publishEncryption } from '../../lib/e2ee'
import { createLabel } from '../../lib/labels'
import { createProject, createTask } from '../../lib/ops'
import { createRule } from '../../lib/rules/store'
import { seeded, withSeed } from '../stories/fixtures'
import { AddStepSheet } from './AddStep'
import { RoutineEditor } from './RoutineEditor'
import { RoutinePage } from './RoutinePage'
import { RoutinesView } from './RoutinesView'
import { RunDetail } from './RunHistory'
import { InboxCardView } from './RoutinesInboxCard'
import type { InboxLine } from '../../lib/rules/inbox'

// Routines (OpenSpec change routines-editor): the page, the sentence-card
// editor as its own page (routines-editor-page: steps in a centred column, Test
// and History beside them from 1024 px, tabs below), the Add step sheet and a
// run's detail. The workbench has no server,
// so the page shows its offline state and previews come from local data.
const meta: Meta = { title: 'Screens/Routines' }
export default meta

async function seedGroceries(): Promise<string> {
  const errands = await createProject({ name: 'Errands' })
  const list = await createTask({ title: 'Groceries', description: '- oat milk\n- bread\n- eggs\n- apples\n- rice\n- tea\n- soap' })
  return createRule({ name: 'Groceries', trigger: { kind: 'schedule', at: '17:00', weekdays: [5] }, actions: null, steps: [
    { id: 'g', kind: 'get_task', in: { task: { literal: { task: list } } } },
    { id: 'a', kind: 'note_text', in: { of: { ref: 'g' } } },
    { id: 'b', kind: 'split_lines', in: { text: { ref: 'a' } } },
    { id: 'c', kind: 'create_tasks', in: { text: { ref: 'b' }, project: { literal: { project: errands } } } },
  ] })
}

/** A one-card rule, a routine of four steps and one turned off. */
export const List: StoryObj = {
  ...withSeed(async () => {
    const waiting = await createLabel({ name: 'waiting' })
    await createRule({ name: 'Waiting', trigger: { kind: 'label.added', label_id: waiting }, actions: { priority: 3 } })
    await seedGroceries()
    await createRule({ name: 'Sunday sweep', trigger: { kind: 'schedule', at: '18:00', weekdays: [7] }, condition: { due: 'overdue' }, actions: { due: 'tomorrow' }, enabled: false })
  }),
  render: () => <div className="-m-4 bg-canvas"><RoutinesView /></div>,
}

/** No routines yet. */
export const Empty: StoryObj = {
  ...withSeed(async () => undefined),
  render: () => <div className="-m-4 bg-canvas"><RoutinesView /></div>,
}

/** The editor: sentence cards with chips, outputs and previews from local data. */
export const Editor: StoryObj = {
  ...withSeed(async () => {
    publishEncryption({ enabled: false })
    seeded.task = await seedGroceries()
  }),
  render: () => <div className="-m-4 bg-canvas"><RoutineEditor draft={{ name: 'Groceries', trigger: { kind: 'manual' }, condition: null, steps: [
    { id: 'a', kind: 'split_lines', in: { text: { literal: 'oat milk\nbread\neggs' } } },
    { id: 'b', kind: 'count', in: { list: { ref: 'a' } } },
    { id: 'c', kind: 'if', in: { value: { ref: 'b' }, is: { literal: { '>': 2 } } }, then: [{ id: 'd', kind: 'notify', in: { text: { literal: '{b} groceries' } } }], otherwise: [] },
  ] }} onBack={() => undefined} /></div>,
}

/** A saved routine's page: breadcrumb, Save, Test and Run now, Test and History beside the steps. */
export const EditorPage: StoryObj = {
  name: 'Editor page, saved routine',
  ...withSeed(async () => {
    publishEncryption({ enabled: false })
    seeded.rule = await seedGroceries()
  }),
  render: () => <div className="-m-4 bg-canvas"><RoutinePage route={{ view: 'rules', id: seeded.rule }} /></div>,
}

/** A type error on a card with its one-tap fix. */
export const EditorError: StoryObj = {
  name: 'Editor, type error',
  ...withSeed(async () => undefined),
  render: () => <div className="-m-4 bg-canvas"><RoutineEditor draft={{ name: 'Due today', trigger: { kind: 'manual' }, condition: null, steps: [
    { id: 'a', kind: 'find_tasks', in: { condition: { literal: { due: 'today' } } } },
    { id: 'b', kind: 'notify', in: { text: { ref: 'a' } } },
  ] }} onBack={() => undefined} /></div>,
}

/** Add step: suggestions after a list of lines, the groups below. */
export const AddStep: StoryObj = {
  name: 'Add step sheet',
  render: () => <AddStepSheet above="lines" catalogue={{ email_me: { kind: 'email_me', group: 'communication', available: false, reason: 'email_not_configured', setting: 'server.email' } }} onPick={() => undefined} onClose={() => undefined} />,
}

/** A run's detail, offline: the run is on the server. */
export const RunDetailOffline: StoryObj = {
  name: 'Run detail, offline',
  ...withSeed(async () => { seeded.task = await seedGroceries() }),
  render: () => <RunDetail rule={undefined} ruleId="r1" runId="x1" onClose={() => undefined} />,
}

const inboxLines: InboxLine[] = [
  { ruleId: 'd', name: 'Weekly digest', kind: 'failure', text: 'Weekly digest failed · Not available: outgoing email is not set up', runs: [], at: 3 },
  { ruleId: 's', name: 'Morning sweep', kind: 'success', text: 'Morning sweep ran 2 times · 9 tasks changed', runs: [], at: 2 },
  { ruleId: 'g', name: 'Groceries', kind: 'success', text: 'Groceries · 7 tasks created · Friday 17:00', runs: [], at: 1 },
]

/** The Inbox card "Routines since your last visit". */
export const InboxCard: StoryObj = {
  name: 'Inbox card',
  render: () => <div className="max-w-xl"><InboxCardView lines={inboxLines} more={0} hide={false} online onOpen={() => undefined} onDismiss={() => undefined}
    onSeen={() => undefined} onHide={() => undefined} onAll={() => undefined} /></div>,
}
