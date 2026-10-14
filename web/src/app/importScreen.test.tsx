// Component test without a DOM: the pure ImportView renders every state to
// static markup, which is enough to assert what the user sees.
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { DEFAULT_OPTIONS, ImportView, type ImportViewProps } from './ImportScreen'
import { parseRoute, routePath } from './router'
import type { ImportJob, ImportPreview, ImportTotals, Project } from '../lib/types'

const noop = () => {}
const project = (id: string, name: string, parent_id: string | null = null): Project =>
  ({ id, name, color: '#16a34a', position: 1, archived: false, parent_id, created_at: 0, deleted_at: null, _clock: {} })
const work = project('p1', 'Work')
const client = project('p2', 'Acme', 'p1')
const totals = (t: Partial<ImportTotals> = {}): ImportTotals => ({
  rows: 0, create: 0, update: 0, skip: 0, error: 0, possibleDuplicates: 0, warnings: 0,
  newProjects: 0, newLabels: 0, entities: 0, written: 0, ops: 0, ...t,
})
const job = (j: Partial<ImportJob>): ImportJob => ({
  id: 'j1', format: 'csv', status: 'done', options: {}, totals: totals({ rows: 3, create: 3 }), errors: [],
  createdAt: 1_760_000_000_000, finishedAt: 1_760_000_001_000, undoneAt: null, ...j,
})

function render(p: Partial<ImportViewProps> = {}) {
  const props: ImportViewProps = {
    offline: false, fileName: null, format: '', options: { ...DEFAULT_OPTIONS, targetProject: '' },
    projects: [work, client], zones: ['Europe/Rome'], preview: null, busy: false, error: null,
    job: null, jobs: [], onPickFile: noop, onFormat: noop, onOption: noop, onPreview: noop, onStart: noop, onUndo: noop,
    ...p,
  }
  return renderToStaticMarkup(<ImportView {...props} />)
}

describe('ImportView', () => {
  it('explains the offline state, disables the picker and keeps the last job list', () => {
    const html = render({ offline: true, jobs: [job({ status: 'done' }), job({ id: 'j2', status: 'undone' })] })
    expect(html).toContain('You are offline')
    expect(html).toContain('needs a connection')
    expect(html).toMatch(/<input id="import-file" type="file"[^>]*disabled=""/)
    expect(html).toContain('Past imports')
    expect(html).toContain('3 created')
    expect(html).toContain('undone')
    // Undo needs the server too.
    expect(html).toMatch(/<button class="btn-danger text-xs" disabled="">Undo<\/button>/)
  })

  it('enables the picker online and offers undo for finished jobs only', () => {
    const html = render({ jobs: [job({ status: 'done' }), job({ id: 'j2', status: 'undone' }), job({ id: 'j3', status: 'running' })] })
    expect(html).not.toContain('You are offline')
    expect(html).not.toMatch(/<input id="import-file" type="file"[^>]*disabled/)
    expect(html.match(/>Undo<\/button>/g)).toHaveLength(1)
  })

  it('renders the preview table with outcomes, reasons and warnings', () => {
    const preview: ImportPreview = {
      format: 'csv', options: {}, truncated: false,
      columns: { recognised: ['title', 'priority'], ignored: ['color'] },
      totals: totals({ rows: 3, create: 1, skip: 1, error: 1, possibleDuplicates: 1 }),
      rows: [
        { row: 2, kind: 'task', title: 'Write report', project: 'Work', outcome: 'create', warnings: ['recurrence "every 3 hours" not supported; imported without a rule'] },
        { row: 3, kind: 'task', title: 'Call mom', outcome: 'skip', reason: 'possible_duplicate' },
        { row: 4, kind: 'task', title: 'Bad', outcome: 'error', reason: 'invalid priority "7" (expected 1-4 or p1-p4)' },
      ],
    }
    const html = render({ preview, fileName: 'tasks.csv' })
    expect(html).toContain('3 rows: 1 to create · 1 skipped · 1 with errors · 1 possible duplicates')
    expect(html).toContain('ignored: color')
    expect(html).toContain('possible duplicate')
    expect(html).toContain('every 3 hours&quot; not supported')
    expect(html).toContain('invalid priority &quot;7&quot;')
    expect(html).toContain('Import 1 item<')
  })

  it('shows section, recurrence and reminder counts, notes and the section option', () => {
    const preview: ImportPreview = {
      format: 'opentodo', options: {}, truncated: false, version: 1,
      totals: totals({ rows: 6, create: 6, newSections: 2, recurring: 1, reminders: 3 }),
      rows: [{ kind: 'section', title: 'Doing', outcome: 'create' }],
      notes: ['4 comments are not imported: a comment keeps its author'],
    }
    const html = render({ preview, fileName: 'opentodo-export.json' })
    expect(html).toContain('2 new sections · 1 recurring · 3 reminders')
    expect(html).toContain('4 comments are not imported')
    expect(html).toContain('Keep as sections')
    expect(html).toMatch(/<option value="section" selected="">Keep as sections/)
  })

  it('shows the overwrite choice only for an own export', () => {
    expect(render()).not.toContain('Items that already exist')
    expect(render({ format: 'opentodo' })).toContain('Items that already exist')
  })

  it('shows job progress', () => {
    const html = render({ job: job({ status: 'running', totals: totals({ entities: 10, written: 4 }) }) })
    expect(html).toContain('Importing…')
    expect(html).toContain('writing 4/10')
    expect(html).toContain('<progress')
  })
})

describe('import route', () => {
  it('lives under settings', () => {
    expect(parseRoute('/settings/import')).toEqual({ view: 'import' })
    expect(routePath({ view: 'import' })).toBe('/settings/import')
    expect(parseRoute('/settings')).toEqual({ view: 'settings' })
  })

  it('picks the target project with the smart picker, showing the chosen project and its path (task-detail-redesign 3.5)', () => {
    expect(render()).toContain('aria-label="Tasks without a project go to: Inbox"')
    expect(render({ options: { ...DEFAULT_OPTIONS, targetProject: 'p2' } })).toContain('aria-label="Tasks without a project go to: Work › Acme"')
    expect(render({ offline: true })).toMatch(/<button type="button" class="input[^"]*" disabled=""[^>]*aria-label="Tasks without a project go to: Inbox"/)
  })
})
