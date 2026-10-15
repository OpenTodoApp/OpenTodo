import type { Meta, StoryObj } from '@storybook/react-vite'
import { Avatar } from '../../ui'
import { ComboboxPanel } from '../../ui'
import { Icon } from '../../ui'
import { Switch } from '../../ui'
import { LabelChip } from '../LabelPicker'
import { PRIORITIES } from './Properties'
import { PropertyRow } from './PropertyRow'

// The task panel's properties rows (OpenSpec task-detail-redesign, D1), with a
// fixture task: values read as text, editors open on demand. Static values keep
// the story independent of local data and of today's date.
const meta: Meta = { title: 'Task/Properties' }
export default meta

const noop = () => {}
const label = (id: string, name: string, color: string) => ({ id, name, color, position: 0, created_at: 0, deleted_at: null, _clock: {} })
const PROJECTS = [
  { key: 'inbox', label: 'Inbox', path: [] as string[] },
  { key: 'work', label: 'Work', path: [] },
  { key: 'acme', label: 'Acme', path: ['Work', 'Clients'] },
]

function Priority({ value }: { value: number }) {
  return (
    <div className="flex gap-1.5 px-1 py-0.5" role="group" aria-label="Priority">
      {PRIORITIES.map(({ p, label: l, cls }) => (
        <button key={p} type="button" aria-pressed={value === p} className={`min-w-11 rounded-control border px-2.5 py-1 text-sm ${cls} ${value === p ? 'bg-sunken font-semibold dark:bg-raised' : 'border-dashed'}`}>{l}</button>
      ))}
    </div>
  )
}

function Card({ editing = false, solo = true }: { editing?: boolean; solo?: boolean }) {
  return (
    <section aria-label="Properties" className="max-w-md rounded-card border border-default bg-surface px-3 py-1">
      <PropertyRow icon="folder" label="Project" value={<span className="flex items-center gap-2"><span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-emerald-500" />Acme</span>}
        editing={editing} onEditingChange={noop}
        editor={() => <ComboboxPanel label="Project" placeholder="Find or create a project…" source={PROJECTS} getKey={(i) => i.key} getLabel={(i) => i.label} getPath={(i) => i.path} onPick={noop} />} />
      <PropertyRow icon="kanban" label="Section" value="Doing" editor={() => null} />
      <PropertyRow icon="corner-down-right" label="Parent task" empty placeholder="No parent" editor={() => null} />
      {solo ? (
        <PropertyRow icon="user-check" label="Assignee" control={
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-2 py-1">
            <span className="flex items-center gap-2 text-sm text-default"><Avatar id="u-me" name="You" size="sm" />You</span>
            <Switch label="Show in Assigned to me" checked={false} onChange={noop} />
          </div>
        } />
      ) : (
        <PropertyRow icon="user-check" label="Assignee" value={<span className="flex items-center gap-2"><Avatar id="u-bob" name="Bob Okafor" size="sm" />Bob Okafor</span>} editor={() => null} />
      )}
      <PropertyRow icon="flag" label="Priority" control={<Priority value={2} />} />
      <PropertyRow icon="calendar-days" label="Due" value="Tue 3 Nov · 09:00" editor={() => null}
        aside={<button type="button" className="btn-ghost px-2 py-1 text-meta"><Icon name="globe" />Floating</button>} />
      <PropertyRow icon="alarm-clock" label="Reminders" control={
        <div className="flex flex-wrap gap-1.5 px-1 py-0.5">
          <span className="inline-flex items-center gap-1 rounded-full border border-default px-2.5 py-0.5 text-sm text-default"><Icon name="bell" className="text-faint" />30 minutes before</span>
          <button type="button" className="btn-ghost px-2 py-1 text-sm text-accent"><Icon name="plus" />Add reminder</button>
        </div>
      } />
      <PropertyRow icon="clock" label="Estimate" value="45m" editor={() => null} />
      <PropertyRow icon="repeat" label="Repeat" empty placeholder="Does not repeat" editor={() => null} />
      <PropertyRow icon="tag" label="Labels" value={<span className="flex flex-wrap gap-1"><LabelChip label={label('l1', 'errand', '#16a34a')} /><LabelChip label={label('l2', 'waiting', '#d97706')} /></span>} editor={() => null} />
    </section>
  )
}

export const PropertiesCard: StoryObj = { render: () => <Card /> }
export const SharedProject: StoryObj = { render: () => <Card solo={false} /> }
export const ProjectEditorOpen: StoryObj = { render: () => <div style={{ minHeight: 520 }}><Card editing /></div> }
export const Rows: StoryObj = {
  render: () => (
    <div className="max-w-md space-y-1 rounded-card border border-default bg-surface px-3 py-1">
      <PropertyRow icon="calendar-days" label="Due" empty placeholder="No due date" editor={() => null} />
      <PropertyRow icon="folder" label="Project" readOnly value="Work" />
      <PropertyRow icon="kanban" label="Section" readOnly value="Doing" note="Subtasks follow their parent task’s section." />
      <PropertyRow icon="corner-down-right" label="Parent task" value="Renovate the kitchen" editor={() => null}
        note={<span className="text-danger">A task cannot be its own parent.</span>} />
    </div>
  ),
}
