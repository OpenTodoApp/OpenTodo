// @vitest-environment happy-dom
// What the web app hands a native shell (OpenSpec change native-shells, "Reminders
// scheduled on the device", "Widgets", and external links in "The bridge is optional").
import { afterEach, describe, expect, it, vi } from 'vitest'
import { installShellLinks, type OpenTodoShell } from './shell'
import { shellReminders, shellWidget } from './shellPublish'
import type { Reminder, Task } from './types'

const NOW = Date.UTC(2026, 9, 22, 12, 0)
const HOUR = 60 * 60 * 1000

const task = (id: string, extra: Partial<Task> = {}): Task => ({ id, title: `Task ${id}`, project_id: null, due: null, priority: 4, completed_at: null, deleted_at: null, ...extra }) as unknown as Task
const reminder = (id: string, taskId: string, fireAt: number | null, extra: Partial<Reminder> = {}): Reminder =>
  ({ id, task_id: taskId, kind: 'absolute', offset_minutes: null, fire_at: fireAt, delivered_at: null, dismissed_at: null, created_at: 0, deleted_at: null, ...extra }) as unknown as Reminder

describe('reminders handed to the shell', () => {
  const tasks = [task('a'), task('b', { completed_at: NOW - HOUR }), task('c')]

  it('the next 7 days, live and not dismissed, earliest first, with titles when allowed', () => {
    const list = shellReminders([
      reminder('r3', 'c', NOW + 3 * HOUR),
      reminder('r1', 'a', NOW + HOUR),
      reminder('past', 'a', NOW - HOUR),
      reminder('far', 'a', NOW + 8 * 24 * HOUR),
      reminder('done', 'b', NOW + HOUR),
      reminder('gone', 'a', NOW + HOUR, { deleted_at: NOW }),
      reminder('dismissed', 'a', NOW + 2 * HOUR, { dismissed_at: NOW + 2 * HOUR }),
    ], tasks, NOW, { titles: true, encrypted: false })
    expect(list).toEqual([
      { id: 'r1', taskId: 'a', fireAt: NOW + HOUR, title: 'Task a' },
      { id: 'r3', taskId: 'c', fireAt: NOW + 3 * HOUR, title: 'Task c' },
    ])
  })

  it('an encrypted account hands over no titles, and the titles option off neither', () => {
    const rs = [reminder('r1', 'a', NOW + HOUR)]
    expect(shellReminders(rs, tasks, NOW, { titles: true, encrypted: true })[0].title).toBeUndefined()
    expect(shellReminders(rs, tasks, NOW, { titles: false, encrypted: false })[0].title).toBeUndefined()
  })

  it('a snoozed reminder that was dismissed before is scheduled again', () => {
    const r = reminder('r1', 'a', NOW + 10 * 60 * 1000, { dismissed_at: NOW - HOUR })
    expect(shellReminders([r], tasks, NOW, { titles: false, encrypted: false })).toHaveLength(1)
  })
})

describe('the widgets\' Today list', () => {
  const today = '2026-10-22'
  const tasks = [
    task('late', { due: { date: '2026-10-20' }, priority: 1 }),
    task('now', { due: { date: today, time: '15:00' } }),
    task('later', { due: { date: '2026-10-25' } }),
    task('done', { due: { date: today }, completed_at: NOW }),
  ]

  it('lists today and overdue open tasks with title, time and priority', () => {
    const w = shellWidget(tasks, today, NOW, false)
    expect(w.count).toBe(2)
    expect(w.overdue).toBe(1)
    expect(w.tasks.map((r) => r.id).sort()).toEqual(['late', 'now'])
    expect(w.tasks.find((r) => r.id === 'now')).toMatchObject({ title: 'Task now', time: '15:00', overdue: false })
  })

  it('a locked encrypted account publishes counts only', () => {
    const w = shellWidget(tasks, today, NOW, true)
    expect(w).toMatchObject({ locked: true, count: 2, tasks: [] })
  })
})

describe('external links in a shell', () => {
  afterEach(() => { delete (window as { opentodoShell?: OpenTodoShell }).opentodoShell })

  function click(href: string, target = '') {
    const a = document.createElement('a')
    a.href = href
    if (target) a.target = target
    document.body.append(a)
    const e = new MouseEvent('click', { bubbles: true, cancelable: true })
    a.dispatchEvent(e)
    a.remove()
    return e.defaultPrevented
  }

  it('a browser keeps its links: nothing is intercepted', () => {
    const off = installShellLinks()
    expect(click('https://maps.example/x', '_blank')).toBe(false)
    off()
  })

  it('a shell with links opens other origins and new-window links in the system browser', () => {
    const openExternal = vi.fn()
    window.opentodoShell = { bridge: 1, platform: 'android', app: '0.10.0', capabilities: ['links'], openExternal }
    const off = installShellLinks()
    expect(click('https://maps.example/x')).toBe(true)
    expect(openExternal).toHaveBeenCalledWith('https://maps.example/x')
    expect(click('/inbox')).toBe(false)
    expect(window.open('https://sso.example/login', '_blank')).toBeNull()
    expect(openExternal).toHaveBeenCalledWith('https://sso.example/login')
    off()
  })
})
