// Fixture data for the core-screen stories (OpenSpec change ux-overhaul, task 8.7;
// design-system "Design workbench", "Visual regression gate on stories"). The
// screens read the local database through live queries, so a story seeds the
// database before it renders: a frozen clock (headings such as "Wednesday 14
// October" never change), no network, sequential ids, a known date-time format,
// and realistic titles. Stories that take plain props use `withClock` only.
import type { Decorator, StoryObj } from '@storybook/react-vite'
import { db, setMeta } from '../../lib/db'
import { setDateTime } from '../../lib/dates'
import { createLabel } from '../../lib/labels'
import { createProject, createSubtask, createTask, resetDeviceId, updateTask } from '../../lib/ops'
import { createSection, saveViewMode } from '../../lib/sections'
import { setCurrentUserId } from '../../lib/sharing'
import { logTime, startTracking } from '../../lib/timeEntries'
import type { Label, Project, Task, User } from '../../lib/types'
import { HUES, type HueName } from '../../ui'
import { resetPanel } from '../panel'

/** The frozen instant: a Wednesday at noon, local time. */
export const FROZEN_ISO = '2026-10-14T12:00:00'
export const TODAY = '2026-10-14'
export const TOMORROW = '2026-10-15'

/** The signed-in account of every story. */
export const storyUser: User = { id: 'u-ada', email: 'ada@example.com', name: 'Ada', role: 'owner', createdAt: 0 }

let RealDate: DateConstructor | null = null

/**
 * Replace the global `Date` with a subclass whose no-argument constructor and
 * `Date.now()` return the frozen instant; `new Date(value)` keeps working.
 * Idempotent: a second call re-freezes from the real constructor.
 */
export function freezeDate(iso = FROZEN_ISO): void {
  const Real = RealDate ?? Date
  RealDate = Real
  const at = new Real(iso).getTime()
  class Frozen extends Real {
    constructor(...args: unknown[]) {
      if (args.length) super(...(args as [number]))
      else super(at)
    }
    static now() { return at }
  }
  globalThis.Date = Frozen as DateConstructor
}

/** No network in the workbench: every request answers 404 (feeds, assistant status, attachments). */
export function stubNetwork(): void {
  const stub = async () => new Response('{}', { status: 404, headers: { 'content-type': 'application/json' } })
  ;(stub as unknown as { storyStub: true }).storyStub = true
  if ((window.fetch as unknown as { storyStub?: true }).storyStub) return
  window.fetch = stub as typeof fetch
}

/**
 * Requests a screen makes by token (a preview, a public list), answered from
 * fixtures: the longest matching path prefix gives the status and the JSON body,
 * every other request answers 404 (OpenSpec change screen-stories-rare, design D3).
 * Install it in `beforeEach`; `withClock` and a seed keep it.
 */
export function answerRequests(routes: Record<string, { status?: number; body: unknown }>): void {
  const prefixes = Object.keys(routes).sort((a, b) => b.length - a.length)
  const stub = async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const path = new URL(url, location.origin).pathname
    const hit = prefixes.find((p) => path.startsWith(p))
    const answer = hit ? routes[hit] : { status: 404, body: {} }
    return new Response(JSON.stringify(answer.body), { status: answer.status ?? 200, headers: { 'content-type': 'application/json' } })
  }
  // Marked as the workbench's stub, so `withClock` and a seed keep it.
  ;(stub as unknown as { storyStub: true }).storyStub = true
  window.fetch = stub as typeof fetch
}

/** The format the list tests use: day-month, 24-hour, weeks from Monday. */
export function setStoryDateTime(): void {
  setDateTime({ date_format: 'day-month', time_format: '24h', week_start: 'mon' }, { order: 'DM', hour12: false, weekStart: 1 })
}

/** Forget per-device state of the app, leaving the workbench's own keys alone. */
export function clearAppStorage(): void {
  try {
    for (const key of Object.keys(localStorage)) if (!/storybook|^sb-/i.test(key)) localStorage.removeItem(key)
  } catch { /* storage may be unavailable */ }
}

/** Sequential ids while a seed runs, so a story's rows and addresses are the same on every run. */
async function withSequentialIds<T>(run: () => Promise<T>): Promise<T> {
  const real = crypto.randomUUID.bind(crypto)
  let n = 0
  crypto.randomUUID = (() => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`) as typeof crypto.randomUUID
  try {
    return await run()
  } finally {
    crypto.randomUUID = real
  }
}

/** Ids a seed hands to the stories that render after it (a project to select, a task to open). */
export const seeded: Record<string, string> = {}

let queue: Promise<void> = Promise.resolve()

/** Reset the clock, the network, the database and the app singletons, then run the seed. */
export async function reseed(seed: () => Promise<void>): Promise<void> {
  const run = async () => {
    freezeDate()
    stubNetwork()
    setStoryDateTime()
    resetPanel()
    clearAppStorage()
    for (const k of Object.keys(seeded)) delete seeded[k]
    await db.delete()
    await db.open()
    resetDeviceId()
    await withSequentialIds(seed)
  }
  // Seeds never overlap (the side-by-side theme renders a story twice).
  queue = queue.then(run, run)
  await queue
}

/**
 * Seed the database before a story renders. The seed runs as a Storybook loader,
 * so the story root stays empty until the data is there (the gates wait for the
 * first child of the root); the decorator keeps the story from rendering ahead of
 * the loader. Spread into a story or a meta: `{ ...withSeed(seedToday), render }`.
 */
export function withSeed(seed: () => Promise<void>): Pick<StoryObj, 'loaders' | 'decorators'> {
  const guard: Decorator = (Story, ctx) => (ctx.loaded?.seeded ? <Story /> : <div aria-busy="true" />)
  return {
    loaders: [async () => { await reseed(seed); return { seeded: true } }],
    decorators: [guard],
  }
}

/** For stories with static props: the frozen clock and the known date-time format, no database. */
export const withClock: Decorator = (Story) => {
  freezeDate()
  stubNetwork()
  setStoryDateTime()
  clearAppStorage()
  return <Story />
}

// ---- static rows (TaskRow, TaskCard, BoardView stories) ----

export const task = (over: Partial<Task> & { id: string; title: string }): Task => ({
  description: '', project_id: null, parent_id: null, priority: 4, due: null, labels: [], position: 0,
  created_at: 0, completed_at: null, deleted_at: null, estimate_minutes: null, recurrence: null, series_id: null, assignee_id: null, _clock: {}, ...over,
} as Task)

export const project = (over: Partial<Project> & { id: string; name: string; color: string }): Project => ({
  position: 0, archived: false, parent_id: null, created_at: 0, deleted_at: null, _clock: {}, ...over,
} as Project)

export const label = (id: string, name: string, color: string): Label => ({ id, name, color, position: 0, created_at: 0, deleted_at: null, _clock: {} })

/** A palette hue's canonical stored colour (the same table LABEL_PALETTE and the colour pickers use). */
const hue = (name: HueName): string => HUES.find((h) => h.name === name)!.hex
export const HEX = { red: hue('red'), orange: hue('orange'), green: hue('green'), teal: hue('teal'), blue: hue('blue'), violet: hue('violet'), pink: hue('pink'), slate: hue('slate') } as const

// ---- seeds ----

/**
 * Time entries (OpenSpec time-tracking): the story user's past entries on the Inbox
 * task and one entry running for 1 h 5 min on another task (the indicator stories).
 */
export async function seedTracking(): Promise<void> {
  await seedInbox()
  await setCurrentUserId(storyUser.id)
  const now = Date.now()
  await logTime(seeded.inboxTask, now - 26 * 3600000, now - 26 * 3600000 + 25 * 60000, 'Forms printed')
  await logTime(seeded.inboxTask, now - 3 * 3600000, now - 3 * 3600000 + 10 * 60000)
  seeded.trackedTask = await createTask({ title: 'Write the report', estimate_minutes: 90 })
  await startTracking(seeded.trackedTask, { now: now - 65 * 60000 })
}

/** Projects and labels every list story shares. */
export async function seedBase() {
  seeded.work = await createProject({ name: 'Work', color: HEX.blue })
  seeded.website = await createProject({ name: 'Website launch', color: HEX.violet, parent_id: seeded.work })
  seeded.home = await createProject({ name: 'Home', color: HEX.green })
  seeded.health = await createProject({ name: 'Health', color: HEX.red })
  seeded.errand = await createLabel({ name: 'errand', color: HEX.orange })
  seeded.deepWork = await createLabel({ name: 'deep-work', color: HEX.violet })
  seeded.waiting = await createLabel({ name: 'waiting', color: HEX.slate })
}

/** The Inbox: eight unfiled tasks, one with subtasks, one deferred (the Later group). */
export async function seedInbox(): Promise<void> {
  await seedBase()
  seeded.inboxTask = await createTask({ title: 'Renew passport', due: { date: TOMORROW }, priority: 2, estimate_minutes: 45, labels: [seeded.errand] })
  await createTask({ title: 'Call the bank about the card limit', due: { date: TODAY, time: '15:00' }, estimate_minutes: 15 })
  const trip = await createTask({ title: 'Plan the autumn trip', description: 'Three days, by train if possible.', priority: 3 })
  await createSubtask(trip, 'Compare train times')
  await createSubtask(trip, 'Book the hotel')
  await createTask({ title: 'Return the library books', deadline: '2026-10-17', labels: [seeded.errand] })
  await createTask({ title: 'Reply to Mara about the workshop', labels: [seeded.waiting] })
  await createTask({ title: 'Water the plants', recurrence: 'every 3 days', due: { date: TODAY } })
  await createTask({ title: 'Read the sync protocol draft', estimate_minutes: 90, labels: [seeded.deepWork] })
  await createTask({ title: 'Fix the bike light', start: '2026-10-20' })
}

/** Today with Overdue and Today groups, and dated tasks for Upcoming grouped by day. */
export async function seedToday(): Promise<void> {
  await seedBase()
  await createTask({ title: 'Send the invoice to Northwind', due: { date: '2026-10-12' }, project_id: seeded.work, priority: 1 })
  await createTask({ title: 'Book the dentist', due: { date: '2026-10-13' }, project_id: seeded.health, labels: [seeded.errand] })
  seeded.todayTask = await createTask({ title: 'Write the release notes', due: { date: TODAY, time: '09:30' }, project_id: seeded.website, estimate_minutes: 60, labels: [seeded.deepWork] })
  await createTask({ title: 'Call the bank about the card limit', due: { date: TODAY, time: '15:00' }, estimate_minutes: 15 })
  await createTask({ title: 'Water the plants', due: { date: TODAY }, recurrence: 'every 3 days', project_id: seeded.home })
  await createTask({ title: 'Stretch for ten minutes', due: { date: TODAY }, evening: true, project_id: seeded.health })
  await createTask({ title: 'Review the homepage copy', due: { date: TOMORROW, time: '10:00' }, project_id: seeded.website, deadline: '2026-10-17' })
  await createTask({ title: 'Pick up the parcel', due: { date: TOMORROW }, labels: [seeded.errand] })
  await createTask({ title: 'Team retrospective', due: { date: '2026-10-16', time: '14:00' }, project_id: seeded.work, estimate_minutes: 60 })
  await createTask({ title: 'Buy a birthday present for Sam', due: { date: '2026-10-18' }, project_id: seeded.home })
  await createTask({ title: 'Renew the domain', due: { date: '2026-10-20' }, project_id: seeded.website, priority: 2 })
}

/** A project with three sections and cards in each; `board` opens it in board layout on this device. */
export async function seedProjectWithSections(board = true): Promise<void> {
  await seedBase()
  const p = seeded.website
  const backlog = await createSection(p, 'Backlog')
  const doing = await createSection(p, 'In progress')
  const review = await createSection(p, 'Review')
  await createTask({ title: 'Write the launch announcement', project_id: p, section_id: backlog, labels: [seeded.deepWork], estimate_minutes: 120 })
  await createTask({ title: 'Set up the status page', project_id: p, section_id: backlog, priority: 3 })
  await createTask({ title: 'Collect testimonials', project_id: p, section_id: backlog, labels: [seeded.waiting] })
  const copy = await createTask({ title: 'Review the homepage copy', project_id: p, section_id: doing, due: { date: TOMORROW, time: '10:00' }, deadline: '2026-10-17', priority: 2 })
  await createTask({ title: 'Compress the hero images', project_id: p, section_id: doing, estimate_minutes: 30 })
  const pricing = await createTask({ title: 'Pricing page', project_id: p, section_id: review, priority: 1, due: { date: TODAY } })
  await createSubtask(pricing, 'Check the VAT wording')
  await createSubtask(pricing, 'Add the yearly plan')
  await createTask({ title: 'Publish the pricing page', project_id: p, section_id: review })
  await updateTask(copy, { blocked_by: [pricing] })
  if (board) await saveViewMode(p, 'board')
}

/** The website project as a timeline: a bar across today, one that ended, one past its deadline (surfaces-v2). */
export async function seedProjectTimeline(): Promise<void> {
  await seedBase()
  const p = seeded.website
  await createTask({ title: 'Draft the launch plan', project_id: p, start: '2026-10-05', due: { date: '2026-10-09' } })
  await createTask({ title: 'Redesign the homepage', project_id: p, start: '2026-10-08', due: { date: '2026-10-20' }, deadline: '2026-10-22' })
  await createTask({ title: 'Collect testimonials', project_id: p, start: '2026-10-06', deadline: '2026-10-12' })
  await createTask({ title: 'Publish the pricing page', project_id: p, start: '2026-10-16', due: { date: '2026-10-23' } })
  await createTask({ title: 'Write the press release', project_id: p })
  await saveViewMode(p, 'timeline')
}

/** A week of timed tasks around the frozen day, with an all-day task and one overlap. */
export async function seedCalendarWeek(): Promise<void> {
  await seedBase()
  await createTask({ title: 'Write the release notes', due: { date: TODAY, time: '09:00' }, estimate_minutes: 60, project_id: seeded.website })
  await createTask({ title: 'Design review', due: { date: TODAY, time: '10:00' }, estimate_minutes: 60, project_id: seeded.work })
  await createTask({ title: 'Call Ana', due: { date: TODAY, time: '10:30' }, estimate_minutes: 30, project_id: seeded.work })
  await createTask({ title: 'Lunch run', due: { date: TODAY, time: '12:30' }, estimate_minutes: 45, project_id: seeded.health })
  await createTask({ title: 'Water the plants', due: { date: TODAY }, project_id: seeded.home })
  await createTask({ title: 'Plan the sprint', due: { date: '2026-10-12', time: '09:30' }, estimate_minutes: 90, project_id: seeded.work })
  await createTask({ title: 'Dentist', due: { date: '2026-10-13', time: '08:30' }, estimate_minutes: 60, project_id: seeded.health })
  await createTask({ title: 'Review the homepage copy', due: { date: TOMORROW, time: '10:00' }, estimate_minutes: 60, project_id: seeded.website })
  await createTask({ title: 'Pick up the parcel', due: { date: TOMORROW } })
  await createTask({ title: 'Team retrospective', due: { date: '2026-10-16', time: '14:00' }, estimate_minutes: 60, project_id: seeded.work })
  await createTask({ title: 'Market', due: { date: '2026-10-17', time: '09:00' }, estimate_minutes: 90, project_id: seeded.home })
  await createTask({ title: 'Long run', due: { date: '2026-10-18', time: '08:00' }, estimate_minutes: 120, project_id: seeded.health })
}

/**
 * The Plan (planner-view D10): the calendar week, a weekly Monday report of 45
 * minutes (one row on the 19th, a projection on the 26th) and a subscribed
 * calendar's meeting tomorrow, so a column shows the three-segment bar.
 */
export async function seedCalendarPlan(): Promise<void> {
  await seedCalendarWeek()
  await createTask({ title: 'Weekly report', due: { date: '2026-10-19', time: '09:00' }, recurrence: 'every monday', estimate_minutes: 45, project_id: seeded.work })
  await createTask({ title: 'Ship the newsletter', due: { date: TOMORROW }, recurrence: 'every week', estimate_minutes: 30, project_id: seeded.website })
  await db.calendarSubscriptions.put({ id: 'story-sub', name: 'Work calendar', color: hue('blue'), enabled: true, lastSuccessAt: Date.parse('2026-10-14T11:00:00') })
  await db.calendarEvents.put({ id: 'story-ev', subscriptionId: 'story-sub', uid: 'story-ev', summary: 'Team sync', location: 'Room 4', start: { date: TOMORROW, time: '13:00' }, end: { date: TOMORROW, time: '14:30' }, allDay: false, free: false })
  await setMeta('calendar.events.window', { from: '2026-10-01', to: '2026-11-30', fetchedAt: Date.parse('2026-10-14T11:00:00') })
}

/** A comment and an attachment on a task, for the count chips (fixture rows, not ops). */
export async function seedCounts(taskId: string): Promise<void> {
  await db.comments.put({ id: `${taskId}-c1`, task_id: taskId, parent_id: null, body: 'Numbers land on Monday.', author_id: storyUser.id, mentions: [], created_at: 1, edited_at: null, deleted_at: null, _clock: {} })
  await db.comments.put({ id: `${taskId}-c2`, task_id: taskId, parent_id: null, body: 'Charts are ready.', author_id: storyUser.id, mentions: [], created_at: 2, edited_at: null, deleted_at: null, _clock: {} })
  await db.attachments.put({ id: `${taskId}-a1`, task_id: taskId, comment_id: null, name: 'Q2 numbers.pdf', mime: 'application/pdf', size: 212_000, sha256: 'ab', url: null, encrypted: false, author_id: storyUser.id, created_at: 1, uploaded_at: 1, deleted_at: null, _clock: {} })
}
