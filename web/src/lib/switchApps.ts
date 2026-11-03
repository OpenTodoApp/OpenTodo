// The apps the Import screen's "Switching from…" picker lists (OpenSpec change
// migration-everywhere, design D5): the competitors of the migration matrix in
// docs/switch/README.md, each with its import format and its switch guide
// (docs/switch/<guide>.md, whose "Export from …" section holds the steps).
// scripts/repo-checks.test.mjs keeps this list, the matrix and the guides equal.
import type { IconName } from '../ui'
import type { ImportFormat } from './types'

export interface SwitchApp {
  /** The guide's file name in docs/switch/, also its Help slug "switch/<guide>". */
  guide: string
  name: string
  format: ImportFormat
  /** A generic icon of the kind of app (no brand logos). */
  icon: IconName
}

export const SWITCH_APPS: readonly SwitchApp[] = [
  { guide: 'todoist', name: 'Todoist', format: 'todoist-backup', icon: 'list-checks' },
  { guide: 'ticktick', name: 'TickTick', format: 'ticktick-csv', icon: 'list-checks' },
  { guide: 'things', name: 'Things 3', format: 'things-db', icon: 'layers' },
  { guide: 'omnifocus', name: 'OmniFocus', format: 'omnifocus-csv', icon: 'list-checks' },
  { guide: 'anydo', name: 'Any.do', format: 'anydo-json', icon: 'list-checks' },
  { guide: 'microsoft-todo', name: 'Microsoft To Do', format: 'microsoft-todo-json', icon: 'list-checks' },
  { guide: 'google-tasks', name: 'Google Tasks', format: 'google-tasks-json', icon: 'list-checks' },
  { guide: 'apple-reminders', name: 'Apple Reminders', format: 'apple-reminders-json', icon: 'list-checks' },
  { guide: 'vikunja', name: 'Vikunja', format: 'vikunja-export', icon: 'kanban' },
  { guide: 'trello', name: 'Trello', format: 'trello-json', icon: 'kanban' },
  { guide: 'asana', name: 'Asana', format: 'asana-csv', icon: 'kanban' },
  { guide: 'notion', name: 'Notion', format: 'notion-csv', icon: 'notebook-pen' },
  { guide: 'super-productivity', name: 'Super Productivity', format: 'super-productivity-json', icon: 'timer' },
  { guide: 'tududi', name: 'Tududi', format: 'tududi-db', icon: 'layers' },
  { guide: 'linear', name: 'Linear', format: 'linear-csv', icon: 'kanban' },
]

/**
 * The "Export from …" section of a guide's HTML (the bundled Help): from its
 * h2 to the next h2, without the heading and its anchor link. '' when absent.
 */
export function exportSteps(html: string): string {
  const start = html.search(/<h2 id="export-from-[^"]*"/)
  if (start < 0) return ''
  const bodyStart = html.indexOf('</h2>', start)
  if (bodyStart < 0) return ''
  const rest = html.slice(bodyStart + 5)
  const end = rest.search(/<h2[\s>]/)
  return (end < 0 ? rest : rest.slice(0, end)).trim()
}

/** The steps of an app's guide, from the lazily loaded Help bundle. */
export async function loadExportSteps(app: SwitchApp): Promise<string> {
  const { loadHelp } = await import('./help')
  const { bundle } = await loadHelp()
  const page = bundle.pages.find((p) => p.slug === `switch/${app.guide}`)
  return page ? exportSteps(page.html) : ''
}
