// Editing a task in the list (OpenSpec change inline-task-editing, task-list-presentation
// "Inline title editing" and "Contextual edit bar"): the row's title becomes a field
// with the caret where the click was, and a bar under it offers Date, Priority, Labels
// and Project, the panel's own editors, and Open details. Enter or a click away saves,
// Esc discards the title change, Shift+Enter saves and opens the panel. The title is
// the panel's TitleField, so `tomorrow p1 #work` typed here applies as it does there.
// On touch the compact editor has Save and Cancel, Return reads Done, and a tap outside
// saves (touch-title-editing).
import { type FocusEvent, type KeyboardEvent, Suspense, useMemo, useRef, useState } from 'react'
import { lazy } from '../../lib/lazy'
import { describeDue, localDueOf, logicalToday } from '../../lib/dates'
import { sectorLabel } from '../../lib/sectorNames'
import { removeLabel, resolveLabels } from '../../lib/labels'
import type { EditPlan } from '../../lib/nlp/edit'
import { pickMoves } from '../../lib/inbox'
import { priorityShort } from '../../lib/priority'
import { priorityUndoable } from '../../lib/undoActions'
import type { Label, Priority, Project, Task } from '../../lib/types'
import { Button, Icon, IconButton, type IconName, Menu, MenuItem } from '../../ui'
import { act } from '../actionError'
import { LabelChip, LabelPicker } from '../LabelPicker'
import { ProjectPickerField } from '../ProjectPickerField'
import { FacetEditor } from '../task-detail/FacetEditor'
import { TitleField } from '../TitleField'
import { commitTitleEdit } from '../titleEdit'
import { moveWithUndo } from '../undoable'
import { useViewerZone } from '../useViews'
import { useTapOutside } from './tapOutside'
import { t } from '../../lib/i18n'
import { composing } from '../../lib/composeKey'

// Date opens the row's Schedule popover, loaded on first use like the row's own, so the
// When editor stays out of the list's first load (when-picker).
const RowSchedule = lazy(() => import('./RowSchedule'))

export interface InlineEditorProps {
  task: Task
  /** Where the caret starts in the title (the click's place). */
  caret?: number
  compact?: boolean
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

export function InlineEditor({ task, caret, compact = false, projects, labelMap, onDone, onFollow }: InlineEditorProps) {
  const root = useRef<HTMLDivElement>(null)
  const [draft, setDraft] = useState(task.title)
  const details = useRef(false)
  const cancelled = useRef(false)
  const finished = useRef(false)
  const labels = useMemo(() => [...labelMap.values()], [labelMap])
  const projectName = (id: string) => projects.find((p) => p.id === id)?.name ?? t('the project')

  const commit = (plan: EditPlan) => {
    if (cancelled.current) return
    act(commitTitleEdit(task, plan, labels, projectName).then((id) => { if (id !== task.id) onFollow?.(id) }))
  }
  const finish = () => {
    if (finished.current) return
    finished.current = true
    onDone(details.current)
  }
  const cancel = () => {
    cancelled.current = true
    finish()
  }
  // A press outside leaves the field, which saves (TitleField commits on blur).
  useTapOutside(compact, (node) => insideEditor(root.current, node), () => {
    const field = root.current?.querySelector<HTMLElement>('[data-inline-title]')
    if (field && document.activeElement === field) field.blur()
    else finish()
  })

  const onKeyDownFirst = (e: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (composing(e)) return false
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
    <div ref={root} className="min-w-0 flex-1" onBlur={onBlur} data-inline-editor={task.id} data-inline-compact={compact || undefined}
      aria-description={compact ? undefined : t('Editing. Enter saves, Escape cancels, Shift+Enter opens the details.')}>
      <TitleField title={task.title} value={draft} onChange={setDraft} onCommit={commit}
        onCancel={cancel}
        projects={projects} labels={labels} autoFocus initialCaret={caret} onKeyDownFirst={onKeyDownFirst}
        enterKeyHint={compact ? 'done' : undefined}
        className={`ui-input w-full py-1 text-body ${compact ? 'min-h-11' : ''}`} ariaLabel={t('Title')} placeholder={t('Untitled')} dataAttrs={{ 'data-inline-title': true }}
        actions={compact ? (save) => (
          <div className="mt-1 flex flex-wrap gap-1">
            <Button type="button" size="sm" className="min-h-11" onPointerDown={(e) => e.preventDefault()} onClick={() => { save(); finish() }}>{t('Save')}</Button>
            <Button type="button" size="sm" variant="ghost" className="min-h-11" onPointerDown={(e) => e.preventDefault()} onClick={cancel}>{t('Cancel')}</Button>
          </div>
        ) : undefined} />
      {!compact && <EditBar task={task} projects={projects} labelMap={labelMap} onDetails={() => { details.current = true; finish() }} />}
    </div>
  )
}


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
  // An undated task's time sector reads in the date's place; picking a date replaces it (time-sectors D2, D4).
  const sector = due ? null : sectorLabel(task.sector, logicalToday())
  const labels = resolveLabels(task.labels, labelMap)
  return (
    <div className="mt-1 flex min-h-8 flex-wrap items-center gap-0.5" data-edit-bar role="group" aria-label={t('Task properties')}>
      <BarButton icon="calendar-days" label={t('Date')} text={due?.label ?? sector?.text ?? t('Date')} empty={!due && !sector} expanded={open === 'date'}
        buttonRef={(el) => { anchors.current.date = el }} onClick={() => setOpen(open === 'date' ? null : 'date')} />
      <Menu kind="menu" label={`${t('Priority')}: ${priorityShort(task.priority)}`} align="start"
        trigger={<span className={`inline-flex items-center gap-1 text-meta ${task.priority === 4 ? 'text-faint' : 'text-muted'}`}><Icon name="flag" size="xs" />{priorityShort(task.priority)}</span>}
        triggerClassName="inline-flex min-h-7 items-center rounded-control px-1.5 hover:bg-sunken dark:hover:bg-raised">
        {([1, 2, 3, 4] as Priority[]).map((p) => (
          <MenuItem key={p} label={priorityShort(p)} checked={task.priority === p} onSelect={() => act(priorityUndoable(task.id, p))} />
        ))}
      </Menu>
      <BarButton icon="tag" label={t('Labels')} text={labels.length ? labels.map((l) => l.name).join(', ') : t('Labels')} empty={!labels.length} expanded={open === 'labels'}
        buttonRef={(el) => { anchors.current.labels = el }} onClick={() => setOpen(open === 'labels' ? null : 'labels')} />
      <span className="inline-flex" data-edit-project>
        <ProjectPickerField label={t('Project')} projects={projects} value={task.project_id ?? null} rankContext="task.project" repickNone={pickMoves(task, null)}
          className="min-h-7 border-transparent bg-transparent px-1.5 py-0 text-meta text-muted shadow-none hover:bg-sunken dark:hover:bg-raised"
          onChange={(id) => { if (pickMoves(task, id)) act(moveWithUndo(task.id, id, id ? projects.find((p) => p.id === id)?.name ?? t('the project') : t('Inbox'))) }} />
      </span>
      <IconButton icon="chevron-right" size="sm" label={t('Open details')} shortcut="Shift+Enter" onClick={onDetails} className="ms-auto" data-open-details />
      {open === 'date' && (
        <Suspense fallback={null}>
          <RowSchedule task={task} anchor={dateAnchor} onClose={() => setOpen(null)} />
        </Suspense>
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
