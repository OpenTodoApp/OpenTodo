// @vitest-environment happy-dom
// Imported boards open as boards on the importing device (OpenSpec change
// named-importers, design D8).
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from './db'
import { applyImportViewHints, loadViewMode } from './sections'

beforeEach(async () => {
  await db.delete()
  await db.open()
})

describe('applyImportViewHints', () => {
  it('opens hinted projects as boards and leaves others alone', async () => {
    await applyImportViewHints([{ projectId: 'p-board', view: 'board' }])
    expect(await loadViewMode('p-board')).toBe('board')
    expect(await loadViewMode('p-other')).toBe('list')
  })

  it('accepts a job without hints', async () => {
    await applyImportViewHints(undefined)
    expect(await loadViewMode('p-board')).toBe('list')
  })
})
