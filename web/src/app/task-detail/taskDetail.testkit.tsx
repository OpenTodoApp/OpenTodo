// Shared setup for the task panel tests: a fresh database, a fixed clock and
// helpers that read the panel the way the chips render it (OpenSpec change
// ux-overhaul, web-app "Task panel layout").
import { afterEach, beforeEach, expect, vi } from 'vitest'
import { db, useDatabase } from '../../lib/db'
import { setDateTime } from '../../lib/dates'
import { resetDeviceId } from '../../lib/ops'
import { setCurrentUserId } from '../../lib/sharing'
import type { Label, Membership, Project } from '../../lib/types'
import { click, flush, render } from '../../ui/test-utils'
import { TaskDetail } from './TaskDetail'

export const ME = 'u-me'
let n = 0

/** Registers the hooks every panel test needs: call once at the top of the file. */
export function setupTaskDetailTests() {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 14, 12, 0))
    useDatabase(`taskdetail-${Date.now()}-${n++}`)
    resetDeviceId()
    setCurrentUserId(ME)
    setDateTime({ date_format: 'day-month', time_format: '24h', week_start: 'mon' }, { order: 'MD', hour12: true, weekStart: 1 })
  })
  afterEach(() => {
    vi.useRealTimers()
    setDateTime({ date_format: 'system', time_format: 'system', week_start: 'system' })
    document.body.innerHTML = ''
  })
}

export const settle = () => flush(40)
/** Live queries resolve in steps (task → project → sections); wait for the condition. */
export async function waitFor(ok: () => boolean, ms = 2000) {
  for (let item = 0; item < ms && !ok(); item += 20) await flush(20)
  expect(ok()).toBe(true)
}

export async function open(taskId: string, opts: { readOnly?: boolean; onClose?: () => void; onOpen?: (id: string) => void } = {}) {
  const projects = (await db.projects.toArray()) as Project[]
  const labels = new Map(((await db.labels.toArray()) as Label[]).map((l) => [l.id, l]))
  const r = await render(<TaskDetail taskId={taskId} userId={ME} projects={projects} labelMap={labels} onClose={opts.onClose ?? (() => {})} onOpen={opts.onOpen} readOnly={opts.readOnly} />)
  await settle()
  /** The property's element (null while the chip is not shown). */
  const row = (name: string) => r.container.querySelector(`[data-property="${name}"]`) as HTMLElement
  const valueButton = (name: string) => row(name).querySelector('button[aria-labelledby]') as HTMLButtonElement
  const options = (name: string) => [...row(name).querySelectorAll('[role="option"]')].map((o) => o.textContent ?? '')
  const pick = async (name: string, text: string) => {
    await click([...row(name).querySelectorAll('[role="option"]')].find((o) => o.textContent?.includes(text))!)
    await settle()
  }
  const addButton = () => r.container.querySelector('button[aria-label="Add a property"]') as HTMLButtonElement
  const addItems = async () => {
    await click(addButton())
    await settle()
    return [...document.querySelectorAll<HTMLElement>('[role="menu"] [role="menuitem"]')]
  }
  /** Picks `label` from the Add menu: the chip appears with its editor open. */
  const add = async (label: string) => {
    const item = (await addItems()).find((i) => i.textContent?.includes(label))
    expect(item, `Add menu offers ${label}`).toBeTruthy()
    await click(item!)
    await settle()
  }
  return { ...r, row, valueButton, options, pick, addButton, addItems, add }
}

export async function membership(projectId: string, ...members: string[]) {
  const m: Membership = { projectId, role: 'admin', ownerId: members[0], members: members.map((userId) => ({ userId, name: userId === ME ? 'Me' : userId, email: `${userId}@example.com`, role: 'editor' })) }
  await db.memberships.put(m)
}
