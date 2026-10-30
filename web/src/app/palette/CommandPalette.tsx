// The command palette (OpenSpec change search-and-command-palette): one box on
// Ctrl/⌘+K that finds any task, project, label, saved view or Settings section from
// local data and runs any command by name. Lazy chunk, mounted by Shell on first open.
// One bar, four modes (moments-and-onboarding D7, modes.ts): Search (default; its last
// entry adds the text as a task, Ctrl/⌘+Enter too), Add (the quick-add palette),
// Commands (the registry only) and Ask (handed to the assistant panel), switched by the
// segmented control or the `+`, `>` and `?` prefixes; Escape in another mode returns to
// Search, except in Add when the bar was opened in Add. One shell for every mode
// (palette-quick-add D4-D6): a card near the top, the field, the results with their
// keycaps, and a footer that names the keys.
import { useWorkspaceFilter } from '../useWorkspaceFilter'
import { useAgentExclusions } from '../../lib/agentAccess'
import { useFieldDefs } from '../useFields'
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type SetStateAction } from 'react'
import { useLabels, useProjects, useProjectsOfEveryWorkspace, useSectionPlace, useUserPrefsRow, useWorkspaceState, useMembershipMapOrLoading } from '../../lib/localData'
import { isFavourite } from '../../lib/favourites'
import { earlierIds } from '../../lib/dayLists'
import { usePickScores } from '../../lib/pickRank'
import { canEditProject, roleOf } from '../../lib/sharing'
import { useViewMode } from '../../lib/sections'
import { NO_TASKS, useLiveTasks, useTasksOfEveryWorkspace } from '../../lib/liveTasks'
import { Partition } from '../../lib/workspaces'
import { workspaceLabel } from '../workspaceNav'
import type { Task, User } from '../../lib/types'
import { ComboboxField, ComboboxList, ComboboxPanel, Dialog } from '../../ui'
import { useCombobox } from '../../ui'
import { Icon } from '../../ui'
import { currentFilter, listState } from '../listActions'
import { Confirmation } from '../menus/ActionMenu'
import { NamePrompt } from '../NamePrompt'
import { moveTargets } from '../ProjectHeader'
import { useRoute } from '../router'
import { useStartView, useToday, useViews } from '../useViews'
import { useVimEnabled } from '../vim/prefs'
import { groupOf, isStep, KIND_ICON, secondaryOf, type Entry, type Step } from './entries'
import { filterEntries } from './filterEntries'
import { buildEntries, makeTaskEntry } from './index'
import { commandEntries, contextEntries, trailingEntries, type PaletteContext } from './registry'
import { t } from '../../lib/i18n'
import { useAssistantStatus } from '../../lib/assistantStatus'
import { addFromBar, addManyFromBar, lineToInput } from './addFromBar'
import { AddPanel, AskPanel, BarFooter, ModeSwitch, ShortcutKeys } from './BarParts'
import { barModes, PREFIX_OF, prefixSwitch, type BarMode } from './modes'
import { useResetOnChange } from '../../lib/useResetOnChange'

/** At most this many entries are listed; the rest are counted. */
export const PALETTE_LIMIT = 50
const DEBOUNCE_MS = 150
const RECENT = 10

export default function CommandPalette({ user, onClose, showShortcuts, initialMode = 'search', initialText }: {
  user: User | null; onClose: () => void; showShortcuts: () => void; initialMode?: BarMode
  /** Text Add mode starts with (the workbench shows the chips with it). */
  initialText?: string
}) {
  const route = useRoute()
  const today = useToday()
  const vimEnabled = useVimEnabled()
  const workspaceState = useWorkspaceState()
  const startView = useStartView()
  // The list on screen when the box opened: its selection is what task commands act on.
  const [list] = useState(() => listState())
  const [taskId] = useState(() => list?.selected() ?? list?.openId() ?? null)
  const [mode, setMode] = useState<'search' | 'closing' | Step>('search')
  const askAvailable = !!useAssistantStatus()?.available
  const modes = barModes(askAvailable)
  const [bar, setBar] = useState<BarMode>(initialMode)

  const tasks = useLiveTasks() ?? NO_TASKS
  const projects = useProjects()
  const labels = useLabels()
  const prefs = useUserPrefsRow()
  const views = useViews()
  const memberships = useMembershipMapOrLoading()
  const scores = usePickScores('palette')
  const task = useMemo(() => tasks.find((tk) => tk.id === taskId), [tasks, taskId])
  const place = useSectionPlace(task?.section_id, task?.project_id)
  const viewMode = useViewMode(task?.project_id)
  const sectionInfo = useMemo(() => (place ? { ...place, layout: viewMode === 'board' ? 'board' as const : 'list' as const } : undefined), [place, viewMode])

  // What is typed, debounced, for the filter results and the "Search Help" command.
  const [typed, setTyped] = useState('')
  const [query, setQuery] = useState('')
  useEffect(() => {
    const entry = setTimeout(() => setQuery(typed), DEBOUNCE_MS)
    return () => clearTimeout(entry)
  }, [typed])

  const agentExclusions = useAgentExclusions()
  const ctx = useMemo<PaletteContext>(() => {
    const projectId = route.view === 'project' ? route.id : null
    const project = projectId ? projects.find((p) => p.id === projectId) : undefined
    const role = roleOf(projectId, memberships ?? new Map())
    const view = route.view === 'view' ? views.find((v) => v.id === route.id) : undefined
    const label = route.view === 'label' ? labels.find((l) => l.id === route.id) : undefined
    const sorted = [...views].sort((a, b) => a.position - b.position)
    return {
      route, user, today, list, task, filterQuery: route.view === 'filter' ? currentFilter() : null, query, vimEnabled, showShortcuts,
      workspaces: { list: workspaceState.list, current: workspaceState.current },
      focusQuickAdd: () => list?.focusQuickAdd(null) ?? false,
      project: project && canEditProject(role) ? {
        row: project, role, shared: !!memberships?.get(project.id), targets: moveTargets(project, projects),
        subCount: projects.filter((p) => p.parent_id === project.id).length,
        openTasks: tasks.filter((task) => task.project_id === project.id && !task.completed_at).length,
        pinned: isFavourite(prefs, 'project', project.id),
        keptAway: agentExclusions.has(project.id),
      } : undefined,
      view: view ? { row: view, peers: sorted, isStart: startView === `view:${view.id}` } : undefined,
      label: label ? { row: label, labels: [...labels].sort((a, b) => a.position - b.position), pinned: isFavourite(prefs, 'label', label.id) } : undefined,
      section: sectionInfo && task && list && !list.readOnly(task) ? sectionInfo : undefined,
      earlier: earlierIds(tasks, projects, today),
    }
  }, [route, user, today, list, task, query, vimEnabled, showShortcuts, projects, memberships, views, labels, tasks, startView, sectionInfo, prefs, agentExclusions, workspaceState])

  const taskEntry = useMemo(() => makeTaskEntry(projects, today), [projects, today])
  // Tasks and projects of every workspace: picking one elsewhere switches the device (workspaces).
  const everyTask = useTasksOfEveryWorkspace() ?? tasks
  const everyProject = useProjectsOfEveryWorkspace()
  const elsewhere = useMemo(() => {
    if (workspaceState.list.length <= 1) return undefined
    const p = new Partition(workspaceState.defaultId, workspaceState.list.map((w) => w.id), everyProject, everyTask)
    const here = p.own(workspaceState.current)
    const names = new Map(workspaceState.list.map((w) => [w.id, workspaceLabel(w.name, w.default)]))
    return (kind: 'task' | 'project', row: { id: string }) => {
      const ws = kind === 'task' ? p.taskRow(row as Task) : p.project(row.id)
      return ws === here ? undefined : names.get(ws)
    }
  }, [workspaceState, everyProject, everyTask])
  const source = useMemo(() => [...commandEntries(ctx), ...buildEntries({ tasks: everyTask, projects: everyProject.length ? everyProject : projects, labels, views, user, today, elsewhere })],
    [ctx, everyTask, everyProject, projects, labels, views, user, today, elsewhere])
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
  const wsFilter = useWorkspaceFilter()
  const prefix = useMemo(() => filterEntries(query, tasks, { today, labels, projects, fields: fieldDefs, ...wsFilter }, taskEntry), [query, tasks, today, labels, projects, fieldDefs, wsFilter, taskEntry])

  const trailing = useMemo(() => trailingEntries(ctx), [ctx])
  // Search's last entry: the text as a new task, never first, so Enter never adds by surprise.
  const addLine = async (line: string) => { await addFromBar(await lineToInput(line, projects, labels), route, user?.id) }
  const addEntry = useMemo<Entry | null>(() => (query.trim() ? {
    kind: 'command', key: 'bar:add-task', label: t('Add “{text}” as a task', { text: query.trim() }), icon: 'plus', shortcut: 'Ctrl+Enter', group: t('Add'),
    run: () => addLine(query.trim()),
  } : null), [query]) // eslint-disable-line react-hooks/exhaustive-deps -- addLine reads the current projects, labels and route
  const commandsOnly = useMemo(() => commandEntries(ctx), [ctx])
  const runEntry = (e: Pick<Entry, 'run'>) => {
    // The box closes first, so the action's own focus (quick add, a prompt) wins.
    keepOpen.current = true
    setMode('closing')
    setTimeout(() => {
      void Promise.resolve(e.run()).then((r) => (isStep(r) ? setMode(r) : onClose()), () => onClose())
    }, 0)
  }
  const commandsMode = bar === 'commands'
  const keepOpen = useRef(false)
  const state = useCombobox<Entry>({
    source: commandsMode ? commandsOnly : source, emptySource: commandsMode ? commandsOnly : emptySource, prefix: commandsMode ? [] : prefix,
    suffix: commandsMode ? [] : addEntry ? [...trailing, addEntry] : trailing, limit: PALETTE_LIMIT, rankContext: 'palette',
    getKey: (e) => e.key, getLabel: (e) => e.label, getSecondary: (e) => secondaryOf(e, false), getKeywords: (e) => e.keywords, getGroup: groupOf,
    onPick: (e) => runEntry(e),
    onClose: () => { if (keepOpen.current) keepOpen.current = false; else onClose() },
  })
  useResetOnChange([state.query], () => setTyped(state.query))
  // The prefixes switch mode as the first character of an empty field (modes.ts).
  const field = { ...state, setQuery: (next: SetStateAction<string>) => {
    const v = typeof next === 'function' ? next(state.query) : next
    const sw = prefixSwitch(bar, state.query, v, askAvailable)
    if (sw) { setBar(sw.mode); state.setQuery(sw.text) } else state.setQuery(v)
  } }
  const toMode = (m: BarMode) => { setBar(m); if (m === 'search' || m === 'commands') state.setQuery('') }
  // In Add and Ask the field is their own: the same prefix in it while empty returns to Search with the character.
  const onKeyDownCapture = (e: KeyboardEvent) => {
    const target = e.target as HTMLInputElement
    if (bar === 'search' && e.key === 'Enter' && (e.ctrlKey || e.metaKey) && state.query.trim()) {
      e.preventDefault()
      e.stopPropagation()
      const line = state.query.trim()
      runEntry({ run: () => addLine(line) })
      return
    }
    if ((bar === 'add' || bar === 'ask') && target.tagName === 'INPUT' && target.value === '' && e.key === PREFIX_OF[bar]) {
      e.preventDefault()
      setBar('search')
      state.setQuery(e.key)
    }
  }

  if (mode === 'closing') return null
  if (mode !== 'search') {
    if (mode.kind === 'confirm') return <Confirmation spec={mode.confirm} onClose={onClose} />
    if (mode.kind === 'prompt') {
      return <NamePrompt title={mode.title} label={mode.label} initial={mode.initial} onCancel={onClose}
        onSubmit={async (v) => { await mode.onSubmit(v); onClose() }} />
    }
    const picker = mode.picker
    return (
      <Dialog title={picker.title} onClose={onClose} size="md" motion="fade">
        <ComboboxPanel {...picker} label={picker.title}
          onPick={async (item: unknown) => { const c = await picker.onPick(item); if (c) setMode({ kind: 'confirm', confirm: c }); else onClose() }}
          onClose={onClose} />
      </Dialog>
    )
  }
  // Escape from Add closes when the bar was opened in Add (`q`, New task), else returns to Search.
  const closesFromAdd = initialMode === 'add'
  const escape = () => (bar === 'search' || (bar === 'add' && closesFromAdd) ? onClose() : toMode('search'))
  // The selected task, named at the field's end: what the task commands act on.
  const context = task ? (
    <span className="inline-flex max-w-[14rem] shrink-0 items-center gap-1 truncate rounded-full border border-default px-2 py-0.5 text-meta text-muted" data-palette-context>
      <Icon name="check" size="xs" className="shrink-0" /><span className="truncate">{task.title || t('Untitled')}</span>
    </span>
  ) : undefined
  return (
    <Dialog title={t('Search and commands')} label={t('Search and commands')} onClose={onClose} testId="command-palette" motion="fade" placement="palette"
      onEscape={escape}>
      <div data-combobox data-palette data-bar-mode-current={bar} onKeyDownCapture={onKeyDownCapture}>
        <ModeSwitch modes={modes} mode={bar} onMode={toMode} />
        {bar === 'add' && <AddPanel initial={initialText} onAdd={(input) => addFromBar(input, route, user?.id)} onAddMany={(inputs) => addManyFromBar(inputs, route, user?.id)}
          onAddAndOpen={async (input) => { await addFromBar(input, route, user?.id, true); onClose() }}
          escape={{ label: closesFromAdd ? t('Close') : t('Back'), run: escape }} />}
        {bar === 'ask' && <AskPanel onSent={onClose} />}
        {(bar === 'search' || bar === 'commands') && <>
          <ComboboxField state={field} look="palette" trailing={context} label={bar === 'commands' ? t('Run a command') : t('Search tasks, projects and commands')}
            placeholder={bar === 'commands' ? t('Type a command…') : t('Search or type a command…')} expanded autoFocus />
          <ComboboxList state={state} look="palette" label={t('Results')} emptyText={t('Nothing matches. Try fewer letters, or a filter query.')}
            renderLeading={(e) => <Icon name={e.icon ?? KIND_ICON[e.kind]} className="text-faint" />}
            renderTrailing={(e) => (e.shortcut ? <ShortcutKeys keys={e.shortcut} /> : null)} />
          <BarFooter ask={askAvailable} />
        </>}
      </div>
    </Dialog>
  )
}
