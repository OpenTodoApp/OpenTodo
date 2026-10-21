// Process the Inbox one task at a time (OpenSpec change inbox-triage): a focused
// card with single-key decisions (t today, s schedule, m move, a delegate, l
// labels, y someday, c complete, Delete trash, j or Space skip, k back, Enter
// open). Each decision is the same operation the list writes, with its Undo
// toast, so it applies locally first, works offline and converges like any edit.
import { useWithMethod } from './help/MethodLink'
import { useLiveQuery } from 'dexie-react-hooks'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button, ComboboxPanel, EmptyState, Notice, PageBody, PageHeader, Dialog } from '../ui'
import { formatDate, formatDueLong, logicalToday } from '../lib/dates'
import { useAllLabels, useMemberships, useProjects, useReminderRows } from '../lib/localData'
import { moveTaskAcrossScopes } from '../lib/ops'
import { currentUserId } from '../lib/sharing'
import { advance, advanceQueue, back, current, positionText, progress, startTriage, type TriageState } from '../lib/triage'
import { useLiveTasks } from '../lib/liveTasks'
import type { Membership, Project, Task } from '../lib/types'
import { LabelPicker } from './LabelPicker'
import { registerListState } from './listActions'
import { Markdown } from './Markdown'
import { setPanelTaskId, usePanelTaskId } from './panel'
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

export function TriageView() {
  const zone = useViewerZone()
  const tasks = useLiveTasks()
  const projects = useProjects()
  const labels = useAllLabels()
  const memberships = useMemberships()
  const me = useLiveQuery(() => currentUserId(), [], null)
  const openId = usePanelTaskId()
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
  useEffect(() => {
    if (!state || !tasks || state.index >= state.ids.length || byId.has(state.ids[state.index])) return
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
    setState((s) => (s ? advance(s) : s))
  }, [])

  const leave = useCallback(() => {
    // Back to the Inbox with the current task selected (the list reads ?task=).
    const id = stateRef.current ? current(stateRef.current) : null
    if (id) selectTask.set(id)
    navigate({ view: 'inbox' })
  }, [])

  const decide = useCallback(async (kind: 'today' | 'complete' | 'trash' | 'someday' | 'skip') => {
    const item = task
    if (!item) return
    switch (kind) {
      case 'today': await setDueWithUndo(item.id, { ...(item.due ?? {}), date: logicalToday() }); next(t('Due today: {title}.', { title: item.title || t('Untitled') })); break
      case 'complete': await completeWithUndo(item.id, true); next(t('Completed: {title}.', { title: item.title || t('Untitled') })); break
      case 'trash': await deleteWithUndo(item.id); next(t('Moved to the Trash: {title}.', { title: item.title || t('Untitled') })); break
      case 'someday': if (HAS_SOMEDAY) { await parkWithUndo(item.id); next(t('Parked in Someday: {title}.', { title: item.title || t('Untitled') })) } break
      case 'skip': next(t('Skipped: {title}.', { title: item.title || t('Untitled') })); break
    }
  }, [task, next])

  const schedule = useCallback(async (iso: string | null) => {
    if (!task || !iso) return
    await setDueWithUndo(task.id, { ...(task.due ?? {}), date: iso })
    next(t('Scheduled for {date}: {title}.', { date: formatDate(iso, 'long'), title: task.title || t('Untitled') }))
  }, [task, next])

  const moveTo = useCallback(async (projectId: string | null) => {
    if (!task || projectId === null) return
    const name = projects.find((x) => x.id === projectId)?.name ?? t('the project')
    await moveWithUndo(task.id, projectId, name)
    next(t('Moved to {project}: {title}.', { project: name, title: task.title || t('Untitled') }))
  }, [task, projects, next])

  const delegate = useCallback(async (d: DelegateEntry) => {
    if (!task) return
    // Into the project and assigned, in one operation set (a cross-scope move carries the assignee).
    await moveTaskAcrossScopes(task.id, { project_id: d.projectId, assignee_id: d.userId })
    next(t('Delegated to {name}: {title}.', { name: d.label, title: task.title || t('Untitled') }))
  }, [task, next])

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
    toggleComplete: async (id, completed) => { await completeWithUndo(id, completed); if (completed) next() },
  }), [byId, openId, leave, next])

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

  return (
    <PageBody data-triage>
      <PageHeader title={t('Process the Inbox')} help="inbox/triage" back={{ label: t('Inbox'), onClick: leave }}
        meta={meta} subtitle={methodSubtitle} />
      <p className="sr-only" role="status" aria-live="polite" data-triage-live>{announce}</p>
      {notice && <div className="mb-3"><Notice>{notice}</Notice></div>}
      {!state ? null : !task ? (
        <div data-empty-state="triage">
          <EmptyState illustration="inbox-zero" title={t('Inbox zero: every task has a place.')} action={{ label: t('Back to the Inbox'), onClick: () => navigate({ view: 'inbox' }), shortcut: keysOf('go.inbox') }} />
        </div>
      ) : (
        <>
          <section ref={card} tabIndex={-1} aria-label={t('Task {n} of {total}', { n: p.n, total: p.total })} data-triage-card={task.id}
            className="rounded-card border border-default bg-surface p-5 outline-none shadow-1 focus-visible:outline-2 focus-visible:outline-focus">
            <h2 className="user-text text-h2 font-semibold text-strong">{task.title || t('Untitled')}</h2>
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

      {task && picker === 'schedule' && (
        <ScheduleSheet task={task} onPick={(iso) => void schedule(iso)} onClose={() => { setPicker(null); card.current?.focus() }} />
      )}
      {task && picker === 'move' && (
        <Dialog title={t('Move to a project')} onClose={() => setPicker(null)} size="sm">
          <ProjectPickerField label={t('Project')} projects={projects} value={task.project_id} inbox rankContext="triage.move" onChange={(id) => act(moveTo(id))} />
        </Dialog>
      )}
      {task && picker === 'delegate' && (
        <Dialog title={t('Delegate')} onClose={() => setPicker(null)} size="sm">
          <ComboboxPanel<DelegateEntry> label={t('Delegate to')} placeholder={t('Find a person…')} emptyText={t('Nobody matches.')} source={delegates}
            getKey={(d) => d.key} getLabel={(d) => d.label} rankContext="triage.delegate" onPick={(d) => void delegate(d)} onClose={() => setPicker(null)} />
        </Dialog>
      )}
      {task && picker === 'labels' && (
        <Dialog title={t('Labels')} label={t('Labels for task')} onClose={() => setPicker(null)}>
          <LabelPicker taskId={task.id} onClose={() => setPicker(null)} />
        </Dialog>
      )}
    </PageBody>
  )
}
