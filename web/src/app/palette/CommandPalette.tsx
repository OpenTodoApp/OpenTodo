// The command palette (OpenSpec change search-and-command-palette): one box on
// Ctrl/⌘+K that finds any task, project, label, saved view or Settings section from
// local data and runs any command by name. Lazy chunk, mounted by Shell on first open.
import { useLiveQuery } from 'dexie-react-hooks'
import { useFieldDefs } from '../useFields'
import { useEffect, useMemo, useRef, useState } from 'react'
import { db } from '../../lib/db'
import { pickScores } from '../../lib/pickRank'
import { canEditProject, membershipMap, roleOf } from '../../lib/sharing'
import { loadViewMode } from '../../lib/sections'
import { visibleTasks } from '../../lib/trash'
import type { Label, Project, Section, Task, User, View } from '../../lib/types'
import { ComboboxField, ComboboxList, ComboboxPanel } from '../../ui'
import { useCombobox } from '../../ui'
import { Icon } from '../../ui'
import { HelpLink } from '../help/HelpLink'
import { currentFilter, listState } from '../listActions'
import { Confirmation } from '../menus/ActionMenu'
import { NamePrompt } from '../NamePrompt'
import { Dialog } from '../overlay/Dialog'
import { moveTargets } from '../ProjectHeader'
import { useRoute } from '../router'
import { useStartView, useToday } from '../useViews'
import { useVimEnabled } from '../vim/prefs'
import { groupOf, isStep, KIND_ICON, secondaryOf, type Entry, type Step } from './entries'
import { filterEntries } from './filterEntries'
import { buildEntries, makeTaskEntry } from './index'
import { commandEntries, contextEntries, trailingEntries, type PaletteContext } from './registry'
import { t } from '../../lib/i18n'

/** At most this many entries are listed; the rest are counted. */
export const PALETTE_LIMIT = 50
const DEBOUNCE_MS = 150
const RECENT = 10

export default function CommandPalette({ user, onClose, showShortcuts }: { user: User | null; onClose: () => void; showShortcuts: () => void }) {
  const route = useRoute()
  const today = useToday()
  const vimEnabled = useVimEnabled()
  const startView = useStartView()
  // The list on screen when the box opened: its selection is what task commands act on.
  const [list] = useState(() => listState())
  const [taskId] = useState(() => list?.selected() ?? list?.openId() ?? null)
  const [mode, setMode] = useState<'search' | 'closing' | Step>('search')

  const tasks = useLiveQuery(() => visibleTasks(), [], [] as Task[])
  const projects = useLiveQuery(() => db.projects.filter((p) => !p.deleted_at).toArray(), [], [] as Project[])
  const labels = useLiveQuery(() => db.labels.filter((l) => !l.deleted_at).toArray(), [], [] as Label[])
  const views = useLiveQuery(() => db.views.filter((v) => !v.deleted_at).toArray(), [], [] as View[])
  const memberships = useLiveQuery(() => membershipMap(), [])
  const scores = useLiveQuery(() => pickScores('palette'), [], new Map<string, number>())
  const task = useMemo(() => tasks.find((tk) => tk.id === taskId), [tasks, taskId])
  const sectionInfo = useLiveQuery(async () => {
    if (!task?.section_id || !task.project_id) return undefined
    const sections = (await db.sections.where('project_id').equals(task.project_id).toArray()).filter((s) => !s.deleted_at).sort((a, b) => a.position - b.position)
    const i = sections.findIndex((s) => s.id === task.section_id)
    if (i < 0) return undefined
    const count = await db.tasks.filter((tk) => tk.section_id === task.section_id && !tk.deleted_at && !tk.completed_at).count()
    return { row: sections[i] as Section, first: i === 0, last: i === sections.length - 1, layout: (await loadViewMode(task.project_id)) === 'board' ? 'board' as const : 'list' as const, count }
  }, [task?.section_id, task?.project_id])

  // What is typed, debounced, for the filter results and the "Search Help" command.
  const [typed, setTyped] = useState('')
  const [query, setQuery] = useState('')
  useEffect(() => {
    const entry = setTimeout(() => setQuery(typed), DEBOUNCE_MS)
    return () => clearTimeout(entry)
  }, [typed])

  const ctx = useMemo<PaletteContext>(() => {
    const projectId = route.view === 'project' ? route.id : null
    const project = projectId ? projects.find((p) => p.id === projectId) : undefined
    const role = roleOf(projectId, memberships ?? new Map())
    const view = route.view === 'view' ? views.find((v) => v.id === route.id) : undefined
    const label = route.view === 'label' ? labels.find((l) => l.id === route.id) : undefined
    const sorted = [...views].sort((a, b) => a.position - b.position)
    return {
      route, user, today, list, task, filterQuery: route.view === 'filter' ? currentFilter() : null, query, vimEnabled, showShortcuts,
      focusQuickAdd: () => list?.focusQuickAdd(null) ?? false,
      project: project && canEditProject(role) ? {
        row: project, role, shared: !!memberships?.get(project.id), targets: moveTargets(project, projects),
        subCount: projects.filter((p) => p.parent_id === project.id).length,
        openTasks: tasks.filter((task) => task.project_id === project.id && !task.completed_at).length,
      } : undefined,
      view: view ? { row: view, peers: sorted.filter((v) => v.pinned === view.pinned), isStart: startView === `view:${view.id}` } : undefined,
      label: label ? { row: label, labels: [...labels].sort((a, b) => a.position - b.position) } : undefined,
      section: sectionInfo && task && list && !list.readOnly(task) ? sectionInfo : undefined,
    }
  }, [route, user, today, list, task, query, vimEnabled, showShortcuts, projects, memberships, views, labels, tasks, startView, sectionInfo])

  const taskEntry = useMemo(() => makeTaskEntry(projects, today), [projects, today])
  const source = useMemo(() => [...commandEntries(ctx), ...buildEntries({ tasks, projects, labels, views, user, today })], [ctx, tasks, projects, labels, views, user, today])
  const emptySource = useMemo(() => {
    const context = contextEntries(ctx)
    const seen = new Set(context.map((e) => e.key))
    // Recent picks (from the pick history) sit under their own heading.
    const recent = [...scores.keys()].map((k) => source.find((e) => e.key === k)).filter((e): e is Entry => !!e && !seen.has(e.key)).slice(0, RECENT)
      .map((e): Entry => ({ ...e, group: t('Recent') }))
    recent.forEach((e) => seen.add(e.key))
    // Never an empty box: general commands (new task, go to…) fill it up to ten.
    const general = source.filter((e) => e.kind === 'command' && !seen.has(e.key)).slice(0, Math.max(0, RECENT - context.length - recent.length))
    return [...context, ...recent, ...general]
  }, [ctx, scores, source])
  const fieldDefs = useFieldDefs()
  const prefix = useMemo(() => filterEntries(query, tasks, { today, labels, projects, fields: fieldDefs }, taskEntry), [query, tasks, today, labels, projects, fieldDefs, taskEntry])

  const trailing = useMemo(() => trailingEntries(ctx), [ctx])
  const keepOpen = useRef(false)
  const state = useCombobox<Entry>({
    source, emptySource, prefix, suffix: trailing, limit: PALETTE_LIMIT, rankContext: 'palette',
    getKey: (e) => e.key, getLabel: (e) => e.label, getSecondary: secondaryOf, getKeywords: (e) => e.keywords, getGroup: groupOf,
    onPick: (e) => {
      // The box closes first, so the action's own focus (quick add, a prompt) wins.
      keepOpen.current = true
      setMode('closing')
      setTimeout(() => {
        void Promise.resolve(e.run()).then((r) => (isStep(r) ? setMode(r) : onClose()), () => onClose())
      }, 0)
    },
    onClose: () => { if (keepOpen.current) keepOpen.current = false; else onClose() },
  })
  useEffect(() => { setTyped(state.query) }, [state.query])

  if (mode === 'closing') return null
  if (mode !== 'search') {
    if (mode.kind === 'confirm') return <Confirmation spec={mode.confirm} onClose={onClose} />
    if (mode.kind === 'prompt') {
      return <NamePrompt title={mode.title} label={mode.label} initial={mode.initial} onCancel={onClose}
        onSubmit={async (v) => { await mode.onSubmit(v); onClose() }} />
    }
    const picker = mode.picker
    return (
      <Dialog title={picker.title} onClose={onClose} size="md">
        <ComboboxPanel {...picker} label={picker.title}
          onPick={async (item: unknown) => { const c = await picker.onPick(item); if (c) setMode({ kind: 'confirm', confirm: c }); else onClose() }}
          onClose={onClose} />
      </Dialog>
    )
  }
  return (
    <Dialog title={t('Search and commands')} label={t('Search and commands')} onClose={onClose} size="md" testId="command-palette">
      <div className="space-y-1" data-combobox data-palette>
        <ComboboxField state={state} label={t('Search tasks, projects and commands')} placeholder={t('Search or type a command…')} expanded autoFocus />
        {!state.query.trim() && (
          <p className="flex items-center gap-2 px-1 text-meta text-muted">
            <span className="min-w-0 flex-1">{t.rich('Type to search, or a command. Filter queries like {example} work too.', { example: <code>@errand &amp; p1</code> })}</span>
            <HelpLink screen="palette" topic={t('Search and commands')} />
          </p>
        )}
        <ComboboxList state={state} label={t('Results')} emptyText={t('Nothing matches. Try fewer letters, or a filter query.')}
          renderLeading={(e) => <Icon name={e.icon ?? KIND_ICON[e.kind]} className="text-faint" />} />
      </div>
    </Dialog>
  )
}
