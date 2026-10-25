// The palette's search index (design D2): local rows folded into entries while the
// box is open. Tasks are matched by title and notes text (`description`, the plain
// projection of the notes), projects by name and path, plus labels, saved views and
// dashboards and the Settings sections the user can see.
import { describeDue } from '../../lib/dates'
import { UNDECRYPTABLE } from '../../lib/e2ee'
import { originOf } from '../../lib/taskOrigin'
import type { Label, Project, Task, User, View } from '../../lib/types'
import { navigate } from '../router'
import { SETTINGS_SECTIONS, visibleSections } from '../settingsSections'
import { openSetting, visibleEntries } from '../settingsIndex'
import { openTaskInList } from '../signals'
import type { Entry } from './entries'
import { t } from '../../lib/i18n'

export interface IndexSource {
  tasks: readonly Task[]
  projects: readonly Project[]
  labels: readonly Label[]
  views: readonly View[]
  user: User | null
  today?: string
  /** The name of another workspace an entry belongs to, shown as its marker (workspaces "Palette crosses workspaces"); undefined for the current one. */
  elsewhere?: (kind: 'task' | 'project', row: Task | Project) => string | undefined
}

function projectPath(p: Project, byId: Map<string, Project>): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (let q = p.parent_id ? byId.get(p.parent_id) : undefined; q && !seen.has(q.id) && out.length < 4; q = q.parent_id ? byId.get(q.parent_id) : undefined) {
    seen.add(q.id)
    out.unshift(q.name)
  }
  return out
}

/** A task's entry: title and notes text, project, due date and origin id and title (task-origin D10) as secondary text. */
export function makeTaskEntry(projects: readonly Project[], today?: string, elsewhere?: IndexSource['elsewhere']): (task: Task) => Entry {
  const byId = new Map(projects.map((p) => [p.id, p]))
  return (tk) => {
    const ws = elsewhere?.('task', tk)
    const undecryptable = !!tk._e2ee?.raw?.title
    const project = tk.project_id ? byId.get(tk.project_id)?.name ?? t('Project') : t('Inbox')
    const due = describeDue(tk.due, today)?.label
    const origin = originOf(tk)
    return {
      kind: 'task', key: `task:${tk.id}`,
      // Undecryptable rows are indexed by what the app shows, never by ciphertext.
      label: undecryptable ? t(UNDECRYPTABLE) : tk.title || t('Untitled'),
      secondary: [project, due, origin?.id, origin?.title, undecryptable ? '' : tk.description.replace(/\s+/g, ' ').slice(0, 2000)].filter(Boolean).join(' · '),
      marker: [ws, tk.completed_at ? 'completed' : undefined].filter(Boolean).join(' · ') || undefined,
      run: () => openTaskInList(tk),
    }
  }
}

/** Entries in kind order (tasks, projects, labels, views, settings); open before completed, live before archived. */
export function buildEntries(src: IndexSource): Entry[] {
  const byId = new Map(src.projects.map((p) => [p.id, p]))
  const live = (task: Task) => !task.deleted_at
  const taskEntry = makeTaskEntry(src.projects, src.today, src.elsewhere)
  const tasks = src.tasks.filter(live)
  const projectEntry = (p: Project): Entry => {
    const path = projectPath(p, byId)
    return {
      kind: 'project', key: `project:${p.id}`, label: p.name, secondary: path.length ? path.join(' › ') : undefined,
      marker: [src.elsewhere?.('project', p), p.archived ? 'archived' : undefined].filter(Boolean).join(' · ') || undefined, run: () => navigate({ view: 'project', id: p.id }),
    }
  }
  const projects = src.projects.filter((p) => !p.deleted_at)
  return [
    ...tasks.filter((tk) => !tk.completed_at).map(taskEntry),
    ...tasks.filter((item) => item.completed_at).map(taskEntry),
    ...projects.filter((p) => !p.archived).map(projectEntry),
    ...projects.filter((p) => p.archived).map(projectEntry),
    ...src.labels.filter((l) => !l.deleted_at).map((l): Entry => ({ kind: 'label', key: `label:${l.id}`, label: `@${l.name}`, run: () => navigate({ view: 'label', id: l.id }) })),
    ...src.views.filter((v) => !v.deleted_at).map((v): Entry => ({
      kind: 'view', key: `view:${v.id}`, label: v.name, secondary: v.kind === 'dashboard' ? t('Dashboard') : t('Saved view'), run: () => navigate({ view: 'view', id: v.id }),
    })),
    ...(src.user ? visibleSections(src.user) : []).map((s): Entry => ({
      kind: 'settings', key: `settings:${s.id}`, label: t('Settings: {section}', { section: s.label }), secondary: s.description(src.user!), icon: s.icon,
      run: () => navigate({ view: 'settings', section: s.id }),
    })),
    // Individual settings (settings-navigation "Settings search"): the same index as the settings list's search.
    ...(src.user ? visibleEntries(src.user) : []).map((e): Entry => {
      const section = SETTINGS_SECTIONS.find((s) => s.id === e.section)!
      return {
        kind: 'settings', key: `setting:${e.section}:${e.anchor}:${e.label}`, label: `${section.label} › ${e.label}`, secondary: e.description, icon: section.icon, keywords: e.keywords,
        run: () => openSetting(src.user!, e),
      }
    }),
  ]
}
