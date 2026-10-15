// Project note history (OpenSpec change project-notes, task 4.4): a note change
// reads as "notes" in project history and activity, and restoring an earlier
// description is written as an op that the device folds into the document.
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { groupRuns, summarizeRun } from './activityRuns'
import { db } from './db'
import { canRestoreField, fieldLabel, restoreValue } from './history'
import { createProject, foldNote, resetDeviceId, updateProject } from './ops'
import { decodeDoc, activeBody, renderMarkdown, toModel } from './richtext'
import type { ActivityEvent } from './types'

beforeEach(async () => {
  await db.delete()
  await db.open()
  resetDeviceId()
})

describe('project note history', () => {
  it('labels note changes as notes', () => {
    expect(fieldLabel('description')).toBe('notes')
    expect(fieldLabel('notes_doc')).toBe('notes')
    const ev: ActivityEvent = { id: 'e1', kind: 'edited', actor: 'u1', entity: 'project', entityId: 'p1', ts: 1, opIds: ['o1'], changes: [{ field: 'description', from: 'a', to: 'b' }] }
    expect(summarizeRun(groupRuns([ev])[0], 'Sam')).toMatch(/notes/)
  })

  it('restores an earlier description and folds it into the document', async () => {
    const p = await createProject({ name: 'Trip' })
    await updateProject(p, { description: 'First version' })
    await foldNote('project', p)
    await updateProject(p, { description: 'Second version' })
    await foldNote('project', p)
    expect(canRestoreField('project', 'description')).toBe(true)
    await restoreValue('project', p, 'description', 'First version')
    await foldNote('project', p)
    const row = (await db.projects.get(p))!
    expect(row.description).toBe('First version')
    const doc = decodeDoc(row.notes_doc ?? '')!
    expect(renderMarkdown(toModel(activeBody(doc))).trim()).toBe('First version')
  })
})
