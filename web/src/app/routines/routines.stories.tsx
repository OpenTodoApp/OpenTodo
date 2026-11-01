import type { Meta, StoryObj } from '@storybook/react-vite'
import { useRef, useState } from 'react'
import { publishEncryption } from '../../lib/e2ee'
import { createLabel } from '../../lib/labels'
import { createProject, createTask, updateProject } from '../../lib/ops'
import { createRule } from '../../lib/rules/store'
import { seeded, withSeed } from '../stories/fixtures'
import { AddStepSheet } from './AddStep'
import { RoutineEditor } from './RoutineEditor'
import { RoutinePage } from './RoutinePage'
import { RoutinesView } from './RoutinesView'
import { RunDetail } from './RunHistory'
import { InboxCardView } from './RoutinesInboxCard'
import { ChoicePopover, InlineText } from './pickers'
import { WordButton } from '../../ui'
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
  const list = await createProject({ name: 'Groceries' })
  await updateProject(list, { description: '- oat milk\n- bread\n- eggs\n- apples\n- rice\n- tea\n- soap' })
  // A project's note, chosen in the picker: no task chosen by hand (routines-dynamic-data).
  return createRule({ name: 'Groceries', trigger: { kind: 'schedule', at: '17:00', weekdays: [5] }, actions: null, steps: [
    { id: 'a', kind: 'note_text', in: { of: { literal: { project: list } } } },
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

async function seedOverdue(): Promise<void> {
  for (const [title, date] of [['Call the plumber', '2026-10-15'], ['Renew passport', '2026-10-18'], ['Send invoice', '2026-10-19'], ['Book dentist', '2026-10-20']]) {
    await createTask({ title, due: { date } })
  }
}

/** The owner's example (routines-dynamic-data): Find → Pick the first → Comment on the picked task, nothing chosen by hand. */
export const EditorPick: StoryObj = {
  name: 'Editor, pick then comment',
  ...withSeed(seedOverdue),
  render: () => <div className="-m-4 bg-canvas"><RoutineEditor draft={{ name: 'Nudge the oldest', trigger: { kind: 'manual' }, condition: null, steps: [
    { id: 'a', kind: 'find_tasks', in: { condition: { literal: { due: 'overdue' } } } },
    { id: 'b', kind: 'take', in: { list: { ref: 'a' }, n: { literal: 1 }, from: { literal: 'start' } } },
    { id: 'c', kind: 'add_comment', in: { task: { ref: 'b' }, text: { literal: 'Still on it?' } } },
  ] }} onBack={() => undefined} /></div>,
}

/** The owner's second example: inside Repeat for each, the comment reads each task. */
export const EditorRepeat: StoryObj = {
  name: 'Editor, repeat with each task',
  ...withSeed(seedOverdue),
  render: () => <div className="-m-4 bg-canvas"><RoutineEditor draft={{ name: 'Nudge each', trigger: { kind: 'manual' }, condition: null, steps: [
    { id: 'a', kind: 'find_tasks', in: { condition: { literal: { due: 'overdue' } } } },
    { id: 'b', kind: 'repeat', in: { list: { ref: 'a' } }, do: [{ id: 'c', kind: 'add_comment', in: { task: { ref: 'item' }, text: { literal: 'Still on it?' } } }] },
  ] }} onBack={() => undefined} /></div>,
}

/** A word's list next to it (routines-dynamic-data D13): flowing values first, then More; no centred modal. */
function WordList() {
  const anchor = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(true)
  const noop = () => undefined
  return (
    <div className="-m-4 min-h-[28rem] bg-canvas p-4">
      <p className="surface-card max-w-xl p-3 text-body">Comment on <WordButton ref={anchor} label="Task" value="the picked task" chip placeholder="choose which tasks" action="change" haspopup="listbox" expanded={open} onClick={() => setOpen(true)} />: Still on it?</p>
      <ChoicePopover open={open} onClose={() => setOpen(false)} anchor={anchor} label="Task" choices={[
        { key: 'b', label: 'the picked task', group: 'From earlier steps', selected: true, run: noop },
        { key: 'a', label: 'the tasks', group: 'From earlier steps', run: noop },
        { key: 'find', label: 'Find tasks…', group: 'More', run: noop },
        { key: 'specific', label: 'A specific task…', group: 'More', run: noop },
      ]} />
    </div>
  )
}

export const WordListOpen: StoryObj = { name: 'Word list, open', render: () => <WordList /> }

/** A text edited in place, with "+ value" to insert what an earlier step produced. */
export const TextInPlace: StoryObj = {
  name: 'Text in place',
  render: () => (
    <div className="-m-4 bg-canvas p-4">
      <div className="surface-card max-w-xl p-3 text-body">
        Notify me: <InlineText label="Text" value="«the count» tasks waiting" max={300} insertable={[{ ref: 'b', name: 'the count' }, { ref: 'a', name: 'the tasks' }]} onCommit={() => undefined} onCancel={() => undefined} />
      </div>
    </div>
  ),
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
