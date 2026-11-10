// @vitest-environment happy-dom
// Skills started in context (OpenSpec change assistant-in-context, task 1.2):
// Rewrite this and Find a slot in a task's menu, What's next? in a project's
// menu and Brief me in Today's, each opening the assistant with its skill and
// subject and sending at once; none of them while the assistant is off.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resetAssistantStatus, setAssistantStatus, takeAssistantPrefill, type AssistantStatus } from '../lib/assistantStatus'
import { db, useDatabase } from '../lib/db'
import { createTask, resetDeviceId } from '../lib/ops'
import type { Project } from '../lib/types'
import { click, mockFetch, noPublicLinks, render, waitFor } from '../ui/test-utils'
import { ProjectHeader } from './ProjectHeader'
import { TaskDetail } from './task-detail/TaskDetail'
import { TaskListView } from './TaskListView'

const on: AssistantStatus = {
  available: true, enabled: true, reason: '', provider: 'anthropic', provider_label: 'Anthropic (Claude)', model: 'm', consented: true,
  disclosure_version: 1, fields: [], allow_member_keys: false, own_key_set: false, operator_key_set: true,
}
const off: AssistantStatus = { ...on, available: false, reason: 'disabled' }

let n = 0
beforeEach(() => {
  useDatabase(`assistant-in-context-${Date.now()}-${n++}`)
  resetDeviceId()
  resetAssistantStatus()
  takeAssistantPrefill()
  mockFetch(noPublicLinks)
})
afterEach(() => { takeAssistantPrefill() })

const items = () => [...document.querySelectorAll<HTMLElement>('[role^="menuitem"]')]
const item = (label: string) => items().find((b) => b.textContent?.includes(label))
const project = { id: 'garden', name: 'Garden', color: '#22c55e', position: 1, archived: false, parent_id: null, created_at: 0, deleted_at: null, _clock: {} } as Project

async function taskMenu(status: AssistantStatus) {
  setAssistantStatus(status)
  const id = await createTask({ title: 'fix thing' })
  const r = await render(<TaskDetail taskId={id} projects={[]} labelMap={new Map()} onClose={() => {}} />)
  await waitFor(() => !!document.querySelector('button[aria-label="Task actions"]'), 'the task actions')
  await click(document.querySelector('button[aria-label="Task actions"]')!)
  await waitFor(() => !!item('Copy link'), 'the actions menu')
  return { id, r }
}

describe('from a task', () => {
  it('Rewrite this opens the assistant with the skill and the task, sent at once', async () => {
    const { id, r } = await taskMenu(on)
    expect(item('Find a slot')).toBeDefined()
    await click(item('Rewrite this')!)
    expect(takeAssistantPrefill()).toEqual({ skill: 'rewrite-task', text: 'Rewrite “fix thing”', selected: [id], send: true })
    await r.unmount()
  })

  it('Find a slot sends the find-slot skill on the task', async () => {
    const { id, r } = await taskMenu(on)
    await click(item('Find a slot')!)
    expect(takeAssistantPrefill()).toMatchObject({ skill: 'find-slot', selected: [id], send: true })
    await r.unmount()
  })

  it('offers none of the assistant items while the assistant is off', async () => {
    const { r } = await taskMenu(off)
    for (const label of ['Rewrite this', 'Find a slot', 'Break this down']) expect(item(label)).toBeUndefined()
    await r.unmount()
  })
})

describe('from a project and from Today', () => {
  it('What’s next? runs project-next on the project, only while available', async () => {
    await db.projects.put(project)
    setAssistantStatus(on)
    const r = await render(<ProjectHeader project={project} />)
    await click(r.container.querySelector('button[aria-label="Project menu"]')!)
    await waitFor(() => !!document.querySelector('[data-menu-label="What’s next?"]'), 'What’s next?')
    await click(document.querySelector('[data-menu-label="What’s next?"]')!)
    expect(takeAssistantPrefill()).toEqual({ skill: 'project-next', text: 'What’s next in “Garden”?', send: true })
    await r.unmount()
    document.body.innerHTML = ''

    setAssistantStatus(off)
    const r2 = await render(<ProjectHeader project={project} />)
    await click(r2.container.querySelector('button[aria-label="Project menu"]')!)
    await waitFor(() => !!document.querySelector('[data-menu-label="Display mode"]'), 'the project menu')
    expect(document.querySelector('[data-menu-label="What’s next?"]')).toBeNull()
    await r2.unmount()
  })

  it('Brief me runs brief-today from Today’s menu, only while available', async () => {
    setAssistantStatus(on)
    const r = await render(<TaskListView route={{ view: 'today' }} />)
    await waitFor(() => !!r.container.querySelector('[data-page-header] button[aria-label="More actions"]'), 'the header menu')
    await click(r.container.querySelector('[data-page-header] button[aria-label="More actions"]')!)
    await waitFor(() => !!document.querySelector('[role="menu"] [data-assistant-brief]'), 'Brief me')
    await click(document.querySelector('[role="menu"] [data-assistant-brief]')!)
    expect(takeAssistantPrefill()).toEqual({ skill: 'brief-today', text: 'Brief me', send: true })
    await r.unmount()
    document.body.innerHTML = ''

    setAssistantStatus(off)
    const r2 = await render(<TaskListView route={{ view: 'today' }} />)
    await waitFor(() => !!r2.container.querySelector('[data-page-header] button[aria-label="More actions"]'), 'the header menu')
    await click(r2.container.querySelector('[data-page-header] button[aria-label="More actions"]')!)
    await waitFor(() => !!document.querySelector('[role="menu"] [data-briefing-toggle]'), 'the menu')
    expect(document.querySelector('[role="menu"] [data-assistant-brief]')).toBeNull()
    await r2.unmount()
  })
})
