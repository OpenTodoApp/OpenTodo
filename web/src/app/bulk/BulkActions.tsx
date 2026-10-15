// The selection's Actions menu and bar (OpenSpec change bulk-edit, design D3): one
// menu for the ticked tasks (or the cursor task when nothing is ticked), built on
// the shared ActionMenu so its items, pickers, shortcuts and disabled reasons work
// like every other object menu. Moves and assignments go through the review (D6).
import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { allCompleted, applyBulk, commonSharedProject, readTicked, reviewAssign, reviewMove, type BulkAction, type ReviewPlan } from '../../lib/bulk'
import { db } from '../../lib/db'
import { projectSource, sectionSource, type PickerItem } from '../../lib/pickerSources'
import { membershipMap } from '../../lib/sharing'
import type { Label, Membership, Priority, Project, Section, Task } from '../../lib/types'
import { Icon } from '../../ui'
import { DateField } from '../datetime/DateField'
import { ActionMenu, type ActionGroup } from '../menus/ActionMenu'
import { Dialog } from '../overlay/Dialog'
import { BulkReview } from './BulkReview'
import { showBulkToast } from './toastStore'

/** Apply a bulk action and offer its undo. */
export async function runBulk(ids: readonly string[], action: BulkAction): Promise<void> {
  if (ids.length === 0) return
  const r = await applyBulk(ids, action)
  showBulkToast(r.label, r.undoId)
}

const tasksWord = (n: number) => `${n} ${n === 1 ? 'task' : 'tasks'}`
const itemKey = (i: PickerItem) => i.key
const itemLabel = (i: PickerItem) => i.label
const itemPath = (i: PickerItem) => i.path

interface Data { tasks: Task[]; labels: Label[]; projects: Project[]; sections: Section[]; memberships: Map<string, Membership> }

/** The menu's groups for the given tasks (exported for the palette and tests). */
export function bulkMenuGroups(ids: readonly string[], d: Data, a: { review: (title: string, plan: Promise<ReviewPlan>) => void; pickDate: () => void }): ActionGroup[] {
  const n = d.tasks.length
  const reopen = allCompleted(d.tasks)
  const live = d.labels.filter((l) => !l.deleted_at)
  const common = live.filter((l) => d.tasks.length > 0 && d.tasks.every((t) => t.labels.includes(l.id))).map((l) => l.id)
  const projectId = d.tasks[0]?.project_id ?? null
  const oneProject = n > 0 && d.tasks.every((t) => (t.project_id ?? null) === projectId)
  const shared = commonSharedProject(d.tasks, d.memberships)
  const members = shared ? d.memberships.get(shared)?.members ?? [] : []
  const run = (action: BulkAction) => () => runBulk(ids, action)
  return [
    { items: [
      { kind: 'action', id: 'complete', label: reopen ? 'Reopen' : 'Complete', icon: 'check', shortcut: 'c', onSelect: run({ kind: 'complete' }) },
    ] },
    { label: 'Priority', items: ([1, 2, 3, 4] as Priority[]).map((p) => ({ kind: 'action' as const, id: `p${p}`, label: `Priority ${p}`, icon: 'flag' as const, shortcut: String(p), onSelect: run({ kind: 'priority', priority: p }) })) },
    { items: [
      { kind: 'picker', id: 'labels', label: 'Labels', icon: 'tag', shortcut: 'L', disabled: live.length === 0, reason: 'There are no labels yet', picker: {
        title: 'Labels', placeholder: 'Add to all, or remove from all…', source: live, multiple: true, selected: common, rankContext: 'label',
        getKey: (l: Label) => l.id, getLabel: (l: Label) => l.name,
        onPick: (l: Label) => { void runBulk(ids, { kind: 'label', labelId: l.id, add: !common.includes(l.id) }) },
      } },
    ] },
    { label: 'Date', items: [
      { kind: 'action', id: 'today', label: 'Today', icon: 'calendar-check', onSelect: run({ kind: 'due', pick: 'today' }) },
      { kind: 'action', id: 'tomorrow', label: 'Tomorrow', icon: 'calendar-days', onSelect: run({ kind: 'due', pick: 'tomorrow' }) },
      { kind: 'action', id: 'next-week', label: 'Next week', icon: 'calendar-range', onSelect: run({ kind: 'due', pick: 'next-week' }) },
      { kind: 'action', id: 'no-date', label: 'No date', icon: 'x', onSelect: run({ kind: 'due', pick: null }) },
      { kind: 'action', id: 'pick-date', label: 'Pick a date…', icon: 'calendar-days', onSelect: a.pickDate },
    ] },
    { items: [
      { kind: 'picker', id: 'move', label: 'Move to project', icon: 'folder-input', picker: {
        title: 'Move to project', placeholder: 'Find a project…', source: projectSource(d.projects, { memberships: d.memberships }),
        getKey: itemKey, getLabel: itemLabel, getPath: itemPath, rankContext: 'project',
        onPick: (i: PickerItem) => { a.review(`Move ${tasksWord(n)} to ${i.value ? i.label : 'the Inbox'}`, reviewMove(ids, { projectId: i.value })) },
      } },
      { kind: 'picker', id: 'section', label: 'Move to section', icon: 'kanban', disabled: !oneProject || !projectId, reason: 'The tasks must be in one project', picker: {
        title: 'Move to section', placeholder: 'Find a section…', source: sectionSource(d.sections, projectId),
        getKey: itemKey, getLabel: itemLabel,
        onPick: (i: PickerItem) => { a.review(`Move ${tasksWord(n)} to ${i.value ? i.label : 'No section'}`, reviewMove(ids, { projectId, sectionId: i.value })) },
      } },
      { kind: 'picker', id: 'assign', label: 'Assign', icon: 'user-check', shortcut: 'Shift+A', disabled: !shared, reason: 'Tasks must be in one shared project', picker: {
        title: 'Assign', placeholder: 'Find a member…', source: [{ userId: '', name: 'Unassigned', email: '' }, ...members] as { userId: string; name: string; email: string }[],
        getKey: (m: { userId: string }) => m.userId || 'none', getLabel: (m: { name: string; email: string }) => m.name || m.email, rankContext: `assignee:${shared ?? ''}`,
        onPick: (m: { userId: string; name: string; email: string }) => { a.review(m.userId ? `Assign ${tasksWord(n)} to ${m.name || m.email}` : `Unassign ${tasksWord(n)}`, reviewAssign(ids, m.userId || null)) },
      } },
    ] },
    { items: [{ kind: 'action', id: 'trash', label: 'Move to Trash', icon: 'trash-2', shortcut: 'Delete', tone: 'danger', onSelect: run({ kind: 'trash' }) }] },
  ]
}

/** Live data the menu needs, read while it is mounted. */
function useBulkData(ids: readonly string[]): Data {
  const key = ids.join(',')
  const tasks = useLiveQuery(() => readTicked(ids).then((r) => r.tasks), [key], [] as Task[])
  const labels = useLiveQuery(() => db.labels.toArray(), [], [] as Label[])
  const projects = useLiveQuery(() => db.projects.filter((p) => !p.deleted_at).toArray(), [], [] as Project[])
  const sections = useLiveQuery(() => db.sections.filter((s) => !s.deleted_at).toArray(), [], [] as Section[])
  const memberships = useLiveQuery(() => membershipMap(), [], new Map<string, Membership>())
  return { tasks, labels, projects, sections, memberships }
}

/**
 * The Actions menu for `ids`. `startPicker` opens it straight into a picker
 * ("labels" for `L`, "assign" for Shift+A on a selection).
 */
export function BulkActionsMenu({ ids, open, onOpenChange, trigger, triggerClassName, startPicker = null, onApplied }: {
  ids: readonly string[]
  open?: boolean
  onOpenChange?: (open: boolean) => void
  trigger?: React.ReactNode
  triggerClassName?: string
  startPicker?: string | null
  onApplied?: () => void
}) {
  const data = useBulkData(ids)
  const [review, setReview] = useState<{ title: string; plan: ReviewPlan } | null>(null)
  const [dating, setDating] = useState(false)
  const groups = useMemo(() => bulkMenuGroups(ids, data, {
    review: (title, plan) => { void plan.then((p) => setReview({ title, plan: p })) },
    pickDate: () => setDating(true),
  }), [ids, data])
  const n = data.tasks.length || ids.length
  return (
    <>
      <ActionMenu label={`Actions for ${tasksWord(n)}`} title={tasksWord(n)} groups={groups} open={open} onOpenChange={onOpenChange}
        trigger={trigger} triggerClassName={triggerClassName} startPicker={startPicker} width="sm:w-72" />
      {review && <BulkReview title={review.title} plan={review.plan} onClose={() => setReview(null)} onApplied={onApplied} />}
      {dating && (
        <Dialog title={`Date for ${tasksWord(n)}`} onClose={() => setDating(false)}>
          <DateField label="Date" autoFocus value={null} onChange={(iso) => { setDating(false); if (iso) void runBulk(ids, { kind: 'due', pick: iso }) }} />
        </Dialog>
      )}
    </>
  )
}

/** "3 selected · Actions · Clear" above a list while tasks are ticked. */
export function SelectionBar({ ids, onClear, menuOpen, onMenuOpenChange, startPicker }: {
  ids: readonly string[]
  onClear: () => void
  menuOpen: boolean
  onMenuOpenChange: (open: boolean) => void
  startPicker?: string | null
}) {
  if (ids.length === 0) return null
  return (
    <div className="mb-2 flex items-center gap-2 rounded-lg border border-accent/40 bg-accent-soft px-3 py-1.5 text-sm" data-selection-bar>
      <span role="status" className="min-w-0 flex-1 font-medium text-on-accent-soft">{ids.length} selected</span>
      <BulkActionsMenu ids={ids} open={menuOpen} onOpenChange={onMenuOpenChange} startPicker={startPicker}
        trigger={<>Actions <span className="kbd ml-1">.</span></>} triggerClassName="btn-ghost px-2 py-1 text-sm" />
      <button type="button" className="btn-ghost px-2 py-1 text-sm" onClick={onClear} title="Clear the selection (Esc)"><Icon name="x" />Clear</button>
    </div>
  )
}
