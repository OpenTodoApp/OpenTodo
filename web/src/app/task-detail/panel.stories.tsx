import type { Meta, StoryObj } from '@storybook/react-vite'
import { useEffect } from 'react'
import { Badge, Icon, IconButton, Tabs } from '../../ui'
import type { FacetPart } from '../../lib/facets'
import { useLabels, useProjects, useTask } from '../../lib/localData'
import { seedInbox, seedTracking, seeded, withSeed } from '../stories/fixtures'
import { Facets } from './Facets'
import { FacetLine } from './FacetLine'
import { TimeTab } from './TimeTab'

// The task panel's anatomy (OpenSpec change task-panel-facets, web-app "Task panel
// layout"): sticky header, quiet notes, the four facet lines with Add, the subtasks
// checklist and the tabs. Static fixtures keep the stories independent of
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
    <div className="pl-7">
      <button type="button" aria-label="Add a property" aria-haspopup="menu" className="inline-flex min-h-7 items-center rounded-control px-1 text-muted">
        <span className="inline-flex items-center gap-1 text-meta"><Icon name="plus" size="xs" />Add</span>
      </button>
    </div>
  )
}

/** The facet lines of a fixture: Where, When, How and, when given, Who. */
function Lines({ where, when, how, who = [], readOnly = false }: { where: FacetPart[]; when: FacetPart[]; how: FacetPart[]; who?: FacetPart[]; readOnly?: boolean }) {
  return (
    <section aria-label="Properties" className="space-y-0.5" data-facets>
      <FacetLine facet="where" icon="folder" name="Where" parts={where} readOnly={readOnly} />
      <FacetLine facet="when" icon="calendar-days" name="When" parts={when} readOnly={readOnly} />
      <FacetLine facet="how" icon="flag" name="How" parts={how} readOnly={readOnly} />
      {who.length > 0 && <FacetLine facet="who" icon="users" name="Who" parts={who} readOnly={readOnly} />}
      {!readOnly && <AddControl />}
    </section>
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

/** A task with nothing but a title: Where (Inbox), When "Not scheduled", How "P4" and Add. */
export const EmptyTask: StoryObj = {
  render: () => (
    <Panel>
      <Header title="Call the bank" />
      <div className="min-w-0 space-y-4 p-4">
        <Notes />
        <Lines where={[{ id: 'project', text: 'Inbox' }]} when={[{ id: 'due', text: 'Not scheduled', empty: true }]} how={[{ id: 'priority', text: 'P4' }]} />
        <section aria-label="Subtasks" className="flex items-center gap-2 px-1 text-faint">
          <Icon name="plus" size="xs" /><span className="text-body">Add subtask…</span>
        </section>
      </div>
      <TabsArea />
    </Panel>
  ),
}

/** Every property set: four lines in the row's words, subtasks and an attachment. */
export const FullTask: StoryObj = {
  render: () => (
    <Panel>
      <Header title="Prepare the quarterly report" priority={2} />
      <div className="min-w-0 space-y-4 p-4">
        <Notes text="Numbers from finance land on Monday; the deck needs the three charts and a one-page summary." />
        <Lines
          where={[{ id: 'project', text: 'Acme' }, { id: 'section', text: 'Doing', sep: 'chevron' }]}
          when={[{ id: 'due', text: 'Tomorrow 09:00', tone: 'soon' }, { id: 'repeat', text: 'every 3 months' }, { id: 'deadline', text: 'deadline Sat, Oct 24, 9 days' }, { id: 'when', text: 'since Wed, Oct 14' }, { id: 'reminders', text: '2 reminders' }]}
          how={[{ id: 'priority', text: 'P2' }, { id: 'estimate', text: '2h' }, { id: 'labels', text: 'finance, deck', labels: [label('l1', 'finance', 'var(--ot-hue-green-solid)'), label('l2', 'deck', 'var(--ot-hue-violet-solid)')] }]}
          who={[{ id: 'assignee', text: 'Ana' }, { id: 'blocked-by', text: 'waits for Collect the numbers' }]} />
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

/** A viewer of a shared project: the lines read as text, nothing to edit, no Add. */
export const Viewer: StoryObj = {
  render: () => (
    <Panel readOnly>
      <Header title="Book the venue" readOnly priority={3} />
      <div className="min-w-0 space-y-4 p-4">
        <Notes text="Ask for the Thursday slot; the Friday one is already taken." />
        <Lines readOnly where={[{ id: 'project', text: 'Team offsite' }]} when={[{ id: 'due', text: 'Tue, Oct 21', tone: 'later' }]} how={[{ id: 'priority', text: 'P3' }]} who={[{ id: 'assignee', text: 'Jo' }]} />
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
        <Lines where={[{ id: 'project', text: 'Inbox' }]} when={[{ id: 'due', text: 'Not scheduled', empty: true }]} how={[{ id: 'priority', text: 'P4' }]} />
      </div>
    </Panel>
  ),
}

/** Origins in the panel (task-origin): the source is a part of the Where line, opened on click. */
export const WithOrigins: StoryObj = {
  render: () => (
    <Panel>
      <Header title="Fix the login timeout" priority={2} />
      <div className="min-w-0 space-y-4 p-4">
        <Lines where={[{ id: 'project', text: 'Web app' }, { id: 'origin', text: 'o/r#7' }]} when={[{ id: 'due', text: 'Not scheduled', empty: true }]} how={[{ id: 'priority', text: 'P2' }]} />
      </div>
      <TabsArea />
    </Panel>
  ),
}

/** The When popover, opened from the Do on part of a seeded task: one segment at a time, Clear and Done. */
function SeededWhen() {
  const task = useTask(seeded.inboxTask)
  const projects = useProjects()
  const labels = useLabels()
  useEffect(() => {
    if (!task) return
    const id = requestAnimationFrame(() => document.querySelector<HTMLButtonElement>('[data-facet="when"] [data-part="due"]')?.click())
    return () => cancelAnimationFrame(id)
  }, [task?.id]) // eslint-disable-line react-hooks/exhaustive-deps -- open once the task is there
  if (!task) return null
  return (
    <Panel>
      <div className="p-4">
        <Facets task={task} readOnly={false} projects={projects} labelMap={new Map(labels.map((l) => [l.id, l]))} childCount={0} />
      </div>
    </Panel>
  )
}

export const WhenPopover: StoryObj = {
  ...withSeed(seedInbox),
  render: () => <SeededWhen />,
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
