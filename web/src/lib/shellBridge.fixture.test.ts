// @vitest-environment happy-dom
// The Android bridge contract (OpenSpec native-shells "The bridge is optional"):
// the exact strings this web app hands the shell, built by the real builders
// (shellReminders, shellWidget, forgetShellData) from fixed rows, with what the
// shell must make of them. Written to mobile/android/app/src/test/resources/bridge/,
// where the Kotlin unit tests (BridgeFixtureTest) parse the same files. This test
// fails when the files are out of date; `UPDATE_BRIDGE_FIXTURES=1 npx vitest run
// src/lib/shellBridge.fixture.test.ts` rewrites them.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { forgetShellData, type OpenTodoShell } from './shell'
import { shellUrlAction } from './shellActions'
import { shellReminders, shellWidget } from './shellPublish'
import { openOrigin } from './taskOrigin'
import vectors from '../../../internal/origin/testdata/origin_vectors.json'
import type { Reminder, Task } from './types'

// Vitest runs in web/ (happy-dom's URL cannot resolve file: addresses).
const dir = path.resolve(process.cwd(), '../mobile/android/app/src/test/resources/bridge')
const update = process.env.UPDATE_BRIDGE_FIXTURES === '1'

const NOW = Date.UTC(2026, 9, 22, 12, 0)
const HOUR = 60 * 60 * 1000
const TODAY = '2026-10-22'

const task = (id: string, extra: Partial<Task> = {}): Task =>
  ({ id, title: `Task ${id}`, project_id: null, parent_id: null, due: null, priority: 4, labels: [], position: 1, created_at: 0, completed_at: null, deleted_at: null, ...extra }) as unknown as Task
const reminder = (id: string, taskId: string, fireAt: number, extra: Partial<Reminder> = {}): Reminder =>
  ({ id, task_id: taskId, kind: 'absolute', offset_minutes: null, fire_at: fireAt, delivered_at: null, dismissed_at: null, created_at: 0, deleted_at: null, ...extra }) as unknown as Reminder

const tasks = [
  task('call', { title: 'Call the plumber ☎', due: { date: TODAY, time: '09:30' }, priority: 1 }),
  task('late', { title: 'Überweisung «Miete»', due: { date: '2026-10-20' }, priority: 2 }),
  task('plain', { title: 'Water the plants', due: { date: TODAY } }),
  task('later', { title: 'Not today', due: { date: '2026-10-25' } }),
  task('done', { title: 'Done', due: { date: TODAY }, completed_at: NOW - HOUR }),
]
const reminders = [
  reminder('r-late', 'plain', NOW + 3 * HOUR),
  reminder('r-soon', 'call', NOW + HOUR),
  reminder('r-done', 'done', NOW + HOUR),
]

/** What a bridge call hands over, and what the shell must read from it. */
interface Fixture {
  description: string
  /** The bridge method and the exact argument string the web app passes. */
  method: 'scheduleReminders' | 'publishWidget'
  payload: string
  now: number
  expect: unknown
}

function captureSignOut(): { reminders: string; widget: string } {
  const calls: { reminders?: string; widget?: string } = {}
  const bridge: OpenTodoShell = {
    bridge: 1, platform: 'android', app: '0.14.0', capabilities: ['reminders', 'widgets', 'biometric'],
    scheduleReminders: (json) => void (calls.reminders = json),
    publishWidget: (json) => void (calls.widget = json),
    biometricForget: () => undefined,
  }
  window.opentodoShell = bridge
  forgetShellData()
  return { reminders: calls.reminders ?? '', widget: calls.widget ?? '' }
}

function fixtures(): Record<string, Fixture> {
  const titled = shellReminders(reminders, tasks, NOW, { titles: true, encrypted: false })
  const untitled = shellReminders(reminders, tasks, NOW, { titles: true, encrypted: true })
  const widget = shellWidget(tasks, TODAY, NOW, false)
  const locked = shellWidget(tasks, TODAY, NOW, true)
  const signOut = captureSignOut()
  const signedOutWidget = { ...JSON.parse(signOut.widget), updatedAt: NOW }
  return {
    'reminders.json': {
      description: 'The next reminders with titles (titles on, account readable), earliest first.',
      method: 'scheduleReminders', payload: JSON.stringify(titled), now: NOW,
      expect: titled.map((r) => ({ id: r.id, taskId: r.taskId, fireAt: r.fireAt, title: r.title ?? null })),
    },
    'reminders-encrypted.json': {
      description: 'An end-to-end encrypted account: no titles reach the shell.',
      method: 'scheduleReminders', payload: JSON.stringify(untitled), now: NOW,
      expect: untitled.map((r) => ({ id: r.id, taskId: r.taskId, fireAt: r.fireAt, title: null })),
    },
    'reminders-signed-out.json': {
      description: 'Sign-out: the schedule is emptied.',
      method: 'scheduleReminders', payload: signOut.reminders, now: NOW, expect: [],
    },
    'widget.json': {
      description: "The widgets' Today list: overdue first, titles and times while readable.",
      method: 'publishWidget', payload: JSON.stringify(widget), now: NOW,
      expect: { updatedAt: NOW, locked: false, count: widget.count, overdue: widget.overdue, rows: widget.tasks.slice(0, 5).map((t) => ({ id: t.id, title: t.title ?? null, time: t.time ?? null, priority: t.priority, overdue: t.overdue })), more: Math.max(0, widget.count - Math.min(5, widget.tasks.length)) },
    },
    'widget-locked.json': {
      description: 'A locked encrypted account: counts only, no rows.',
      method: 'publishWidget', payload: JSON.stringify(locked), now: NOW,
      expect: { updatedAt: NOW, locked: true, count: locked.count, overdue: locked.overdue, rows: [], more: locked.count },
    },
    'widget-signed-out.json': {
      description: 'Sign-out: an empty, locked widget.',
      method: 'publishWidget', payload: JSON.stringify(signedOutWidget), now: NOW,
      expect: { updatedAt: NOW, locked: true, count: 0, overdue: 0, rows: [], more: 0 },
    },
  }
}

/** Addresses the shell opens the app at, and what the web app reads from them. */
function actions() {
  return {
    description: 'Notification buttons and the quick-add widget: the address the shell opens, and the action the web app reads.',
    reminderActions: [
      { id: 'abc', action: 'snooze' }, { id: 'abc', action: 'dismiss' }, { id: 'r 1/ü', action: 'snooze' },
    ].map(({ id, action }) => ({ id, action, path: `/?reminder=${encodeURIComponent(id).replace(/%20/g, '+')}&action=${action}` })),
    taskPaths: ['t1', 't/1'].map((taskId) => ({ taskId, path: `/?task=${encodeURIComponent(taskId)}` })),
    quickAdd: { path: '/?add=' },
  }
}

/**
 * The Obsidian note links of obsidian-origin: the exact string the web app hands
 * `openExternal` for a note origin, and the shapes of the shared origin vectors
 * the shells must accept or refuse (internal/origin/testdata/origin_vectors.json).
 */
function externalLinks() {
  const handed: string[] = []
  window.opentodoShell = {
    bridge: 1, platform: 'android', app: '0.20.0', capabilities: ['links', 'obsidian-links'],
    openExternal: (url) => void handed.push(url),
  }
  openOrigin({ kind: 'obsidian', id: 'Daily/2026-10-29.md', url: 'obsidian://open?vault=Notes&file=Daily%2F2026-10-29' })
  delete window.opentodoShell
  const cases = (vectors as unknown as { obsidian: { origin: { url?: string }; link: boolean | null }[] }).obsidian
  const urls = (want: boolean) => [...new Set(cases.filter((c) => c.link === want && c.origin.url).map((c) => c.origin.url as string))]
  return {
    description: 'Obsidian note links (obsidian-origin): what the web app hands openExternal for a note origin, and the links the shell must hand to the system (accepted) or refuse (refused) when it lists obsidian-links. Other schemes keep the http(s), mailto and tel rule.',
    handed,
    accepted: urls(true),
    refused: [...urls(false), 'javascript:alert(1)', 'file:///etc/passwd', 'obsidian://open?vault=Notes&file=a&vault=Other'],
  }
}

const text = (v: unknown) => JSON.stringify(v, null, 2) + '\n'

afterEach(() => {
  delete window.opentodoShell
})

describe('Android bridge fixtures', () => {
  it('are current (mobile/android/app/src/test/resources/bridge)', () => {
    const want: Record<string, string> = { 'actions.json': text(actions()), 'external-links.json': text(externalLinks()) }
    for (const [name, f] of Object.entries(fixtures())) want[name] = text(f)
    if (update) {
      mkdirSync(dir, { recursive: true })
      for (const [name, body] of Object.entries(want)) writeFileSync(path.join(dir, name), body)
    }
    for (const [name, body] of Object.entries(want)) {
      const file = path.join(dir, name)
      expect(existsSync(file) ? readFileSync(file, 'utf8') : '(missing)', `${name} is out of date: UPDATE_BRIDGE_FIXTURES=1 npx vitest run src/lib/shellBridge.fixture.test.ts`).toBe(body)
    }
  })

  it('every address the shell opens is read back by the web app', () => {
    const a = actions()
    for (const r of a.reminderActions) expect(shellUrlAction(new URL(r.path, 'https://x').search)).toEqual({ kind: 'reminder', id: r.id, action: r.action })
    expect(shellUrlAction(new URL(a.quickAdd.path, 'https://x').search)).toEqual({ kind: 'add', text: '' })
  })
})
