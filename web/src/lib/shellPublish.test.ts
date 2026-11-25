// @vitest-environment happy-dom
// What the web app hands a native shell (OpenSpec change native-shells, "Reminders
// scheduled on the device", "Widgets", and external links in "The bridge is optional").
import { afterEach, describe, expect, it, vi } from 'vitest'
import { installShellLinks, type OpenTodoShell } from './shell'
import { shellCompleted, shellReminders, shellWidget } from './shellPublish'
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

  it('hands over the due as of the firing day with the title, never without it (push-due-date D4)', () => {
    const dated = [task('t', { due: { date: '2026-10-23', time: '09:30' } }), task('d', { due: { date: '2026-10-23' } })]
    const rs = [reminder('today', 't', NOW + 23 * HOUR), reminder('eve', 't', NOW + 2 * HOUR), reminder('none', 'a', NOW + HOUR), reminder('day', 'd', NOW + HOUR)]
    const list = shellReminders(rs, [...tasks, ...dated], NOW, { titles: true, encrypted: false })
    expect(Object.fromEntries(list.map((r) => [r.id, r.due]))).toEqual({ none: undefined, eve: 'Tomorrow 09:30', day: 'Tomorrow', today: 'Today 09:30' })
    expect(shellReminders(rs, [...tasks, ...dated], NOW, { titles: true, encrypted: true }).some((r) => r.due)).toBe(false)
    expect(shellReminders(rs, [...tasks, ...dated], NOW, { titles: false, encrypted: false }).some((r) => r.due)).toBe(false)
  })

  it('a habit’s tiny version is the body before its due (habits "Reminder text")', () => {
    const habit = task('h', { habit: true, habit_tiny: 'one page', due: { date: '2026-10-22', time: '21:00' } })
    const [r] = shellReminders([reminder('r', 'h', NOW + HOUR)], [habit], NOW, { titles: true, encrypted: false })
    expect(r.due).toBe('One page is enough')
  })

  it('marks an urgent reminder only, so older shells read the same entries (ios-urgent-alarms D3)', () => {
    const list = shellReminders([
      reminder('loud', 'a', NOW + HOUR, { urgent: true }),
      reminder('quiet', 'a', NOW + 2 * HOUR, { urgent: false }),
      reminder('old', 'c', NOW + 3 * HOUR),
    ], tasks, NOW, { titles: false, encrypted: false })
    expect(list).toEqual([
      { id: 'loud', taskId: 'a', fireAt: NOW + HOUR, urgent: true },
      { id: 'quiet', taskId: 'a', fireAt: NOW + 2 * HOUR },
      { id: 'old', taskId: 'c', fireAt: NOW + 3 * HOUR },
    ])
  })

  it('none for tasks in a trashed or archived project, or below one (#1234)', () => {
    const projects = [
      { id: 'archived', parent_id: null, deleted_at: null, archived: true },
      { id: 'child', parent_id: 'archived', deleted_at: null, archived: false },
      { id: 'trashed', parent_id: null, deleted_at: NOW - HOUR, archived: false },
      { id: 'live', parent_id: null, deleted_at: null, archived: false },
    ]
    const ts = [task('a', { project_id: 'archived' }), task('b', { project_id: 'child' }), task('c', { project_id: 'trashed' }), task('d', { project_id: 'live' })]
    const rs = ['a', 'b', 'c', 'd'].map((id) => reminder(`r-${id}`, id, NOW + HOUR))
    expect(shellReminders(rs, ts, NOW, { titles: false, encrypted: false }, projects).map((r) => r.id)).toEqual(['r-d'])
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
    const w = shellWidget(tasks, today, NOW, true, null, [{ id: 'p1', name: 'Home' }])
    expect(w).toMatchObject({ locked: true, count: 2, tasks: [] })
  })

  it('names the project and an overdue task\'s date, and says the widget may complete (android-widget-list D3, D4)', () => {
    const inProject = tasks.map((t) => (t.id === 'late' ? { ...t, project_id: 'p1' } : t))
    const w = shellWidget(inProject, today, NOW, false, null, [{ id: 'p1', name: 'Home' }])
    expect(w.actions).toEqual(['complete'])
    expect(w.tasks.find((r) => r.id === 'late')).toMatchObject({ project: 'Home', date: '2026-10-20', overdue: true })
    // The Inbox has no project name; a task due today carries no date.
    const now = w.tasks.find((r) => r.id === 'now')!
    expect(now.project).toBeUndefined()
    expect(now.date).toBeUndefined()
  })

  it('leaves out a task assigned to someone else, mine and unassigned ones stay', () => {
    const shared = [...tasks, task('theirs', { due: { date: today }, assignee_id: 'ana' }), task('mine', { due: { date: today }, assignee_id: 'me' })]
    const w = shellWidget(shared, today, NOW, false, 'me')
    expect(w.count).toBe(3)
    expect(w.tasks.map((r) => r.id).sort()).toEqual(['late', 'mine', 'now'])
  })
})

describe('the Completed widget (completed-widget D1)', () => {
  const today = '2026-10-22'
  const DAY = 24 * HOUR
  const done = (id: string, at: number | null, extra: Partial<Task> = {}) => task(id, { completed_at: at, created_at: NOW - 30 * DAY, series_id: null, ...extra } as Partial<Task>)
  const tasks = [done('a', NOW - HOUR), done('b', NOW - 2 * HOUR), done('c', NOW - 3 * DAY), done('d', NOW - 8 * DAY), done('e', null), done('f', NOW - HOUR, { deleted_at: NOW } as Partial<Task>)]

  it('counts today and each of the last 7 days, oldest first, as Statistics does', () => {
    const c = shellCompleted(tasks, [], [], null, today, false)
    expect(c.today).toBe(2)
    expect(c.days).toHaveLength(7)
    expect(c.days![0].day).toBe('2026-10-16')
    expect(c.days![6]).toEqual({ day: today, done: 2 })
    expect(c.days!.find((d) => d.day === '2026-10-19')!.done).toBe(1)
    expect(c.days!.reduce((n, d) => n + d.done, 0)).toBe(3)
  })

  it('a locked encrypted account publishes today\'s count only', () => {
    expect(shellCompleted(tasks, [], [], null, today, true)).toEqual({ today: 2 })
  })
})

describe('external links in a shell', () => {
  afterEach(() => { delete (window as { opentodoShell?: OpenTodoShell }).opentodoShell })

  function click(href: string, target = '') {
    const a = document.createElement('a')
    a.href = href
    if (target) a.target = target
    document.body.append(a)
    // Record whether the shell handled the click, then stop the default: a link left to
    // happy-dom would really load the address, and its network error lands after the test.
    let handled = false
    const settle = (ev: Event) => { handled = ev.defaultPrevented; ev.preventDefault() }
    window.addEventListener('click', settle)
    const e = new MouseEvent('click', { bubbles: true, cancelable: true })
    a.dispatchEvent(e)
    window.removeEventListener('click', settle)
    a.remove()
    return handled
  }

  it('a browser keeps its links: nothing is intercepted', () => {
    const off = installShellLinks(document)
    expect(click('https://maps.example/x', '_blank')).toBe(false)
    off()
  })

  it('a shell with links opens other origins and new-window links in the system browser', () => {
    const openExternal = vi.fn()
    window.opentodoShell = { bridge: 1, platform: 'android', app: '0.10.0', capabilities: ['links'], openExternal }
    const off = installShellLinks(document)
    expect(click('https://maps.example/x')).toBe(true)
    expect(openExternal).toHaveBeenCalledWith('https://maps.example/x')
    expect(click('/inbox')).toBe(false)
    expect(window.open('https://sso.example/login', '_blank')).toBeNull()
    expect(openExternal).toHaveBeenCalledWith('https://sso.example/login')
    off()
  })
})
