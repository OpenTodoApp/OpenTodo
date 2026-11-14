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
import { shellGeofences } from './geofences'
import { backgroundDone, forgetShellData, openAlarmSettings, setSystemBars, shellHaptic, shellVisible, takeOverPull, type OpenTodoShell, type ShellGeofencePayload, type ShellHaptic } from './shell'
import { fileChunks } from './saveFile'
import { shellUrlAction } from './shellActions'
import { shellReminders, shellWidget } from './shellPublish'
import { openOrigin } from './originOpen'
import vectors from '../../../internal/origin/testdata/origin_vectors.json'
import type { Place, Reminder, Task } from './types'

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

// Location reminders (location-reminders D3): a post office, a home linked to a
// saved place whose pin moved, a dismissed one, one on a completed task, one on a
// task without coordinates.
const place = (id: string, lat: number, lon: number): Place =>
  ({ id, name: `Place ${id}`, address: '', geo: { lat, lon }, position: 1, created_at: 0, deleted_at: null }) as unknown as Place
const placeTasks = [
  task('stamps', { title: 'Buy stamps', location: { name: 'Post office', lat: 45.4642, lon: 9.19 } }),
  task('parcel', { title: 'Take the parcel', location: { name: 'Home', lat: 1, lon: 1, place_id: 'home' } }),
  task('gym', { title: 'Book a class', completed_at: NOW - HOUR, location: { name: 'Gym', lat: 45.47, lon: 9.2 } }),
  task('bank', { title: 'Ask about the card', location: { address: 'Via Roma 1' } }),
]
const places = [place('home', 45.4781, 9.2272)]
const locationReminders = [
  reminder('g-arrive', 'stamps', 0, { kind: 'arrive', fire_at: null, radius_m: 150 }),
  reminder('g-leave', 'parcel', 0, { kind: 'leave', fire_at: null, radius_m: 300 }),
  reminder('g-dismissed', 'stamps', 0, { kind: 'leave', fire_at: null, radius_m: 150, dismissed_at: NOW - HOUR }),
  reminder('g-done', 'gym', 0, { kind: 'arrive', fire_at: null, radius_m: 500 }),
  reminder('g-nowhere', 'bank', 0, { kind: 'arrive', fire_at: null, radius_m: 150 }),
]

/** 40 armed regions, 20 in Milan and 20 in Berlin, for the shells' ranking tests. */
function twoCities() {
  const cities = [{ name: 'milan', lat: 45.4642, lon: 9.19 }, { name: 'berlin', lat: 52.52, lon: 13.405 }]
  const ts: Task[] = []
  const rs: Reminder[] = []
  for (const c of cities) {
    for (let i = 0; i < 20; i++) {
      const id = `${c.name}-${String(i).padStart(2, '0')}`
      // Spread over about 2 km, nearest first by index.
      ts.push(task(id, { title: id, location: { lat: c.lat + i * 0.001, lon: c.lon + i * 0.001 } }))
      rs.push(reminder(`r-${id}`, id, 0, { kind: i % 2 ? 'leave' : 'arrive', fire_at: null, radius_m: 150 }))
    }
  }
  const payload = shellGeofences(rs, ts, [], { titles: false, encrypted: false })
  return {
    description: 'Ranking (location-reminders D3): 40 armed regions in two cities. A shell registers the 19 nearest to its position; from either city that is the 19 of that city nearest to it, and it re-ranks after leaving the 1 km region around the position it ranked from.',
    method: 'scheduleGeofences' as const, payload: JSON.stringify(payload), now: NOW,
    expect: cities.map((c) => ({ from: { lat: c.lat, lon: c.lon }, registered: Array.from({ length: 19 }, (_, i) => `r-${c.name}-${String(i).padStart(2, '0')}`) })),
  }
}

function captureGeofencesSignOut(): string {
  let sent = ''
  window.opentodoShell = {
    bridge: 1, platform: 'android', app: '0.21.0', capabilities: ['geofences'],
    scheduleGeofences: (json) => { sent = json; return 'granted' },
  }
  forgetShellData()
  delete window.opentodoShell
  return sent
}

const regionExpect = (p: ShellGeofencePayload) => p.regions.map((r) => ({ id: r.id, taskId: r.taskId, lat: r.lat, lon: r.lon, radius: r.radius, on: r.on, title: r.title ?? null }))

/** What a bridge call hands over, and what the shell must read from it. */
interface Fixture {
  description: string
  /** The bridge method and the exact argument string the web app passes. */
  method: 'scheduleReminders' | 'publishWidget' | 'scheduleGeofences'
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
  const geo = shellGeofences(locationReminders, placeTasks, places, { titles: true, encrypted: false })
  const geoEncrypted = shellGeofences(locationReminders, placeTasks, places, { titles: true, encrypted: true })
  const geoAsk = { ...shellGeofences([], placeTasks, places, { titles: false, encrypted: false }), ask: true as const }
  return {
    'geofences.json': {
      description: 'Location reminders (location-reminders D3): every armed one, sorted by id, titles on and the account readable. A linked place uses its current pin; dismissed ones, ones on completed tasks and ones without coordinates are left out. The shell registers at most 19 by distance and answers granted, foreground-only, denied or unavailable.',
      method: 'scheduleGeofences', payload: JSON.stringify(geo), now: NOW, expect: { ask: false, regions: regionExpect(geo) },
    },
    'geofences-encrypted.json': {
      description: 'An end-to-end encrypted account (unlocked): coordinates but no titles reach the shell.',
      method: 'scheduleGeofences', payload: JSON.stringify(geoEncrypted), now: NOW, expect: { ask: false, regions: regionExpect(geoEncrypted) },
    },
    'geofences-ask.json': {
      description: 'Turning on "Location reminders on this phone" with nothing armed yet: ask is set, so a shell with a screen asks for fine then background location even though there are no regions.',
      method: 'scheduleGeofences', payload: JSON.stringify(geoAsk), now: NOW, expect: { ask: true, regions: [] },
    },
    'geofences-signed-out.json': {
      description: 'Sign-out (and lock of an encrypted account, and the switch turned off): every region is removed.',
      method: 'scheduleGeofences', payload: captureGeofencesSignOut(), now: NOW, expect: { ask: false, regions: [] },
    },
    'geofences-two-cities.json': twoCities(),
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
    // A time reminder's buttons in the shell's order (reminder-done-action): Done, Snooze 10 min, Dismiss.
    reminderActions: [
      { id: 'abc', action: 'done' }, { id: 'abc', action: 'snooze' }, { id: 'abc', action: 'dismiss' }, { id: 'r 1/ü', action: 'snooze' },
    ].map(({ id, action }) => ({ id, action, path: `/?reminder=${encodeURIComponent(id).replace(/%20/g, '+')}&action=${action}` })),
    taskPaths: ['t1', 't/1'].map((taskId) => ({ taskId, path: `/?task=${encodeURIComponent(taskId)}` })),
    // location-reminders D2: a crossing's notification offers Done (complete the task) and Dismiss.
    locationActions: [
      { id: 'g-arrive', action: 'done' }, { id: 'g-arrive', action: 'dismiss' }, { id: 'r 1/ü', action: 'done' },
    ].map(({ id, action }) => ({ id, action, path: `/?reminder=${encodeURIComponent(id).replace(/%20/g, '+')}&action=${action}` })),
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

/**
 * theme-engine D8: the strings setSystemBars hands a shell that lists system-bars,
 * captured from the real call, with what the shell must read (the colour, and
 * whether its icons are light), and payloads it must ignore.
 */
function systemBars() {
  const handed: { payload: string; color: string; lightIcons: boolean }[] = []
  window.opentodoShell = {
    bridge: 1, platform: 'android', app: '0.20.0', capabilities: ['system-bars'],
    setSystemBars: (json) => { const p = JSON.parse(json) as { color: string; dark: boolean }; handed.push({ payload: json, color: p.color, lightIcons: p.dark }) },
  }
  // The emerald accent bar, the dark canvas, a pale light theme and a pale accent.
  for (const c of ['#047857', '#0d0e10', '#fdf6e3', '#88c0d0']) setSystemBars(c)
  delete window.opentodoShell
  return {
    description: 'System bars (theme-engine D8, native-shells "System bars follow the app\'s theme"): what setSystemBars hands a shell that lists system-bars, with the colour and icon appearance the shell must apply (dark: true means light icons), and payloads the shell must ignore, keeping its bars and logging nothing of them.',
    method: 'setSystemBars',
    handed,
    refused: ['{"color":"red","dark":true}', '{"color":"#2e3440"}', '{"dark":true}', '{"color":"#2E3440","dark":true}', '{"color":"#2e344","dark":false}', '{"color":"#2e3440","dark":"yes"}', '{"color":"url(x)","dark":true}', 'null', '[]', 'not json'],
  }
}

/**
 * shell-repairs D2: the calls of `saveFile` for one small file in two chunks (the
 * real chunker with a small chunk size), with the file the shell must assemble and
 * what it answers. A shell saves under the name's last path segment.
 */
function saveFileCalls() {
  const body = 'OpenTodo recovery key\n\nälpha-brävo-chärlie\n'
  const bytes = new TextEncoder().encode(body)
  const calls = fileChunks(bytes, 'f-1', 'opentodo-recovery-key.txt', 'text/plain', 24).map((c) => JSON.stringify(c))
  return {
    description: 'Saving a file made in the page (shell-repairs D2): each entry of calls is one saveFile argument, in order. The shell appends the decoded chunks of one id to a file, answers "more" until the chunk with last, then opens the save dialog with the name and type and answers saved, cancelled or failed. A new id discards an unfinished file; a malformed call answers failed.',
    method: 'saveFile' as const,
    calls,
    expect: { name: 'opentodo-recovery-key.txt', type: 'text/plain', bytes: btoa(String.fromCharCode(...bytes)), answers: [...calls.slice(1).map(() => 'more'), 'saved'] },
    refused: ['not json', '{}', '{"id":"","name":"a","type":"","data":"","last":true}', '{"id":"x","name":"a","type":"","data":"***","last":true}', '{"id":"x","name":"a","type":"","data":"","last":"yes"}'],
  }
}

/** shell-repairs D5: the kinds `haptic` is called with, captured from the real call, and one a shell must ignore. */
function haptics() {
  const kinds: string[] = []
  window.opentodoShell = { bridge: 1, platform: 'android', app: '1.5.0', capabilities: ['haptics'], haptic: (kind) => void kinds.push(kind) }
  for (const k of ['tick', 'success'] satisfies ShellHaptic[]) shellHaptic(k)
  delete window.opentodoShell
  return {
    description: 'Haptic feedback (shell-repairs D5): the kinds the web app hands haptic. A shell plays its own feedback for each and ignores a kind it does not know, without an error.',
    method: 'haptic' as const,
    kinds,
    unknown: 'warning',
  }
}

/**
 * shell-reminders-on D2 to D4: which capabilities only the visible app lists, which
 * only a background run lists, and the methods that came with them. The lists are
 * Android's; the iOS app lists a subset of visibleOnly. The web app reads "the shell
 * has a screen" from `links`, so no background run may list anything of visibleOnly.
 */
function capabilities() {
  const visibleOnly = ['share', 'links', 'obsidian-links', 'system-bars', 'microphone', 'files', 'haptics', 'alarm-settings']
  const backgroundOnly = ['background']
  const both = ['reminders', 'widgets']
  const called: string[] = []
  const bridge = (caps: string[]): OpenTodoShell => ({ bridge: 1, platform: 'android', app: '1.6.0', capabilities: caps, openAlarmSettings: () => void called.push('openAlarmSettings'), backgroundDone: () => void called.push('backgroundDone') })
  // Each method is called only where its capability is listed.
  window.opentodoShell = bridge([...both, ...visibleOnly])
  const visible = { shellVisible: shellVisible(), openAlarmSettings: openAlarmSettings(), backgroundDone: backgroundDone() }
  window.opentodoShell = bridge([...both, ...backgroundOnly])
  const background = { shellVisible: shellVisible(), openAlarmSettings: openAlarmSettings(), backgroundDone: backgroundDone() }
  delete window.opentodoShell
  return {
    description: 'Capabilities by kind of run (shell-reminders-on): visibleOnly is listed only by the app a person sees (biometric and geofences depend on the device and the store build and are not listed here), backgroundOnly only by a background run, both by either. methods names the capability each new method needs; expect is what the web app does in each run.',
    visibleOnly, backgroundOnly, both,
    methods: { openAlarmSettings: 'alarm-settings', backgroundDone: 'background' },
    expect: { visible, background, called },
  }
}

/** pull-to-sync D4: the call that tells a shell with its own pull to refresh that the page handles the pull, captured from the real call. */
function pull() {
  const calls: unknown[][] = []
  window.opentodoShell = { bridge: 1, platform: 'ios', app: '1.6.0', capabilities: ['pull-refresh'], pullHandled: (...args: unknown[]) => void calls.push(args) }
  takeOverPull()
  // A shell that does not list the capability is never called.
  window.opentodoShell = { bridge: 1, platform: 'android', app: '1.6.0', capabilities: ['haptics'], pullHandled: (...args: unknown[]) => void calls.push(args) }
  takeOverPull()
  delete window.opentodoShell
  return {
    description: 'Pull to sync (pull-to-sync D4): a shell with its own pull to refresh lists the capability. The web app calls the method once per page load, without arguments, when it handles the pull itself; the shell then turns its own off until another page loads. A shell without a pull to refresh lists nothing and is not called.',
    capability: 'pull-refresh' as const,
    method: 'pullHandled' as const,
    calls,
  }
}

const text = (v: unknown) => JSON.stringify(v, null, 2) + '\n'

afterEach(() => {
  delete window.opentodoShell
})

describe('Android bridge fixtures', () => {
  it('are current (mobile/android/app/src/test/resources/bridge)', () => {
    const want: Record<string, string> = { 'actions.json': text(actions()), 'external-links.json': text(externalLinks()), 'system-bars.json': text(systemBars()), 'save-file.json': text(saveFileCalls()), 'haptics.json': text(haptics()), 'capabilities.json': text(capabilities()), 'pull.json': text(pull()) }
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
    for (const r of [...a.reminderActions, ...a.locationActions]) expect(shellUrlAction(new URL(r.path, 'https://x').search)).toEqual({ kind: 'reminder', id: r.id, action: r.action })
    expect(shellUrlAction(new URL(a.quickAdd.path, 'https://x').search)).toEqual({ kind: 'add', text: '' })
  })
})
