// Process the Inbox one task at a time (OpenSpec change inbox-triage): a focused
// card with single-key decisions (t today, s schedule, m move, a delegate, l
// labels, y someday, c complete, Delete trash, j or Space skip, k back, Enter
// open). Each decision is the same operation the list writes, with its Undo
// toast, so it applies locally first, works offline and converges like any edit.
import { useWithMethod } from './help/MethodLink'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button, ComboboxPanel, EmptyState, Icon, Notice, PageBody, PageHeader, Dialog } from '../ui'
import { formatDate, formatDueLong, logicalToday } from '../lib/dates'
import { useAllLabels, useMemberships, useProjects, useReminderRows } from '../lib/localData'
import { moveTaskAcrossScopes } from '../lib/ops'
import { useMe } from '../lib/sharing'
import { advance, advanceQueue, back, claim, current, positionText, progress, startTriage, type TriageState } from '../lib/triage'
import { useLiveTasks } from '../lib/liveTasks'
import type { Label, Membership, Project, Task } from '../lib/types'
import { LabelPicker } from './LabelPicker'
import { registerListState } from './listActions'
import { Markdown } from './Markdown'
import { setPanelTaskId, setTaskSplit, usePanelTaskId } from './panel'
import { ProjectPickerField } from './ProjectPickerField'
import { ScheduleSheet } from './ScheduleSheet'
import { navigate } from './router'
import { useViewerZone } from './useViews'
import { isActivationTarget, useShortcutScope } from './shortcuts'
import { selectTask } from './signals'
import { completeWithUndo, deleteWithUndo, moveWithUndo, parkWithUndo, setDueWithUndo } from './undoable'
import { t } from '../lib/i18n'
import { keysOf } from '../lib/shortcuts'
import { act } from './actionError'
import { TitleField } from './TitleField'
import { commitTitleEdit } from './titleEdit'

/** Someday (`y`) needs the `start` field of someday-and-evening, which has landed. */
export const HAS_SOMEDAY = true

type Picker = 'schedule' | 'move' | 'delegate' | 'labels' | null

export interface DelegateEntry {
  key: string
  userId: string
  projectId: string
  label: string
}

/** Everyone assignable in a project the user shares, as "Ana · Household" (me excluded). */
export function delegateEntries(memberships: readonly Membership[], projects: readonly Pick<Project, 'id' | 'name' | 'archived' | 'deleted_at'>[], me: string | null): DelegateEntry[] {
  const names = new Map(projects.filter((p) => !p.archived && !p.deleted_at).map((p) => [p.id, p.name]))
  const out: DelegateEntry[] = []
  for (const m of memberships) {
    const project = names.get(m.projectId)
    if (!project || m.role === 'viewer') continue
    for (const u of m.members) {
      if (u.userId === me) continue
      out.push({ key: `${u.userId}:${m.projectId}`, userId: u.userId, projectId: m.projectId, label: `${u.name || u.email} · ${project}` })
    }
  }
  return out.sort((a, b) => a.label.localeCompare(b.label))
}

/** The title on the card. It is a field, so a voice-to-text line can be corrected
 * without the decision keys eating the letters. Leaving it saves; Escape restores. */
function TriageTitle({ task, projects, labels, onLeave }: { task: Task; projects: readonly Project[]; labels: readonly Label[]; onLeave: () => void }) {
  const [draft, setDraft] = useState(task.title)
  const revert = useRef(false)
  useEffect(() => { setDraft(task.title) }, [task.id, task.title])
  const projectName = (id: string) => projects.find((p) => p.id === id)?.name ?? t('the project')
  return (
    <h2 className="user-text text-h2 font-semibold text-strong">
      <TitleField multiline title={task.title} value={draft} onChange={setDraft}
        onCommit={(plan) => {
          if (revert.current) { revert.current = false; setDraft(task.title); return }
          setDraft(typeof plan.patch.title === 'string' ? plan.patch.title : task.title)
          void act(commitTitleEdit(task, plan, labels, projectName))
        }}
        onCancel={() => { revert.current = true; setDraft(task.title); onLeave() }}
        projects={projects} labels={labels}
        className="block w-full min-h-11 resize-none appearance-none border-0 bg-transparent p-0 text-inherit shadow-none outline-none [field-sizing:content] focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-focus"
        ariaLabel={t('Title')} placeholder={t('Untitled')} dataAttrs={{ 'data-triage-title': true }} />
    </h2>
  )
}

/** The decision that needs a choice: a day, a project, a person or labels. */
function Pickers({ picker, task, projects, delegates, onClose, onSchedule, onMove, onDelegate, afterSchedule }: {
  picker: Exclude<Picker, null>; task: Task; projects: readonly Project[]; delegates: DelegateEntry[]; onClose: () => void
  onSchedule: (iso: string | null) => void; onMove: (id: string | null) => void; onDelegate: (d: DelegateEntry) => void; afterSchedule: () => void
}) {
  if (picker === 'schedule') return <ScheduleSheet task={task} onPick={onSchedule} onClose={() => { onClose(); afterSchedule() }} />
  if (picker === 'move') {
    return (
      <Dialog title={t('Move to a project')} onClose={onClose} size="sm">
        <ProjectPickerField label={t('Project')} projects={projects} value={task.project_id} inbox rankContext="triage.move" onChange={onMove} />
      </Dialog>
    )
  }
  if (picker === 'delegate') {
    return (
      <Dialog title={t('Delegate')} onClose={onClose} size="sm">
        <ComboboxPanel<DelegateEntry> label={t('Delegate to')} placeholder={t('Find a person…')} emptyText={t('Nobody matches.')} source={delegates}
          getKey={(d) => d.key} getLabel={(d) => d.label} rankContext="triage.delegate" onPick={onDelegate} onClose={onClose} />
      </Dialog>
    )
  }
  return (
    <Dialog title={t('Labels')} label={t('Labels for task')} onClose={onClose}>
      <LabelPicker taskId={task.id} onClose={onClose} />
    </Dialog>
  )
}

/** Process the Inbox (`/triage`): the card as its own screen. */
export function TriageView() {
  return <Triage />
}

/**
 * The same card embedded in the Loop home's Clarify move (loop-guided-dashboard D4):
 * no page header, Esc and the Vim `:q` close the move, and `onLeft` hears how many
 * tasks are left. Its keys are registered only while it is mounted, so while Clarify is open.
 */
export function TriageCard({ onLeave, onLeft }: { onLeave: () => void; onLeft?: (n: number) => void }) {
  return <Triage embedded={{ onLeave, onLeft }} />
}

function Triage({ embedded }: { embedded?: { onLeave: () => void; onLeft?: (n: number) => void } }) {
  const zone = useViewerZone()
  const tasks = useLiveTasks()
  const projects = useProjects()
  const labels = useAllLabels()
  const memberships = useMemberships()
  const me = useMe()
  const openId = usePanelTaskId()
  // The card keeps the opened task beside it from 1024 px instead of leaving for the task page (task-full-page D3).
  useEffect(() => setTaskSplit(true), [])
  const [state, setState] = useState<TriageState | null>(null)
  const [picker, setPicker] = useState<Picker>(null)
  const [announce, setAnnounce] = useState('')
  // The last decision, said before the next task's position ("Completed: X. 2 of 5: Y").
  const outcome = useRef('')
  const [notice, setNotice] = useState<string | null>(null)
  const card = useRef<HTMLElement>(null)
  const stateRef = useRef(state)
  stateRef.current = state

  // The queue: the Inbox when the mode opens, then following the live tasks.
  useEffect(() => {
    if (!tasks) return
    setState((s) => {
      if (!s) return startTriage(tasks)
      const { state: next, left } = advanceQueue(s, tasks)
      if (left) setNotice(t('That task left the Inbox on another device, so the next one is shown.'))
      return next
    })
  }, [tasks])

  // Open and completed live tasks; a task trashed this session is not in it.
  const byId = useMemo(() => new Map((tasks ?? []).map((tk) => [tk.id, tk])), [tasks])
  const curId = state ? current(state) : null
  const task = curId ? byId.get(curId) : undefined
  const p = state ? progress(state) : { n: 0, total: 0, done: true }
  const delegates = useMemo(() => delegateEntries(memberships, projects, me), [memberships, projects, me])
  const meta = useWithMethod('clarify', p.total > 0 && !p.done ? <span data-triage-progress className="tabular-nums text-muted">{t('{n} of {total}', { n: p.n, total: p.total })}</span> : undefined)
  const methodSubtitle = useWithMethod('clarify')
  const reminders = useReminderRows(curId)

  // A position whose task is gone (trashed this session) is passed over in the direction of travel.
  const dir = useRef<1 | -1>(1)
  // The task being decided: gone from the live tasks (trashed) before the decision moves on, it is not skipped twice.
  const deciding = useRef<string | null>(null)
  useEffect(() => {
    if (!state || !tasks || state.index >= state.ids.length || byId.has(state.ids[state.index]) || state.ids[state.index] === deciding.current) return
    const step = dir.current
    setState((s) => {
      if (!s) return s
      let i = s.index
      while (i >= 0 && i < s.ids.length && !byId.has(s.ids[i])) i += step
      return { ...s, index: i < 0 ? s.index + 1 : Math.min(i, s.ids.length) }
    })
  }, [state, tasks, byId])

  // Focus the card and announce the task on every advance.
  useEffect(() => {
    if (!state || !task) return
    setAnnounce(`${outcome.current ? `${outcome.current} ` : ''}${positionText(state, task.title || t('Untitled'))}`)
    outcome.current = ''
    card.current?.focus()
  }, [curId]) // eslint-disable-line react-hooks/exhaustive-deps -- announce once per advance, not on every edit of the task

  const next = useCallback((said?: string) => {
    if (said) { setAnnounce(said); outcome.current = said }
    setNotice(null)
    setPicker(null)
    dir.current = 1
    deciding.current = null
    setState((s) => (s ? advance(s) : s))
  }, [])

  // The task being decided stays in the queue while its write lands (lib/triage claim).
  const hold = useCallback((id: string) => {
    deciding.current = id
    setState((s) => (s ? claim(s, id) : s))
  }, [])

  const onLeave = embedded?.onLeave
  const leave = useCallback(() => {
    if (onLeave) { onLeave(); return }
    // Back to the Inbox with the current task selected (the list reads ?task=).
    const id = stateRef.current ? current(stateRef.current) : null
    if (id) selectTask.set(id)
    navigate({ view: 'inbox' })
  }, [onLeave])
  // How many are left, the current task included (the Clarify move's "n left").
  const left = !state ? null : p.done ? 0 : p.total - p.n + 1
  const onLeft = embedded?.onLeft
  useEffect(() => { if (left !== null) onLeft?.(left) }, [left, onLeft])

  const decide = useCallback(async (kind: 'today' | 'complete' | 'trash' | 'someday' | 'skip') => {
    const item = task
    if (!item) return
    if (kind !== 'skip') hold(item.id)
    switch (kind) {
      case 'today': await setDueWithUndo(item.id, { ...(item.due ?? {}), date: logicalToday() }); next(t('Due today: {title}.', { title: item.title || t('Untitled') })); break
      case 'complete': await completeWithUndo(item.id, true); next(t('Completed: {title}.', { title: item.title || t('Untitled') })); break
      case 'trash': await deleteWithUndo(item.id); next(t('Moved to the Trash: {title}.', { title: item.title || t('Untitled') })); break
      case 'someday': if (HAS_SOMEDAY) { await parkWithUndo(item.id); next(t('Parked in Someday: {title}.', { title: item.title || t('Untitled') })) } break
      case 'skip': next(t('Skipped: {title}.', { title: item.title || t('Untitled') })); break
    }
  }, [task, next, hold])

  const schedule = useCallback(async (iso: string | null) => {
    if (!task || !iso) return
    hold(task.id)
    await setDueWithUndo(task.id, { ...(task.due ?? {}), date: iso })
    next(t('Scheduled for {date}: {title}.', { date: formatDate(iso, 'long'), title: task.title || t('Untitled') }))
  }, [task, next, hold])

  const moveTo = useCallback(async (projectId: string | null) => {
    if (!task || projectId === null) return
    hold(task.id)
    const name = projects.find((x) => x.id === projectId)?.name ?? t('the project')
    await moveWithUndo(task.id, projectId, name)
    next(t('Moved to {project}: {title}.', { project: name, title: task.title || t('Untitled') }))
  }, [task, projects, next, hold])

  const delegate = useCallback(async (d: DelegateEntry) => {
    if (!task) return
    hold(task.id)
    // Into the project and assigned, in one operation set (a cross-scope move carries the assignee).
    await moveTaskAcrossScopes(task.id, { project_id: d.projectId, assignee_id: d.userId })
    next(t('Delegated to {name}: {title}.', { name: d.label, title: task.title || t('Untitled') }))
  }, [task, next, hold])

  // The Vim layer acts through the list state (vim-keybindings): j / k move, x completes, dd trashes, :q leaves.
  useEffect(() => registerListState({
    rows: () => { const s = stateRef.current; return s ? s.ids.map((id) => byId.get(id)).filter((task): task is Task => !!task) : [] },
    columns: () => null,
    selected: () => (stateRef.current ? current(stateRef.current) : null),
    select: (id) => {
      const s = stateRef.current
      if (!s) return
      if (id === null) { leave(); return }
      const i = s.ids.indexOf(id)
      if (i === s.index + 1) next()
      else if (i >= 0 && i !== s.index) { dir.current = i > s.index ? 1 : -1; setState({ ...s, index: i }) }
    },
    openId: () => openId,
    open: (id) => setPanelTaskId(id),
    readOnly: () => false,
    manual: () => false,
    focusQuickAdd: () => false,
    toggleComplete: async (id, completed) => { if (completed) hold(id); await completeWithUndo(id, completed); if (completed) next() },
  }), [byId, openId, leave, next, hold])

  // Keys (design D3): the mode's `view` entries of the shortcut registry (keyboard-
  // shortcuts "One shortcut registry with scopes"). The dispatcher keeps them out of
  // text fields and open dialogs (the pickers); the panel's own Escape runs first while
  // focus is inside it. With Vim keybindings on, x and dd arrive through the list
  // state above, and j / k without a count still skip and go back.
  const onCard = (e: KeyboardEvent) => !!task && !openId && !isActivationTarget(e.target)
  useShortcutScope('view', {
    'triage.escape': () => { if (openId) setPanelTaskId(null); else leave() },
    'triage.today': () => { if (!task || openId) return false; void decide('today') },
    'triage.complete': () => { if (!task || openId) return false; void decide('complete') },
    'triage.trash': () => { if (!task || openId) return false; void decide('trash') },
    'triage.skip': (e) => { if (!onCard(e)) return false; void decide('skip') },
    'triage.back': () => { if (!task || openId) return false; dir.current = -1; setState((s) => (s ? back(s) : s)) },
    'triage.open': (e) => { if (!onCard(e)) return false; setPanelTaskId(task!.id) },
    'triage.schedule': () => { if (!task || openId) return false; setPicker('schedule') },
    'triage.move': () => { if (!task || openId) return false; setPicker('move') },
    'triage.labels': () => { if (!task || openId) return false; setPicker('labels') },
    'triage.delegate': () => { if (!task || openId || !delegates.length) return false; setPicker('delegate') },
    'triage.someday': () => { if (!task || openId || !HAS_SOMEDAY) return false; void decide('someday') },
  }, { view: 'triage', paused: !!picker })

  // Back from the panel: the card takes the focus again.
  useEffect(() => { if (!openId) card.current?.focus() }, [openId])

  const label = (id: string) => labels.find((l) => l.id === id)?.name ?? 'label'
  const bar: { key: string; hint: string; label: string; run: () => void; disabled?: boolean }[] = task ? [
    { key: 'today', hint: 't', label: t('Today'), run: () => void decide('today') },
    { key: 'schedule', hint: 's', label: t('Schedule'), run: () => setPicker('schedule') },
    { key: 'move', hint: 'm', label: t('Move'), run: () => setPicker('move') },
    { key: 'delegate', hint: 'a', label: t('Delegate'), run: () => setPicker('delegate'), disabled: delegates.length === 0 },
    { key: 'labels', hint: 'l', label: t('Labels'), run: () => setPicker('labels') },
    ...(HAS_SOMEDAY ? [{ key: 'someday', hint: 'y', label: t('Someday'), run: () => void decide('someday') }] : []),
    { key: 'complete', hint: 'c', label: t('Complete'), run: () => void decide('complete') },
    { key: 'trash', hint: 'Del', label: t('Trash'), run: () => void decide('trash') },
    { key: 'skip', hint: 'j', label: t('Skip'), run: () => void decide('skip') },
    { key: 'back', hint: 'k', label: t('Back'), run: () => setState((s) => (s ? back(s) : s)), disabled: !state || state.index === 0 },
  ] : []

  const body = (
    <>
      <p className="sr-only" role="status" aria-live="polite" data-triage-live>{announce}</p>
      {notice && <div className="mb-3"><Notice>{notice}</Notice></div>}
      {!state ? null : !task ? (
        embedded ? (
          <p className="flex items-center gap-2 py-2 text-body text-muted" data-empty-state="triage">
            <Icon name="circle-check-big" className="shrink-0 text-success" />{t('Inbox zero: every task has a place.')}
          </p>
        ) : (
          <div data-empty-state="triage">
            <EmptyState illustration="inbox-zero" title={t('Inbox zero: every task has a place.')} action={{ label: t('Back to the Inbox'), onClick: () => navigate({ view: 'inbox' }), shortcut: keysOf('go.inbox') }} />
          </div>
        )
      ) : (
        <>
          <section ref={card} tabIndex={-1} aria-label={t('Task {n} of {total}', { n: p.n, total: p.total })} data-triage-card={task.id}
            className="rounded-card border border-default bg-surface p-5 outline-none shadow-1 focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-focus">
            <TriageTitle task={task} projects={projects} labels={labels} onLeave={() => card.current?.focus()} />
            {(task.due || task.labels.length > 0 || reminders.some((r) => !r.deleted_at)) && (
              <p className="mt-2 flex flex-wrap gap-2 text-meta text-muted">
                {task.due && <span>{t('Due {date}', { date: formatDueLong(task.due, zone) })}</span>}
                {task.labels.map((l) => <span key={l} className="rounded-chip bg-sunken px-1.5">@{label(l)}</span>)}
                {reminders.filter((r) => !r.deleted_at).length > 0 && <span>{t('{count} reminder(s)', { count: reminders.filter((r) => !r.deleted_at).length })}</span>}
              </p>
            )}
            {task.description?.trim() && <div className="mt-3 text-body"><Markdown source={task.description} /></div>}
          </section>
          <div role="toolbar" aria-label={t('Decisions')} className="mt-4 flex flex-wrap gap-2" data-triage-bar>
            {bar.map((b) => (
              <Button key={b.key} size="sm" variant={b.key === 'today' ? 'primary' : 'secondary'} disabled={b.disabled} onClick={b.run}
                aria-keyshortcuts={b.hint === 'Del' ? 'Delete' : b.hint} data-decision={b.key}>
                {b.label} <span className="ui-kbd ml-1">{b.hint}</span>
              </Button>
            ))}
            <Button size="sm" variant="ghost" onClick={() => setPanelTaskId(task.id)} data-decision="open">{t('Open')} <span className="ui-kbd ml-1">Enter</span></Button>
          </div>
          {delegates.length === 0 && <p className="mt-2 text-meta text-faint">{t('Delegating needs a project you share with someone.')}</p>}
        </>
      )}

      {task && picker && <Pickers picker={picker} task={task} projects={projects} delegates={delegates} onClose={() => setPicker(null)} onSchedule={(iso) => void schedule(iso)}
        onMove={(id) => act(moveTo(id))} onDelegate={(d) => void delegate(d)} afterSchedule={() => card.current?.focus()} />}
    </>
  )
  if (embedded) return <div data-triage data-triage-embedded>{body}</div>
  return (
    <PageBody data-triage>
      <PageHeader title={t('Process the Inbox')} help="inbox/triage" back={{ label: t('Inbox'), onClick: leave }}
        meta={meta} subtitle={methodSubtitle} />
      {body}
    </PageBody>
  )
}
