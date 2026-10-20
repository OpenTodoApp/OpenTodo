import type { Meta, StoryObj } from '@storybook/react-vite'
import { Badge, Icon, IconButton, Tabs } from '../../ui'
import { LabelChip } from '../LabelPicker'
import { PRIORITIES } from './Properties'
import { PropertyChip } from './PropertyChip'
import { useTask } from '../../lib/localData'
import { seedTracking, seeded, withSeed } from '../stories/fixtures'
import { TimeTab } from './TimeTab'

// The task panel's anatomy (OpenSpec change ux-overhaul, web-app "Task panel
// layout"): sticky header, quiet notes, breadcrumb, property chips with Add, the
// subtasks checklist and the tabs. Static fixtures keep the stories independent of
// local data and of today's date; the workbench captures each in light and dark at
// 375 and 1280.
const meta: Meta = { title: 'Task/Panel' }
export default meta

const noop = () => {}
const label = (id: string, name: string, color: string) => ({ id, name, color, position: 0, created_at: 0, deleted_at: null, _clock: {} })

function Header({ title, done = false, readOnly = false, priority = 4 }: { title: string; done?: boolean; readOnly?: boolean; priority?: 1 | 2 | 3 | 4 }) {
  const ring = { 1: 'border-p1 bg-p1-soft', 2: 'border-p2 bg-p2-soft', 3: 'border-p3 bg-p3-soft', 4: 'border-p4' }[priority]
  return (
    <div data-panel-header className="flex items-center gap-2 border-b border-default px-3 py-2">
      <button type="button" aria-label={done ? 'Reopen task' : 'Complete task'} aria-pressed={done} disabled={readOnly} className="touch-target inline-flex shrink-0 items-center justify-center rounded-full">
        <span className={`flex h-5 w-5 items-center justify-center rounded-full border-2 ${done ? 'bg-faint border-input text-on-accent' : ring}`}>{done && <Icon name="check" size="xs" />}</span>
      </button>
      <input className={`min-w-0 flex-1 bg-transparent text-h3 font-semibold text-strong focus:outline-none ${done ? 'text-faint line-through' : ''}`} defaultValue={title} readOnly={readOnly} aria-label="Title" />
      <IconButton icon="ellipsis" label="Task actions" />
      <IconButton icon="x" label="Close" />
    </div>
  )
}

function Notes({ text, editing = false }: { text?: string; editing?: boolean }) {
  return (
    <div className="notes-host" data-notes-editing={editing || undefined}>
      <div className={`notes-editor ${text ? '' : 'is-empty'}`} data-placeholder="Add notes…" role="textbox" aria-label="Notes" aria-multiline="true" contentEditable={false}>
        {text && <p>{text}</p>}
      </div>
    </div>
  )
}

function AddControl() {
  return (
    <button type="button" aria-label="Add a property" aria-haspopup="menu" className="inline-flex min-h-8 items-center rounded-control border border-dashed border-input px-2.5 py-1 text-muted">
      <span className="inline-flex items-center gap-1 text-meta"><Icon name="plus" size="xs" />Add</span>
    </button>
  )
}

function Panel({ children, readOnly = false }: { children: React.ReactNode; readOnly?: boolean }) {
  return (
    <aside className="flex w-full max-w-md flex-col rounded-card border border-default bg-surface" style={{ minHeight: 520 }}>
      {children}
      {readOnly && <p role="note" className="border-b border-default bg-sunken px-4 py-2 text-meta text-muted">Read-only: you are a viewer of this shared project. You can still comment.</p>}
    </aside>
  )
}

function TabsArea({ count = 0 }: { count?: number }) {
  return (
    <section className="mt-auto border-t border-default px-4 pb-4 pt-1" aria-label="Comments, activity, history and time">
      <Tabs label="Task conversation" value="comments" onChange={noop} tabs={[{ id: 'comments', label: 'Comments', count }, { id: 'activity', label: 'Activity' }, { id: 'history', label: 'History' }]}>
        <p className="text-meta text-faint">No comments yet. Ask a question or leave a note; comments work offline.</p>
      </Tabs>
    </section>
  )
}

/** A task with nothing but a title: the breadcrumb, Do on, Priority and Add. */
export const EmptyTask: StoryObj = {
  render: () => (
    <Panel>
      <Header title="Call the bank" />
      <div className="min-w-0 space-y-4 p-4">
        <Notes />
        <section aria-label="Properties" className="space-y-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <PropertyChip id="project" icon="folder" label="Project" value={<span className="flex items-center gap-1.5"><Icon name="inbox" size="xs" className="text-faint" />Inbox</span>} editor={() => null} />
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <PropertyChip id="due" icon="calendar-days" label="Do on" empty placeholder="Do on" editor={() => null} />
            <PropertyChip id="priority" icon="flag" label="Priority" tone="text-muted" value="P4" editor={() => null} />
            <AddControl />
          </div>
        </section>
        <section aria-label="Subtasks" className="flex items-center gap-2 px-1 text-faint">
          <Icon name="plus" size="xs" /><span className="text-body">Add subtask…</span>
        </section>
        <button type="button" aria-label="Attach" className="ui-btn ui-btn--ghost ui-btn--sm -mx-2 text-muted"><Icon name="paperclip" size="sm" />Attach</button>
      </div>
      <TabsArea />
    </Panel>
  ),
}

/** Every property set, the priority editor open, subtasks and a comment count. */
export const FullTask: StoryObj = {
  render: () => (
    <Panel>
      <Header title="Prepare the quarterly report" priority={2} />
      <div className="min-w-0 space-y-4 p-4">
        <Notes text="Numbers from finance land on Monday; the deck needs the three charts and a one-page summary." />
        <section aria-label="Properties" className="space-y-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <PropertyChip id="project" icon="folder" label="Project" value={<span className="flex items-center gap-1.5"><span aria-hidden="true" className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: 'var(--ot-hue-blue-solid)' }} />Acme</span>} editor={() => null} />
            <span aria-hidden="true" className="text-faint"><Icon name="chevron-right" size="xs" /></span>
            <PropertyChip id="section" icon="kanban" label="Section" value="Doing" editor={() => null} />
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <PropertyChip id="due" icon="calendar-days" label="Do on" tone="text-default" value={<span>Thu 15 Oct · 09:00</span>} editor={() => null} />
            <PropertyChip id="priority" icon="flag" label="Priority" tone={PRIORITIES[1].cls.split(' ')[0]} value="P2" editing onEditingChange={noop}
              editor={() => (
                <div className="flex gap-1.5" role="group" aria-label="Priority">
                  {PRIORITIES.map(({ p, label: l, cls }) => (
                    <button key={p} type="button" aria-pressed={p === 2} className={`min-w-11 rounded-control border px-2.5 py-1 text-meta ${cls} ${p === 2 ? 'bg-sunken font-semibold dark:bg-raised' : 'border-dashed'}`}>{l}</button>
                  ))}
                </div>
              )} />
            <PropertyChip id="deadline" icon="hourglass" label="Deadline" value={<span>Fri 24 Oct<span className="ml-1 text-faint">in 9 days</span></span>} editor={() => null} onClear={noop} />
            <PropertyChip id="estimate" icon="clock" label="Estimate" value="2h" editor={() => null} onClear={noop} />
            <PropertyChip id="repeat" icon="repeat" label="Repeat" value="every 3 months" editor={() => null} />
            <PropertyChip id="labels" icon="tag" label="Labels" value={<span className="flex flex-wrap gap-1"><LabelChip label={label('l1', 'finance', 'var(--ot-hue-green-solid)')} /><LabelChip label={label('l2', 'deck', 'var(--ot-hue-violet-solid)')} /></span>} editor={() => null} />
            <PropertyChip id="assignee" icon="user-check" label="Assignee" value="Ana" editor={() => null} />
            <PropertyChip id="blocked-by" icon="lock" label="Blocked by" value="Collect the numbers" editor={() => null} />
            <AddControl />
          </div>
        </section>
        <section aria-label="Subtasks">
          <h3 className="mb-1 flex items-center gap-2 text-meta font-semibold text-muted"><Icon name="list" className="text-faint" />Subtasks<span className="font-normal text-faint">1/3</span></h3>
          <ul className="space-y-0.5" aria-label="Subtasks">
            {[['Collect the numbers', true], ['Draw the charts', false], ['Write the summary', false]].map(([t, done]) => (
              <li key={String(t)} className="flex items-center gap-2 rounded-control px-1 py-1">
                <span aria-hidden="true" className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ${done ? 'border-input bg-faint text-on-accent' : 'border-input'}`}>{done && <Icon name="check" size={10} />}</span>
                <span className={`min-w-0 flex-1 truncate text-body ${done ? 'text-faint line-through' : 'text-default'}`}>{t}</span>
              </li>
            ))}
          </ul>
          <div className="flex items-center gap-2 px-1 text-faint"><Icon name="plus" size="xs" /><span className="text-body">Add subtask…</span></div>
        </section>
        <section aria-label="Attachments">
          <h3 className="mb-1 flex items-center gap-2 text-meta font-semibold text-muted"><Icon name="paperclip" className="text-faint" />Attachments<span className="font-normal text-faint">1</span></h3>
          <p className="flex items-center gap-2 text-body"><Badge hue="slate">PDF</Badge>Q2 numbers.pdf<span className="text-meta text-faint">212 KB</span></p>
        </section>
      </div>
      <TabsArea count={4} />
    </Panel>
  ),
}

/** A viewer of a shared project: values read as text, nothing to edit. */
export const Viewer: StoryObj = {
  render: () => (
    <Panel readOnly>
      <Header title="Book the venue" readOnly priority={3} />
      <div className="min-w-0 space-y-4 p-4">
        <Notes text="Ask for the Thursday slot; the Friday one is already taken." />
        <section aria-label="Properties" className="space-y-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <PropertyChip id="project" icon="folder" label="Project" readOnly value="Team offsite" />
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <PropertyChip id="due" icon="calendar-days" label="Do on" readOnly tone="text-default" value="Tue 21 Oct" />
            <PropertyChip id="priority" icon="flag" label="Priority" readOnly tone={PRIORITIES[2].cls.split(' ')[0]} value="P3" />
            <PropertyChip id="assignee" icon="user-check" label="Assignee" readOnly value="Jo" />
          </div>
        </section>
      </div>
      <TabsArea count={2} />
    </Panel>
  ),
}

/** The notes while focused: the quiet line grows into a bordered editor. */
export const NotesEditing: StoryObj = {
  render: () => (
    <Panel>
      <Header title="Call the bank" />
      <div className="min-w-0 space-y-4 p-4">
        <Notes editing />
        <section aria-label="Properties" className="flex flex-wrap items-center gap-1.5">
          <PropertyChip id="due" icon="calendar-days" label="Do on" empty placeholder="Do on" editor={() => null} />
          <PropertyChip id="priority" icon="flag" label="Priority" tone="text-muted" value="P4" editor={() => null} />
          <AddControl />
        </section>
      </div>
    </Panel>
  ),
}

/** Origins in the panel (task-origin): an issue and a page open their source on click or Enter, a mail has no link; each can be removed. */
export const WithOrigins: StoryObj = {
  render: () => (
    <Panel>
      <Header title="Fix the login timeout" priority={2} />
      <div className="min-w-0 space-y-4 p-4">
        <section aria-label="Properties" className="space-y-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <PropertyChip id="due" icon="calendar-days" label="Do on" empty placeholder="Do on" editor={() => null} />
            <PropertyChip id="priority" icon="flag" label="Priority" tone={PRIORITIES[1].cls} value="P2" editor={() => null} />
            <PropertyChip id="origin" icon="link" label="Origin" value="o/r#7" tip="Login times out after 30 seconds" onActivate={noop} onClear={noop} />
            <PropertyChip id="origin-page" icon="link" label="Origin" value="example.org" tip="Interesting article" onActivate={noop} onClear={noop} />
            <PropertyChip id="origin-mail" icon="at-sign" label="Origin" value="Email" onClear={noop} />
            <AddControl />
          </div>
        </section>
      </div>
      <TabsArea />
    </Panel>
  ),
}

/** The Time tab (time-tracking D5) of a task with two past entries, from the local data a seed writes. */
function SeededTimeTab() {
  const task = useTask(seeded.inboxTask)
  return task ? <Panel><div className="px-4 pb-4">{<TimeTab task={task} readOnly={false} />}</div></Panel> : null
}

export const Time: StoryObj = {
  ...withSeed(seedTracking),
  render: () => <SeededTimeTab />,
}
