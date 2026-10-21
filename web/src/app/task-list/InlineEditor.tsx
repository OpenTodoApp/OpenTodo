// Editing a task in the list (OpenSpec change inline-task-editing, task-list-presentation
// "Inline title editing" and "Contextual edit bar"): the row's title becomes a field
// with the caret where the click was, and a bar under it offers Date, Priority, Labels
// and Project, the panel's own editors, and Open details. Enter or a click away saves,
// Esc discards the title change, Shift+Enter saves and opens the panel. The title is
// the panel's TitleField, so `tomorrow p1 #work` typed here applies as it does there.
import { type FocusEvent, type KeyboardEvent, useMemo, useRef, useState } from 'react'
import { describeDue, localDueOf } from '../../lib/dates'
import { removeLabel, resolveLabels } from '../../lib/labels'
import type { EditPlan } from '../../lib/nlp/edit'
import { updateTask } from '../../lib/ops'
import type { Label, Priority, Project, Task } from '../../lib/types'
import { Icon, IconButton, type IconName, Menu, MenuItem } from '../../ui'
import { act } from '../actionError'
import { LabelChip, LabelPicker } from '../LabelPicker'
import { ProjectPickerField } from '../ProjectPickerField'
import { FacetEditor } from '../task-detail/FacetEditor'
import { WhenControl } from '../task-detail/WhenControl'
import { TitleField } from '../TitleField'
import { commitTitleEdit } from '../titleEdit'
import { moveWithUndo } from '../undoable'
import { useViewerZone } from '../useViews'
import { t } from '../../lib/i18n'

export interface InlineEditorProps {
  task: Task
  /** Where the caret starts in the title (the click's place). */
  caret?: number
  projects: Project[]
  labelMap: Map<string, Label>
  /** The editor is done; `details` asks for the panel. */
  onDone: (details?: boolean) => void
  /** The task moved to a copy (a move across sharing scopes). */
  onFollow?: (id: string) => void
}

/** Is `node` inside this editor or an overlay it opened (a picker, a menu)? */
const insideEditor = (root: HTMLElement | null, node: Node | null) =>
  !!node && (!!root?.contains(node) || !!(node instanceof Element && node.closest('[data-overlay], [data-overlay-root]')))

export function InlineEditor({ task, caret, projects, labelMap, onDone, onFollow }: InlineEditorProps) {
  const root = useRef<HTMLDivElement>(null)
  const [draft, setDraft] = useState(task.title)
  const details = useRef(false)
  const cancelled = useRef(false)
  const labels = useMemo(() => [...labelMap.values()], [labelMap])
  const projectName = (id: string) => projects.find((p) => p.id === id)?.name ?? t('the project')

  const commit = (plan: EditPlan) => {
    if (cancelled.current) return
    act(commitTitleEdit(task, plan, labels, projectName).then((id) => { if (id !== task.id) onFollow?.(id) }))
  }
  const finish = () => onDone(details.current)

  const onKeyDownFirst = (e: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && e.shiftKey) {
      e.preventDefault()
      details.current = true
      ;(e.target as HTMLElement).blur()
      finish()
      return true
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      ;(e.target as HTMLElement).blur()
      finish()
      return true
    }
    return false
  }

  // Leaving the editor (not into its own bar or a picker it opened) ends it; the title was saved on blur.
  const onBlur = (e: FocusEvent<HTMLDivElement>) => {
    if (insideEditor(root.current, e.relatedTarget as Node | null)) return
    requestAnimationFrame(() => { if (!insideEditor(root.current, document.activeElement)) finish() })
  }

  return (
    <div ref={root} className="min-w-0 flex-1" onBlur={onBlur} data-inline-editor={task.id}
      aria-description={t('Editing. Enter saves, Escape cancels, Shift+Enter opens the details.')}>
      <TitleField title={task.title} value={draft} onChange={setDraft} onCommit={commit}
        onCancel={() => { cancelled.current = true; setDraft(task.title); onDone(false) }}
        projects={projects} labels={labels} autoFocus initialCaret={caret} onKeyDownFirst={onKeyDownFirst}
        className="ui-input w-full py-1 text-body" ariaLabel={t('Title')} placeholder={t('Untitled')} dataAttrs={{ 'data-inline-title': true }} />
      <EditBar task={task} projects={projects} labelMap={labelMap} onDetails={() => { details.current = true; finish() }} />
    </div>
  )
}

const PRIORITY_TEXT: Record<Priority, string> = { 1: 'P1', 2: 'P2', 3: 'P3', 4: 'P4' }

/** One compact control of the bar: an icon and the value, or a quiet placeholder. */
function BarButton({ icon, text, empty, onClick, label, buttonRef, expanded }: {
  icon: IconName; text: string; empty?: boolean; onClick: () => void; label: string; buttonRef?: (el: HTMLButtonElement | null) => void; expanded?: boolean
}) {
  return (
    <button ref={buttonRef} type="button" aria-label={`${label}: ${text}`} aria-haspopup="dialog" aria-expanded={expanded}
      className={`inline-flex min-h-7 max-w-40 items-center gap-1 rounded-control px-1.5 text-meta hover:bg-sunken dark:hover:bg-raised ${empty ? 'text-faint' : 'text-muted'}`}
      onClick={onClick}>
      <Icon name={icon} size="xs" /><span className="truncate">{text}</span>
    </button>
  )
}

/** The contextual bar (inline-task-editing D3): Date, Priority, Labels, Project, Open details. */
export function EditBar({ task, projects, labelMap, onDetails }: { task: Task; projects: Project[]; labelMap: Map<string, Label>; onDetails: () => void }) {
  const zone = useViewerZone()
  const [open, setOpen] = useState<'date' | 'labels' | null>(null)
  const anchors = useRef<Record<string, HTMLButtonElement | null>>({})
  const dateAnchor = useMemo(() => ({ get current() { return anchors.current.date ?? null } }), [])
  const labelsAnchor = useMemo(() => ({ get current() { return anchors.current.labels ?? null } }), [])
  const due = describeDue(localDueOf(task.due, zone))
  const labels = resolveLabels(task.labels, labelMap)
  return (
    <div className="mt-1 flex min-h-8 flex-wrap items-center gap-0.5" data-edit-bar role="group" aria-label={t('Task properties')}>
      <BarButton icon="calendar-days" label={t('Date')} text={due?.label ?? t('Date')} empty={!due} expanded={open === 'date'}
        buttonRef={(el) => { anchors.current.date = el }} onClick={() => setOpen(open === 'date' ? null : 'date')} />
      <Menu kind="menu" label={`${t('Priority')}: ${PRIORITY_TEXT[task.priority]}`} align="start"
        trigger={<span className={`inline-flex items-center gap-1 text-meta ${task.priority === 4 ? 'text-faint' : 'text-muted'}`}><Icon name="flag" size="xs" />{PRIORITY_TEXT[task.priority]}</span>}
        triggerClassName="inline-flex min-h-7 items-center rounded-control px-1.5 hover:bg-sunken dark:hover:bg-raised">
        {([1, 2, 3, 4] as Priority[]).map((p) => (
          <MenuItem key={p} label={PRIORITY_TEXT[p]} checked={task.priority === p} onSelect={() => act(updateTask(task.id, { priority: p }))} />
        ))}
      </Menu>
      <BarButton icon="tag" label={t('Labels')} text={labels.length ? labels.map((l) => l.name).join(', ') : t('Labels')} empty={!labels.length} expanded={open === 'labels'}
        buttonRef={(el) => { anchors.current.labels = el }} onClick={() => setOpen(open === 'labels' ? null : 'labels')} />
      <span className="inline-flex" data-edit-project>
        <ProjectPickerField label={t('Project')} projects={projects} value={task.project_id ?? null} rankContext="task.project"
          className="min-h-7 border-transparent bg-transparent px-1.5 py-0 text-meta text-muted shadow-none hover:bg-sunken dark:hover:bg-raised"
          onChange={(id) => { if (id !== (task.project_id ?? null)) act(moveWithUndo(task.id, id, id ? projects.find((p) => p.id === id)?.name ?? t('the project') : t('Inbox'))) }} />
      </span>
      <IconButton icon="chevron-right" size="sm" label={t('Open details')} shortcut="Shift+Enter" onClick={onDetails} className="ml-auto" data-open-details />
      {open === 'date' && (
        <FacetEditor anchor={dateAnchor} icon="calendar-days" title={t('Do on')} onClose={() => setOpen(null)} width="sm:w-[28rem]">
          <WhenControl task={task} segment="due" />
        </FacetEditor>
      )}
      {open === 'labels' && (
        <FacetEditor anchor={labelsAnchor} icon="tag" title={t('Labels')} onClose={() => setOpen(null)}>
          <div className="space-y-2">
            {labels.length > 0 && <div className="flex flex-wrap gap-1">{labels.map((l) => <LabelChip key={l.id} label={l} onRemove={() => act(removeLabel(task.id, l.id))} />)}</div>}
            <LabelPicker taskId={task.id} onClose={() => setOpen(null)} />
          </div>
        </FacetEditor>
      )}
    </div>
  )
}
