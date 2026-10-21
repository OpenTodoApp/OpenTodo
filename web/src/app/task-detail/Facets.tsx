// The properties of the task panel as four facet lines (OpenSpec change
// task-panel-facets): Where, When, How and Who, each a short sentence of parts in the
// list row's words. A part opens its editor as a popover anchored to it (a bottom
// sheet on phones) with Clear and Done; the When parts share one popover that shows
// one segment at a time. The Add menu offers what is not set, grouped by facet.
// Every editor writes exactly the operation its chip wrote (usePropertiesModel).
import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react'
import { facetsOf, type FacetId, type FacetPart, type WhenSegmentId } from '../../lib/facets'
import { removeLabel } from '../../lib/labels'
import { createProject, setRecurrence, unparkTask, updateTask } from '../../lib/ops'
import { INBOX_KEY, itemKeywords, NONE_KEY, sectionSource, type PickerItem } from '../../lib/pickerSources'
import { moveTaskToSection } from '../../lib/sections'
import { keysOf } from '../../lib/shortcuts'
import { openOrigin, originOf } from '../../lib/taskOrigin'
import type { Label, Priority, Project, Task } from '../../lib/types'
import { isZoned, zoneCity } from '../../lib/dates'
import { ComboboxPanel, Icon, type IconName, Menu, MenuGroup, MenuItem, MenuSeparator, Switch } from '../../ui'
import { AssigneePicker } from '../AssigneePicker'
import { useDateTimeFormat } from '../DateTimePrefsProvider'
import { EstimateField } from '../EstimateField'
import { LabelChip, LabelPicker } from '../LabelPicker'
import { originText } from '../OriginChip'
import { LocationEditor, useShownLocation } from '../locations/LocationEditor'
import { LocationPreview } from '../locations/LocationPreview'
import { setTaskLocation, locationLabel } from '../../lib/locations'
import { setDueWithUndo } from '../undoable'
import { requestAttach } from './attachRequest'
import { FacetEditor } from './FacetEditor'
import { FacetLine } from './FacetLine'
import { usePropertiesModel, type PropertiesModel } from './usePropertiesModel'
import type { Optional } from './usePropertyEditing'
import { WhenControl, WhenSegmentPicker } from './WhenControl'
import { t } from '../../lib/i18n'
import { act, reportActionError } from '../actionError'

export const PRIORITIES: { p: Priority; label: string; cls: string }[] = [
  // Priority colours come from the p1–p4 tokens (borders, 3:1); the labels use the
  // matching palette hue's text step so they stay readable (4.5:1) in both themes.
  { p: 1, label: 'P1', cls: 'text-(--ot-hue-red-text) border-p1' },
  { p: 2, label: 'P2', cls: 'text-(--ot-hue-orange-text) border-p2' },
  { p: 3, label: 'P3', cls: 'text-(--ot-hue-blue-text) border-p3' },
  { p: 4, label: 'P4', cls: 'text-muted border-p4' },
]

export interface PropertiesProps {
  task: Task
  userId?: string
  readOnly: boolean
  projects: Project[]
  labelMap: Map<string, Label>
  /** The live parent task, when the task has one. */
  parent?: Task
  /** Number of live subtasks (moving the task moves them too). */
  childCount: number
  /** Follow a copy after a move into another sharing scope, or open another task. */
  onOpen?: (id: string) => void
}

const itemKey = (i: PickerItem) => i.key
const itemLabel = (i: PickerItem) => i.label
const itemPath = (i: PickerItem) => i.path
const itemMeta = (i: PickerItem) => i.meta

/** The parts that are optional (revealed by Add, removed when left empty); the rest are fixed. */
const OPTIONAL = new Set<string>(['deadline', 'when', 'evening', 'reminders', 'estimate', 'repeat', 'labels', 'assignee', 'blocked-by', 'parent', 'section', 'location'])
/** The When segment a part opens on. */
const SEGMENT_OF: Record<string, WhenSegmentId> = { due: 'due', evening: 'due', repeat: 'repeat', deadline: 'deadline', when: 'start', reminders: 'reminders' }

function Dot({ color }: { color?: string }) {
  return <span aria-hidden="true" className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color ?? 'var(--ot-faint)' }} />
}

export function Facets(props: PropertiesProps) {
  const { task, readOnly, userId, parent } = props
  const m = usePropertiesModel(props)
  const dt = useDateTimeFormat()
  const ed = m.editing
  const anchors = useRef(new Map<string, HTMLButtonElement>())
  const editingRef = useRef<string | null>(ed.editing)
  editingRef.current = ed.editing
  // The anchor of the open editor: the part that opened it, read when the popover places itself.
  const anchor = useMemo<RefObject<HTMLElement | null>>(() => ({ get current() { return anchors.current.get(editingRef.current ?? '') ?? null } }), [])
  const [segment, setSegment] = useState<WhenSegmentId>('due')
  useEffect(() => { const s = SEGMENT_OF[ed.editing ?? '']; if (s) setSegment(s) }, [ed.editing])

  const setEditing = (id: string, on: boolean) => (OPTIONAL.has(id) ? ed.chipProps(id as Optional) : ed.fixedChip(id)).onEditingChange(on)
  const close = () => { if (ed.editing) setEditing(ed.editing, false) }
  const origin = originOf(task)
  const shownLocation = useShownLocation(task)

  const revealed = useMemo(() => {
    const ids = new Set<string>()
    for (const id of OPTIONAL) if (ed.visible(id as Optional)) ids.add(id)
    return ids
  }, [ed])
  const facets = facetsOf(task, {
    local: m.local,
    zoneCity: isZoned(task.due) ? zoneCity(task.due.tz) : null,
    projectName: m.project?.name ?? t('Inbox'),
    projectArchived: !!m.project?.archived,
    sectionName: m.shownSection ? m.sectionMap.get(m.shownSection)?.name || t('Untitled section') : null,
    parentTitle: task.parent_id ? (parent?.title ?? '') : null,
    originText: origin ? originText(origin) : null,
    originTitle: origin?.title ?? null,
    originLinked: !!origin?.url,
    locationText: shownLocation ? locationLabel(shownLocation) || t('Location') : null,
    labels: m.labels,
    reminders: m.reminders,
    blockerTitles: m.blockers.map((b) => b.title),
    blocks: m.blocks.length,
    assigneeName: task.assignee_id ? m.assigneeName : null,
    revealed,
    dateTime: dt.resolved,
  })

  const onPart = (part: FacetPart) => {
    // The origin opens its source (task-origin); removing it is in the panel's header menu.
    if (part.id === 'origin') { if (origin?.url) openOrigin(origin); return }
    // A second activation of the open part closes its editor (task-panel-polish "Popover triggers toggle").
    if (ed.editing === part.id) { close(); return }
    if (ed.editing) setEditing(ed.editing, false)
    setEditing(part.id, true)
  }
  const line = (facet: FacetId, icon: IconName, name: string, parts: FacetPart[]) => (
    <FacetLine facet={facet} icon={icon} name={name} parts={parts} readOnly={readOnly} open={ed.editing}
      onPart={onPart} partRef={(id, el) => { if (el) anchors.current.set(id, el); else anchors.current.delete(id) }} />
  )

  return (
    <section ref={m.section} aria-label={t('Properties')} className="space-y-0.5" data-facets>
      {line('where', 'folder', t('Where'), facets.where)}
      {line('when', 'calendar-days', t('When'), facets.when)}
      {line('how', 'flag', t('How'), facets.how)}
      {facets.who.length > 0 && line('who', 'users', t('Who'), facets.who)}
      <LocationPreview shown={shownLocation} />
      {!readOnly && <AddMenu task={task} userId={userId} m={m} />}
      {!readOnly && ed.editing && (
        <PartEditor id={ed.editing} props={props} m={m} anchor={anchor} segment={segment} onSegment={setSegment} onClose={close} />
      )}
    </section>
  )
}

/** The popover of the open part: its editor, its title and what Clear does. */
function PartEditor({ id, props, m, anchor, segment, onSegment, onClose }: {
  id: string
  props: PropertiesProps
  m: PropertiesModel
  anchor: RefObject<HTMLElement | null>
  segment: WhenSegmentId
  onSegment: (s: WhenSegmentId) => void
  onClose: () => void
}) {
  const { task, readOnly, userId, childCount, onOpen } = props
  const frame = (icon: IconName, title: string, body: ReactNode, onClear?: () => void, extra: { header?: ReactNode; width?: string } = {}) => (
    <FacetEditor anchor={anchor} icon={icon} title={title} onClose={onClose} onClear={onClear} {...extra}>{body}</FacetEditor>
  )

  if (SEGMENT_OF[id]) {
    const clear: Partial<Record<WhenSegmentId, () => void>> = {
      due: task.due ? () => act(setDueWithUndo(task.id, null)) : undefined,
      start: task.start ? () => void unparkTask(task.id) : undefined,
      deadline: task.deadline ? () => act(updateTask(task.id, { deadline: null })) : undefined,
      repeat: task.recurrence ? () => act(setRecurrence(task.id, null)) : undefined,
    }
    return frame('calendar-days', t('When'), <WhenControl task={task} readOnly={readOnly} segment={segment} onOpen={onOpen} />, clear[segment],
      { header: <WhenSegmentPicker value={segment} onChange={onSegment} />, width: 'sm:w-[28rem]' })
  }

  switch (id) {
    case 'project':
      return frame('folder', t('Project'), (
        <div className="space-y-2">
          {childCount > 0 && <p className="text-meta text-muted">{t('{n, plural, one {Moving this task moves its subtask too.} other {Moving this task moves its subtasks too.}}', { n: childCount })}</p>}
          <ComboboxPanel<PickerItem> label={t('Project')} placeholder={t('Find or create a project…')} source={m.projectItems}
            getKey={itemKey} getLabel={itemLabel} getPath={itemPath} getSecondary={itemMeta} getKeywords={itemKeywords}
            pinned={m.projectPins} selected={[m.currentProject?.key ?? INBOX_KEY]} rankContext="task.project"
            renderLeading={(i) => (i.key === INBOX_KEY ? <Icon name="inbox" className="text-faint" /> : <Dot color={i.color} />)}
            onPick={async (i) => { await m.moveTo(i.value); onClose() }}
            onCreate={async (name) => { const pid = await createProject({ name: name.trim() }); await m.moveTo(pid); onClose() }}
            onClose={onClose} />
        </div>
      ))
    case 'section':
      return frame('kanban', t('Section'), m.followsParent
        ? <p className="text-meta text-muted">{t('Subtasks follow their parent task’s section.')}</p>
        : (
          <ComboboxPanel<PickerItem> label={t('Section')} placeholder={t('Find a section…')} source={sectionSource(m.sections, m.projectId ?? '')}
            getKey={itemKey} getLabel={itemLabel} pinned={[NONE_KEY]} selected={[m.sectionId ?? NONE_KEY]} rankContext="task.section"
            onPick={async (i) => { await moveTaskToSection(task.id, i.value).catch(reportActionError); onClose() }} onClose={onClose} />
        ))
    case 'parent':
      return frame('corner-down-right', t('Parent task'), (
        <div className="space-y-2">
          <ComboboxPanel<PickerItem> label={t('Parent task')} placeholder={t('Find a task…')} source={m.parentItems}
            getKey={itemKey} getLabel={itemLabel} getPath={itemPath} getSecondary={itemMeta}
            pinned={[...m.parentItems.filter((i) => i.marker).map((i) => i.key), NONE_KEY]} selected={[task.parent_id ?? NONE_KEY]} rankContext="task.parent"
            emptyText={t('No open task matches.')} onPick={async (i) => { await m.changeParent(i.value); onClose() }} onClose={onClose} />
          {m.parentError && <p role="alert" className="text-meta text-danger">{m.parentError}</p>}
        </div>
      ), task.parent_id ? () => void m.changeParent(null) : undefined)
    case 'location':
      return frame('map-pin', t('Location'), <LocationEditor task={task} onClose={onClose} />,
        task.location != null ? () => act(setTaskLocation(task.id, null)) : undefined, { width: 'sm:w-[26rem]' })
    case 'priority':
      return frame('flag', t('Priority'), (
        <div className="flex gap-1.5" role="group" aria-label={t('Priority')}>
          {PRIORITIES.map(({ p, label, cls }) => (
            <button key={p} type="button" aria-pressed={task.priority === p}
              className={`min-w-11 rounded-control border px-2.5 py-1 text-meta ${cls} ${task.priority === p ? 'bg-sunken font-semibold dark:bg-raised' : 'border-dashed hover:bg-sunken dark:hover:bg-raised'}`}
              onClick={() => { act(updateTask(task.id, { priority: p })); onClose() }}>{label}</button>
          ))}
        </div>
      ))
    case 'estimate':
      return frame('clock', t('Estimate'), <EstimateField task={task} />, task.estimate_minutes !== null ? () => act(updateTask(task.id, { estimate_minutes: null })) : undefined)
    case 'labels':
      return frame('tag', t('Labels'), (
        <div className="space-y-2">
          {m.labels.length > 0 && <div className="flex flex-wrap gap-1">{m.labels.map((l) => <LabelChip key={l.id} label={l} onRemove={() => act(removeLabel(task.id, l.id))} />)}</div>}
          <LabelPicker taskId={task.id} onClose={onClose} />
        </div>
      ))
    case 'assignee':
      return frame('user-check', t('Assignee'), m.solo && userId
        ? <Switch label={t('Show in Assigned to me')} checked={task.assignee_id === userId} disabled={readOnly} onChange={(on) => act(updateTask(task.id, { assignee_id: on ? userId : null }))} />
        : <AssigneePicker taskId={task.id} userId={userId ?? ''} onClose={onClose} />,
      task.assignee_id ? () => act(updateTask(task.id, { assignee_id: null })) : undefined)
    case 'blocked-by':
      return frame('lock', t('Blocked by'), (
        <div className="space-y-2">
          <ComboboxPanel<Task> label={t('Blocked by')} placeholder={t('Find a task this one waits for…')} source={m.blockerItems}
            getKey={(tk) => tk.id} getLabel={(tk) => tk.title || t('Untitled')} getPath={(tk) => [m.projectName(tk)]} multiple selected={task.blocked_by ?? []}
            rankContext="task.blocked-by" emptyText={t('No open task can block this one.')} onPick={(tk) => m.toggleBlocker(tk.id)} onClose={onClose} />
          {m.blockError && <p role="alert" className="text-meta text-danger">{m.blockError}</p>}
        </div>
      ))
    case 'blocks':
      return frame('arrow-right', t('Blocks'), (
        <ul className="flex min-w-0 flex-col gap-0.5" aria-label={t('Tasks waiting for this one')}>
          {m.blocks.map((tk) => (
            <li key={tk.id} className="min-w-0">
              <button type="button" className="max-w-full truncate text-left text-meta text-accent hover:underline" onClick={() => { onClose(); onOpen?.(tk.id) }}>{tk.title || t('Untitled')}</button>
            </li>
          ))}
        </ul>
      ))
    default:
      return null
  }
}

/** The Add menu (task-panel-facets D5): what is not set, grouped by facet, then Attach. */
function AddMenu({ task, userId, m }: { task: Task; userId?: string; m: PropertiesModel }) {
  const { solo, offerSection, editing: ed } = m
  type Offer = { id: Optional; label: string; icon: IconName; shortcut?: string; when?: boolean; run?: () => void }
  const groups: { title: string; offers: Offer[] }[] = [
    { title: t('Where'), offers: [
      { id: 'section', label: t('Section'), icon: 'kanban', when: offerSection },
      { id: 'parent', label: t('Parent task'), icon: 'corner-down-right' },
      { id: 'location', label: t('Location'), icon: 'map-pin' },
    ] },
    { title: t('When'), offers: [
      { id: 'deadline', label: t('Deadline'), icon: 'hourglass', shortcut: keysOf('list.deadline') },
      { id: 'when', label: t('Start'), icon: 'calendar-range', shortcut: keysOf('list.defer') },
      { id: 'evening', label: t('This Evening'), icon: 'moon', shortcut: keysOf('list.evening'), run: () => act(updateTask(task.id, { evening: true })) },
      { id: 'reminders', label: t('Reminder'), icon: 'alarm-clock' },
      { id: 'repeat', label: t('Repeat'), icon: 'repeat' },
    ] },
    { title: t('How'), offers: [
      { id: 'estimate', label: t('Estimate'), icon: 'clock', shortcut: keysOf('list.estimate') },
      { id: 'labels', label: t('Labels'), icon: 'tag', shortcut: keysOf('list.labels') },
    ] },
    { title: t('Who'), offers: [
      { id: 'assignee', label: solo ? t('Show in Assigned to me') : t('Assignee'), icon: 'user-check', shortcut: solo ? undefined : keysOf('list.assign'), when: !!userId, run: solo && userId ? () => act(updateTask(task.id, { assignee_id: userId })) : undefined },
      { id: 'blocked-by', label: t('Blocked by'), icon: 'lock', shortcut: keysOf('list.blocked-by') },
    ] },
  ]
  const shown = groups.map((g) => ({ ...g, offers: g.offers.filter((o) => (o.when ?? true) && !ed.visible(o.id)) })).filter((g) => g.offers.length > 0)
  return (
    <div className="pl-7" data-add-property>
      <Menu kind="menu" label={t('Add a property')} title={t('Add')} width="sm:w-64" align="start"
        trigger={<span className="inline-flex items-center gap-1 text-meta"><Icon name="plus" size="xs" />{t('Add')}</span>}
        triggerClassName="inline-flex min-h-7 items-center rounded-control px-1 text-muted hover:bg-sunken hover:text-default dark:hover:bg-raised">
        {shown.map((g) => (
          <MenuGroup key={g.title} label={g.title}>
            {g.offers.map((o) => <MenuItem key={o.id} label={o.label} icon={o.icon} shortcut={o.shortcut} onSelect={() => (o.run ? o.run() : ed.reveal(o.id))} />)}
          </MenuGroup>
        ))}
        {shown.length > 0 && <MenuSeparator />}
        <MenuItem label={t('Choose files…')} icon="paperclip" description={t('Or paste or drop files on the task')} onSelect={() => requestAttach(task.id)} />
        <MenuItem label={t('Add a link…')} icon="link" onSelect={() => requestAttach(task.id, 'link')} />
      </Menu>
    </div>
  )
}
