// Adding a task from the command bar (OpenSpec change moments-and-onboarding, design
// D7; command-palette "Add mode", "Add as a task from Search"): the defaults of the
// screen the bar was opened from (a list view's own: today's date in Today, the
// project in a project; the Inbox's elsewhere), the same local-first createTask as the
// list's line, and one "Added to …" toast with Open.
import { currentDateTime, logicalToday } from '../../lib/dates'
import { loadQuickAddSettings, parse, resolveDayMonthOrder, resolveLanguages, toTaskInput, type LabelRef, type ProjectRef } from '../../lib/nlp'
import { getProject, getTask } from '../../lib/localData'
import { preferredLanguages, t } from '../../lib/i18n'
import { createTaskThenSuggest } from '../../lib/assistantSuggest'
import { VIEW_SCOPES } from '../../lib/shortcuts'
import { addedWhere } from '../addedWhere'
import { ACTION_TOAST_MS, showBulkToast } from '../bulk/toastStore'
import { taskDefaults } from '../listActions'
import { createLabelByName, nowHHMM, type QuickAddInput } from '../QuickAdd'
import { navigate, routePath, type Route } from '../router'
import { selectTask } from '../signals'
import { openTaskPage } from '../taskTrail'

/** The route whose defaults a task added from the bar takes: a list screen's own, else the Inbox's. */
export function defaultsRoute(route: Route): Route {
  return VIEW_SCOPES[route.view]?.includes('list') && route.view !== 'completed' ? route : { view: 'inbox' }
}

/**
 * Creates the task and shows where it went; returns its id. With `open` (Shift+Enter in
 * Add mode, palette-quick-add D3) it opens the task where it went instead of the toast.
 */
export async function addFromBar({ labels: typed, ...rest }: QuickAddInput, route: Route, userId?: string, open = false): Promise<string> {
  const today = logicalToday()
  const { labels: viewLabels, ...defaults } = taskDefaults(defaultsRoute(route), today, userId)
  if (rest.due || rest.deadline) delete defaults.start
  const id = await createTaskThenSuggest({ ...defaults, ...rest, labels: [...new Set([...viewLabels, ...(typed ?? [])])] })
  const task = await getTask(id)
  const project = task?.project_id ? await getProject(task.project_id) : undefined
  const where = task ? addedWhere(task, today, currentDateTime()) : null
  const label = where?.label ?? (project ? t('Added to {project}', { project: project.name }) : t('Added to Inbox'))
  const target: Route = where ? { view: where.view } : project ? { view: 'project', id: project.id } : { view: 'inbox' }
  const show = () => { selectTask.set(id); navigate(target) }
  if (open) openAt(id, target)
  else showBulkToast(label, null, { ttl: ACTION_TOAST_MS, action: { label: t('Open'), run: show } })
  return id
}

/** Opens the new task as its page; Esc goes to the list it went to (task-full-page). */
function openAt(id: string, target: Route) {
  openTaskPage(id, { from: routePath(target) })
}

/** One line read like the quick add reads it (Search's "Add as a task"); the plain line when parsing is off or leaves no title. */
export async function lineToInput(line: string, projects: readonly ProjectRef[], labels: readonly LabelRef[]): Promise<QuickAddInput> {
  const settings = loadQuickAddSettings()
  if (!settings.enabled) return { title: line }
  const langs = preferredLanguages()
  const parsed = parse(line, {
    today: logicalToday(), now: nowHHMM(), languages: resolveLanguages(settings, langs), dayMonthOrder: resolveDayMonthOrder(settings, langs, null),
    weekStart: currentDateTime().weekStart, projects, dismissed: [],
  })
  return parsed.title ? toTaskInput(parsed, { labels, createLabel: createLabelByName }) : { title: line }
}
