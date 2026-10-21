// @vitest-environment happy-dom
// Project fields outside the task panel (task-detail-redesign 3.5, entity-pickers):
// the share capture screen picks its project by typing, the sidebar's new-project
// parent offers "Top level" first and no Inbox.
import 'fake-indexeddb/auto'
import { act } from 'react'
import { beforeEach, describe, expect, it } from 'vitest'
import { db, useDatabase } from '../lib/db'
import { createProject, resetDeviceId } from '../lib/ops'
import { parseShare } from '../lib/share'
import type { Project } from '../lib/types'
import { click, key, render, type } from '../ui/test-utils'
import { ProjectPickerField } from './ProjectPickerField'
import { ShareCapture, setPendingShare } from './ShareCapture'

const settle = () => act(async () => { for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 20)) })
const field = () => document.querySelector<HTMLInputElement>('[data-overlay] input[role="combobox"]') ?? document.querySelectorAll<HTMLInputElement>('input[role="combobox"]:not([aria-label="Task title"])')[0]!
const project = (id: string, name: string, parent_id: string | null = null): Project =>
  ({ id, name, color: '#16a34a', position: 1, archived: false, parent_id, created_at: 0, deleted_at: null, _clock: {} })

let n = 0
beforeEach(() => {
  useDatabase(`picker-${Date.now()}-${n++}`)
  resetDeviceId()
  document.body.innerHTML = ''
})

describe('ShareCapture project picker', () => {
  it('picks a project by typing and saves the task there', async () => {
    const reading = await createProject({ name: 'Reading' })
    await createProject({ name: 'Work' })
    setPendingShare(parseShare('?title=Interesting%20article&url=https://example.org/post'))
    const view = await render(<ShareCapture />)
    await settle()
    const button = document.querySelector<HTMLButtonElement>('button[aria-label="Project: No project"]')!
    expect(button).not.toBeNull()
    await click(button)
    await type(field(), 'read')
    await key(field(), 'Enter')
    await settle()
    expect(document.querySelector('button[aria-label="Project: Reading"]')).not.toBeNull()
    await act(async () => { (document.getElementById('share-capture') as HTMLFormElement).requestSubmit() })
    await settle()
    const tasks = await db.tasks.toArray()
    expect(tasks.map((t) => [t.title, t.project_id])).toEqual([['Interesting article', reading]])
    await view.unmount()
  })
})

describe('ProjectPickerField', () => {
  it('as the new-project parent: Top level first, no Inbox, archived projects left out, paths shown', async () => {
    let value: string | null = 'p1'
    const projects = [project('p1', 'Work'), project('p2', 'Acme', 'p1'), { ...project('p3', 'Old'), archived: true }]
    const view = await render(<ProjectPickerField label="Parent project" projects={projects} value={value} onChange={(id) => { value = id }}
      rankContext="project.parent" inbox={false} noneLabel="Top level" />)
    await click(document.querySelector('button[aria-label="Parent project: Work"]')!)
    const options = [...document.querySelectorAll('[role="option"]')].map((o) => o.textContent?.trim())
    expect(options[0]).toContain('Top level')
    expect(options.join('|')).not.toContain('Inbox')
    expect(options.join('|')).not.toContain('No project')
    expect(options.join('|')).not.toContain('Old')
    await type(field(), 'acme')
    expect(document.querySelector('[role="option"]')?.textContent).toContain('Work')
    await key(field(), 'Enter')
    expect(value).toBe('p2')
    await view.unmount()
  })
})
