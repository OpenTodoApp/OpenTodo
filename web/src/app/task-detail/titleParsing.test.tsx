// @vitest-environment happy-dom
// Parsing while editing the panel's title (OpenSpec change smart-title-tokens,
// natural-language-capture "Parsing while editing a title"): what the edit typed is
// applied as one undoable change; the old title is never re-read.
import 'fake-indexeddb/auto'
import { act } from 'react'
import { describe, expect, it } from 'vitest'
import { db } from '../../lib/db'
import { createLabel } from '../../lib/labels'
import { createProject, createTask } from '../../lib/ops'
import { flush } from '../../ui/test-utils'
import { open, setupTaskDetailTests, waitFor } from './taskDetail.testkit'

setupTaskDetailTests()

/** Types into the title's textarea as a person would. */
async function typeTitle(field: HTMLTextAreaElement, text: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(field, text)
    field.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

async function retitle(field: HTMLTextAreaElement, text: string) {
  await act(async () => { field.focus() })
  await typeTitle(field, text)
  await act(async () => { field.setSelectionRange(text.length, text.length) })
  await flush()
  await act(async () => { field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })) })
  await flush(40)
}

describe('the panel title parses what is typed into it', () => {
  it('" tomorrow p1" sets the date and priority, keeps the title, and Undo takes it all back', async () => {
    const id = await createTask({ title: 'Call the bank' })
    const v = await open(id)
    const field = v.container.querySelector<HTMLTextAreaElement>('[data-task-title]')!
    await retitle(field, 'Call the bank tomorrow p1')
    await waitFor(async () => (await db.tasks.get(id))!.priority === 1, 'the priority written')
    const task = (await db.tasks.get(id))!
    expect(task).toMatchObject({ title: 'Call the bank', due: { date: '2026-10-15' }, priority: 1 })
    expect(field.value).toBe('Call the bank')
    // One undo entry holds the whole change: undoing it brings the task back.
    const { bulkToast } = await import('../bulk/toastStore')
    const toast = bulkToast()
    expect(toast?.undoId).toBeTruthy()
    const { undoBatch } = await import('../../lib/undo')
    await act(async () => { await undoBatch(toast!.undoId!) })
    await waitFor(async () => (await db.tasks.get(id))!.priority === 4, 'the change undone')
    expect((await db.tasks.get(id))!.due).toBeNull()
    await v.unmount()
  })

  it('labels are added to the existing ones, and a #project moves the task', async () => {
    const work = await createProject({ name: 'Work' })
    const errand = await createLabel({ name: 'errand' })
    await createLabel({ name: 'deep-work' })
    const id = await createTask({ title: 'Plan', labels: [errand] })
    const v = await open(id)
    const field = v.container.querySelector<HTMLTextAreaElement>('[data-task-title]')!
    // The list opens on @deep-work: the first Enter picks it, the second commits.
    await act(async () => { field.focus() })
    await typeTitle(field, 'Plan @deep')
    await act(async () => { field.setSelectionRange(10, 10) })
    await flush()
    await act(async () => { field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })) })
    await flush(30)
    await act(async () => { field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })) })
    await waitFor(async () => (await db.tasks.get(id))!.labels.length === 2, 'the label added')
    await v.unmount()
    const w = await open(id)
    const f2 = w.container.querySelector<HTMLTextAreaElement>('[data-task-title]')!
    // The list opens on #Work: the first Enter picks it, then Enter commits.
    await act(async () => { f2.focus() })
    await typeTitle(f2, 'Plan #Work')
    await act(async () => { f2.setSelectionRange(10, 10) })
    await flush()
    await act(async () => { f2.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })) })
    await flush(30)
    await act(async () => { f2.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })) })
    await waitFor(async () => (await db.tasks.get(id))!.project_id === work, 'the task moved')
    expect((await db.tasks.get(id))!.title).toBe('Plan')
    await w.unmount()
  })

  it('never re-reads the old title', async () => {
    const id = await createTask({ title: 'Review may report' })
    const v = await open(id)
    const field = v.container.querySelector<HTMLTextAreaElement>('[data-task-title]')!
    await retitle(field, 'Review may report draft')
    await waitFor(async () => (await db.tasks.get(id))!.title === 'Review may report draft', 'the rename')
    expect((await db.tasks.get(id))!.due).toBeNull()
    await v.unmount()
  })
})
