// @vitest-environment happy-dom
// migration-everywhere D3: a Notion export's preview offers one select per
// role; changing one asks for a new preview with that column.
import { act } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, waitFor } from '../ui/test-utils'
import { DEFAULT_OPTIONS, ImportView, type ImportViewProps } from './ImportScreen'
import type { ImportPreview } from '../lib/types'

const noop = () => {}
const preview: ImportPreview = {
  format: 'notion-csv', options: {}, truncated: false, notes: ['columns not imported: Assignee'],
  totals: { rows: 2, create: 2, update: 0, skip: 0, error: 0, possibleDuplicates: 0, warnings: 0, newProjects: 1, newLabels: 0, entities: 3, written: 0, ops: 0 },
  rows: [{ row: 2, kind: 'task', title: 'Plan the garden', outcome: 'create' }],
  columns: { recognised: ['Status', 'Due'], ignored: ['Assignee'], available: ['Assignee', 'Do date', 'Due', 'Status'],
    roles: { status: 'Status', due: 'Due', labels: null, priority: null, project: null, notes: null } },
}

function props(p: Partial<ImportViewProps>): ImportViewProps {
  return {
    offline: false, fileName: 'Export.zip', format: '', options: { ...DEFAULT_OPTIONS, targetProject: '' },
    projects: [], workspaces: [], workspace: '', onWorkspace: noop, zones: [], preview, busy: false, error: null,
    job: null, jobs: [], onPickFile: noop, onFormat: noop, onOption: noop, onPreview: noop, switchFrom: null, onSwitchFrom: noop, encrypted: false, onColumn: noop, onStart: noop, onUndo: noop,
    ...p,
  }
}

const roleSelect = (label: string) =>
  [...document.querySelectorAll('[data-notion-columns] label')].find((l) => l.querySelector('span')?.textContent === label)!.querySelector('select')!

async function choose(select: HTMLSelectElement, value: string) {
  await act(async () => {
    select.value = value
    select.dispatchEvent(new Event('change', { bubbles: true }))
  })
}

describe('Notion column mapping', () => {
  it('shows the guessed column of each role and reports a change', async () => {
    const onColumn = vi.fn()
    const { unmount } = await render(<ImportView {...props({ onColumn })} />)
    await waitFor(() => !!document.querySelector('[data-notion-columns]'), 'the role selects')
    expect(roleSelect('Due date').value).toBe('Due')
    expect(roleSelect('Labels').value).toBe('')
    expect([...roleSelect('Due date').options].map((o) => o.textContent)).toEqual(['Not imported', 'Assignee', 'Do date', 'Due', 'Status'])
    await choose(roleSelect('Due date'), 'Do date')
    expect(onColumn).toHaveBeenLastCalledWith('due', 'Do date')
    await choose(roleSelect('Done or status'), '')
    expect(onColumn).toHaveBeenLastCalledWith('status', null)
    await unmount()
  })

  it('has no role selects for other formats', async () => {
    const { unmount } = await render(<ImportView {...props({ preview: { ...preview, format: 'csv', columns: { recognised: ['title'], ignored: [] } } })} />)
    expect(document.querySelector('[data-notion-columns]')).toBeNull()
    await unmount()
  })
})
