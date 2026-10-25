import type { Meta, StoryObj } from '@storybook/react-vite'
import type { ImportJob, ImportPreview, ImportTotals } from '../lib/types'
import { DEFAULT_OPTIONS, ImportView, type ImportViewProps } from './ImportScreen'
import { HEX, project, withClock } from './stories/fixtures'

// Rare screen (OpenSpec change screen-stories-rare, design D2): Import
// (`/import`), before a file is chosen and with a Todoist file previewed.
const meta: Meta = { title: 'Screens/Import', decorators: [withClock] }
export default meta

const noop = () => {}
const at = Date.parse('2026-10-12T09:30:00')
const totals = (over: Partial<ImportTotals> = {}): ImportTotals => ({
  rows: 0, create: 0, update: 0, skip: 0, error: 0, possibleDuplicates: 0, warnings: 0, newProjects: 0, newLabels: 0, entities: 0, written: 0, ops: 0, ...over,
})
const job: ImportJob = {
  id: 'j1', format: 'csv', status: 'done', options: {}, totals: totals({ rows: 42, create: 40, skip: 2, newProjects: 1, written: 40 }),
  errors: [], createdAt: at, finishedAt: at + 4_000, undoneAt: null,
}
const base: ImportViewProps = {
  offline: false, fileName: null, format: '', options: { ...DEFAULT_OPTIONS, timeZone: 'Europe/Berlin', targetProject: '' },
  projects: [project({ id: 'p1', name: 'Home', color: HEX.green }), project({ id: 'p2', name: 'Work', color: HEX.blue })],
  workspaces: [], workspace: '', onWorkspace: noop,
  zones: ['UTC', 'Europe/Berlin', 'America/New_York'], preview: null, busy: false, error: null, job: null, jobs: [job],
  onPickFile: noop, onFormat: noop, onOption: noop, onPreview: noop, onStart: noop, onUndo: noop,
}
const preview: ImportPreview = {
  format: 'todoist-csv', options: {}, truncated: false,
  totals: totals({ rows: 6, create: 4, skip: 1, error: 1, possibleDuplicates: 1, newProjects: 1, newLabels: 2, recurring: 1 }),
  rows: [
    { row: 2, kind: 'project', title: 'Garden', outcome: 'create' },
    { row: 3, kind: 'task', title: 'Cut back the roses', project: 'Garden', outcome: 'create' },
    { row: 4, kind: 'task', title: 'Water the plants', project: 'Garden', outcome: 'create', warnings: ['"every 3 days" became a repeat rule'] },
    { row: 5, kind: 'task', title: 'Buy compost', project: 'Garden', outcome: 'create' },
    { row: 6, kind: 'task', title: 'Renew passport', outcome: 'skip', reason: 'A task with this title is already in the Inbox' },
    { row: 7, kind: 'task', title: '', outcome: 'error', reason: 'The row has no title' },
  ],
}

/** Before a file is chosen, with one earlier import that can be undone. */
export const Start: StoryObj = { render: () => <ImportView {...base} /> }

const workspaces = [
  { id: 'w-personal', name: 'Personal', icon: '', color: '', default: true, role: 'owner' as const, ownerId: 'me' },
  { id: 'w-work', name: 'Work', icon: '', color: '', default: false, role: 'owner' as const, ownerId: 'me' },
]

/** Two workspaces: the Todoist file goes into Work, named in the preview (import-workspace). */
export const IntoWorkspace: StoryObj = {
  render: () => <ImportView {...base} workspaces={workspaces} workspace="w-work" fileName="Work [Todoist].csv" format="todoist-csv" preview={preview} />,
}

/** A Todoist CSV previewed: totals, the rows and what happens to each. */
export const Preview: StoryObj = { render: () => <ImportView {...base} fileName="Garden [Todoist].csv" format="todoist-csv" preview={preview} /> }
