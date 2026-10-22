import type { Meta, StoryObj } from '@storybook/react-vite'
import { publishEncryption } from '../../lib/e2ee'
import { createLabel } from '../../lib/labels'
import { createProject, createTask } from '../../lib/ops'
import { createRule } from '../../lib/rules/store'
import { seeded, withSeed } from '../stories/fixtures'
import { RuleDialog } from './RuleDialog'
import { RulesView } from './RulesView'

// Automation rules (OpenSpec change automation-rules): the Rules page and the
// rule editor. The workbench has no server, so the page shows its offline state:
// the rules as this device holds them, without run counts.
const meta: Meta = { title: 'Screens/Rules' }
export default meta

/** Three rules: a label rule, a Sunday sweep and one turned off. */
export const List: StoryObj = {
  ...withSeed(async () => {
    const waiting = await createLabel({ name: 'waiting' })
    const work = await createProject({ name: 'Work' })
    await createRule({ name: 'Waiting', trigger: { kind: 'label.added', label_id: waiting }, actions: { priority: 3, section: { project_id: work, section_id: null } } })
    await createRule({ name: 'Sunday sweep', trigger: { kind: 'schedule', at: '18:00', weekdays: [7] }, condition: { due: 'overdue' }, actions: { due: 'tomorrow' } })
    await createRule({ name: 'Done means done', trigger: { kind: 'task.completed' }, actions: { remove_labels: [waiting] }, enabled: false })
  }),
  render: () => <div className="-m-4 bg-canvas"><RulesView /></div>,
}

/** No rules yet. */
export const Empty: StoryObj = {
  ...withSeed(async () => undefined),
  render: () => <div className="-m-4 bg-canvas"><RulesView /></div>,
}

/** The editor with a label condition matching two open tasks. */
export const Editor: StoryObj = {
  ...withSeed(async () => {
    publishEncryption({ enabled: false })
    seeded.task = await createLabel({ name: 'errand' })
    await createTask({ title: 'Buy oat milk', labels: [seeded.task] })
    await createTask({ title: 'Return the parcel', labels: [seeded.task] })
  }),
  render: () => <RuleDialog me="me" onClose={() => undefined}
    draft={{ name: 'Errands first', trigger: { kind: 'task.created' }, condition: { labels: { all: [seeded.task] } }, actions: { priority: 1, due: 'today' } }} />,
}

/** An encrypted account: the comment action is disabled with its reason. */
export const EditorEncrypted: StoryObj = {
  name: 'Editor, encrypted account',
  ...withSeed(async () => { publishEncryption({ enabled: true }) }),
  render: () => <RuleDialog me="me" onClose={() => undefined} draft={{ name: 'Waiting', trigger: { kind: 'task.created' }, condition: null, actions: {} }} />,
}
