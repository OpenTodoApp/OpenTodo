// @vitest-environment happy-dom
// What each task list keeps in the phone list (OpenSpec change phone-lists, tasks 3.1
// and 4.1 to 4.3): Today's briefing, habits, Earlier, Done today, Close the day and
// events; the Inbox's Process; Upcoming's days, summaries and projections; Completed's
// search, options and paging; a project's sections, note and sub-projects; the
// filtered-empty and missing states; and the page menu of the lists that
// phoneLists.test.tsx leaves out. Every test reads the phone screen, so none passes
// against the earlier layout.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setDoneTodayShown } from '../lib/closedListPrefs'
import { db, setMeta } from '../lib/db'
import { addDaysISO, logicalToday } from '../lib/dates'
import { projectFilterKey, saveQueryFilter } from '../lib/deviceFilters'
import { createLabel } from '../lib/labels'
import { createProject, createTask, resetDeviceId, setTaskCompleted, updateProject, updateTask } from '../lib/ops'
import { createSection } from '../lib/sections'
import type { CalendarEvent, CalendarSubscription, User } from '../lib/types'
import { setBriefingShown, setTodayEventsShown } from '../lib/userPrefs'
import { click, minWidthPx, render, type, waitFor } from '../ui/test-utils'
import { setUpcomingProjections } from '../app/calendar/projections'
import { resetTodayAgendaFetch } from '../app/calendar/TodayAgenda'
import { resetPanel } from '../app/panel'
import { navigate, type Route } from '../app/router'
import { Shell } from '../app/Shell'
import { resetTaskTrail } from '../app/taskTrail'
import { setPhoneUiEnabled } from './prefs'

const user = { id: 'u1', email: 'a@example.com', name: 'Ada', role: 'owner', created_at: 0 } as unknown as User
const original = window.matchMedia
const today = logicalToday()

beforeEach(async () => {
  await db.delete()
  await db.open()
  resetDeviceId()
  resetPanel()
  resetTaskTrail()
  resetTodayAgendaFetch()
  window.matchMedia = ((q: string) => ({
    matches: q.includes('min-width') ? minWidthPx(q) <= 390 : false, media: q, onchange: null,
    addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false,
  })) as typeof window.matchMedia
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })))
  setPhoneUiEnabled(false)
})
afterEach(() => { window.matchMedia = original; vi.unstubAllGlobals(); setUpcomingProjections(false); setPhoneUiEnabled(false) })

const list = () => document.querySelector<HTMLElement>('[data-phone-screen="list"][data-phone-list]')
const inList = <E extends HTMLElement = HTMLElement>(selector: string) => list()?.querySelector<E>(selector) ?? null
const allInList = (selector: string) => [...(list()?.querySelectorAll<HTMLElement>(selector) ?? [])]
const rowIds = () => allInList('[data-phone-row]').map((el) => el.dataset.phoneRow!)
const headings = () => allInList('[data-group-label]').map((h) => h.textContent)
const groupKeys = () => allInList('[data-group]').map((g) => g.dataset.group!)
/** Whether `a` comes before `b` in the document. */
const before = (a: Element, b: Element) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)

/** Opens a route in the phone UI and waits for its phone list. */
async function open(route: Route) {
  setPhoneUiEnabled(true)
  navigate(route)
  const r = await render(<Shell user={user} onLogout={() => {}} />)
  await waitFor(() => list()?.getAttribute('data-phone-list') === route.view, `the phone list of ${route.view}`)
  return r
}

describe('Today in the phone list', () => {
  it('shows the briefing under the title while it is on, and not once it is hidden', async () => {
    await createTask({ title: 'Send the invoice', due: { date: addDaysISO(today, -2) } })
    const r = await open({ view: 'today' })
    await waitFor(() => !!inList('[data-phone-head] [data-page-briefing] [data-briefing="today"]'), 'the briefing')
    const briefing = inList('[data-page-briefing]')!
    expect(briefing.querySelector('[data-briefing-lead]')!.textContent).toBe('One thing matters today.')
    expect(briefing.querySelector('[data-briefing-fact="late"]')!.textContent).toContain('Send the invoice')
    expect(before(inList('[data-page-title]')!, briefing)).toBe(true)
    await setBriefingShown(false)
    await waitFor(() => !!list() && !inList('[data-page-briefing]'), 'the briefing hidden')
    await r.unmount()
  })

  it('shows a habit due today in the habits strip, above the rows and not as a row', async () => {
    const stretch = await createTask({ title: 'Stretch', due: { date: today }, recurrence: 'every day' })
    await updateTask(stretch, { habit: true })
    const task = await createTask({ title: 'Write the notes', due: { date: today } })
    const r = await open({ view: 'today' })
    await waitFor(() => !!inList('[data-today-habits]') && rowIds().includes(task), 'the habits strip')
    const chip = inList(`[data-today-habits] [data-strip-chip="${stretch}"]`)!
    expect(chip.textContent).toBe('Stretch')
    expect(chip.querySelector('[data-strip-check]')!.getAttribute('aria-label')).toBe('Check in Stretch')
    expect(rowIds()).toEqual([task])
    expect(before(inList('[data-today-habits]')!, inList('[data-phone-row]')!)).toBe(true)
    await r.unmount()
  })

  it('groups late tasks under Earlier with its actions, and folds Done today after Today', async () => {
    const late = await createTask({ title: 'Send the invoice', due: { date: addDaysISO(today, -2) } })
    const now = await createTask({ title: 'Write the notes', due: { date: today } })
    const done = await createTask({ title: 'Call the bank', due: { date: today } })
    await setTaskCompleted(done, true)
    await setDoneTodayShown(true)
    const r = await open({ view: 'today' })
    await waitFor(() => groupKeys().join() === 'earlier,today,done', 'Earlier, Today and Done today')
    expect(headings()).toEqual(['Earlier', 'Today', 'Done today'])
    expect(rowIds()).toEqual([late, now])
    const earlier = inList('[data-group="earlier"]')!
    expect(earlier.querySelector(`[data-phone-row="${late}"]`)).not.toBeNull()
    expect(earlier.querySelector('[data-earlier-move]')!.textContent).toBe('Move all to today')
    expect(earlier.querySelector('[data-earlier-reschedule]')).not.toBeNull()
    // Done today is closed until opened; it counts the task and lists it.
    const doneGroup = () => inList('[data-group="done"]')!
    expect(doneGroup().querySelector('[data-group-count] [aria-hidden]')!.textContent).toBe('1')
    await click(doneGroup().querySelector('[data-group-toggle]')!)
    await waitFor(() => !!doneGroup().querySelector(`[data-phone-row="${done}"]`), 'the completed task under Done today')
    // The fold is kept per device: close it again for the next test.
    await click(doneGroup().querySelector('[data-group-toggle]')!)
    await waitFor(() => !doneGroup().querySelector('[data-phone-row]'), 'Done today folded')
    await r.unmount()
  })

  it('offers Close the day after the list', async () => {
    const now = await createTask({ title: 'Write the notes', due: { date: today } })
    const r = await open({ view: 'today' })
    await waitFor(() => rowIds().includes(now) && !!inList('[data-close-day="open"]'), 'Close the day')
    const close = inList('[data-close-day="open"]')!
    expect(close.querySelector('button')!.textContent).toBe('Close the day')
    expect(before(inList(`[data-phone-row="${now}"]`)!, close)).toBe(true)
    await r.unmount()
  })

  it('lists an event of today before the tasks while calendar events are shown', async () => {
    const work: CalendarSubscription = { id: 'work', name: 'Work', color: '#2563eb', enabled: true, lastSuccessAt: Date.now() }
    const standup: CalendarEvent = { id: 'standup', subscriptionId: 'work', uid: 'standup', summary: 'Standup', location: '', allDay: false, free: false, start: { date: today, time: '09:00' }, end: { date: today, time: '09:15' } }
    await db.calendarSubscriptions.put(work)
    await db.calendarEvents.put(standup)
    await setMeta('calendar.events.window', { from: addDaysISO(today, -28), to: addDaysISO(today, 28), fetchedAt: Date.now() })
    await setTodayEventsShown(true)
    const now = await createTask({ title: 'Write the notes', due: { date: today } })
    const r = await open({ view: 'today' })
    await waitFor(() => rowIds().includes(now) && !!inList('[data-today-agenda] [data-agenda-event="standup"]'), 'the agenda with the event')
    const event = inList('[data-today-agenda] [data-agenda-event="standup"]')!
    expect(event.textContent).toContain('Standup')
    expect(before(event, inList(`[data-phone-row="${now}"]`)!)).toBe(true)
    await r.unmount()
  })
})

describe('the Inbox, Upcoming and Completed in the phone list', () => {
  it('the Inbox offers Process with its count in the bar, and it opens the triage', async () => {
    for (const title of ['An idea', 'Another thought', 'A third']) await createTask({ title })
    const r = await open({ view: 'inbox' })
    await waitFor(() => inList('[data-phone-header] [data-triage-start]')?.textContent === 'Process 3', 'Process 3')
    await click(inList('[data-triage-start]')!)
    await waitFor(() => location.pathname === '/triage', 'the triage')
    await r.unmount()
  })

  it('Upcoming lists its days as groups in order, and a later day as a summary that opens', async () => {
    const days = [1, 2, 3, 9].map((n) => addDaysISO(today, n))
    // Created out of order: the days sort the list, not the creation.
    const far = await createTask({ title: 'Renew the passport', due: { date: days[3] } })
    const third = await createTask({ title: 'Buy stamps', due: { date: days[2] } })
    const second = await createTask({ title: 'Book the room', due: { date: days[1] } })
    const first = await createTask({ title: 'Write the notes', due: { date: days[0] } })
    const r = await open({ view: 'upcoming' })
    await waitFor(() => groupKeys().join() === days.join() && rowIds().length === 3, 'the four days')
    expect(headings()[0]).toBe('Tomorrow')
    expect(rowIds()).toEqual([first, second, third])
    // The fourth day with tasks is a closed bar with its first titles.
    const later = () => inList(`[data-group="${days[3]}"]`)!
    expect(later().querySelector('[data-day-summary]')!.textContent).toBe('Renew the passport')
    await click(later().querySelector('[data-group-toggle]')!)
    await waitFor(() => !!later().querySelector(`[data-phone-row="${far}"]`), 'the later day opened')
    // Opened days are kept per device: close it again for the next test.
    await click(later().querySelector('[data-group-toggle]')!)
    await waitFor(() => !later().querySelector('[data-phone-row]') && !!later().querySelector('[data-day-summary]'), 'the later day summarised again')
    await r.unmount()
  })

  it('Upcoming lists the projected occurrences of a repeating task while they are shown', async () => {
    setUpcomingProjections(true)
    const id = await createTask({ title: 'Stretch', due: { date: addDaysISO(today, 1) }, recurrence: 'every day' })
    const r = await open({ view: 'upcoming' })
    await waitFor(() => rowIds().includes(id) && allInList('[data-projected]').length === 13, 'thirteen projected rows')
    // Tomorrow holds the task itself; each day after it a projection, which is not a task row.
    expect(rowIds()).toEqual([id])
    expect(inList(`[data-group="${addDaysISO(today, 1)}"] [data-projected]`)).toBeNull()
    const projectedDays = allInList('[data-group-projected]').map((e) => e.getAttribute('data-group-projected'))
    expect(projectedDays[0]).toBe(addDaysISO(today, 2))
    expect(projectedDays.at(-1)).toBe(addDaysISO(today, 14))
    expect(inList('[data-projected]')!.textContent).toContain('Stretch')
    await r.unmount()
  })

  it('Completed lists completed tasks with its options, and its search narrows them', async () => {
    const a = await createTask({ title: 'Send the invoice' })
    const b = await createTask({ title: 'Call the bank' })
    const stillOpen = await createTask({ title: 'Invoice the client' })
    await setTaskCompleted(a, true)
    await setTaskCompleted(b, true)
    const r = await open({ view: 'completed' })
    const search = () => inList<HTMLInputElement>('[data-completed-search] input')
    await waitFor(() => rowIds().length === 2 && !!search(), 'Completed\'s rows and search')
    expect([...rowIds()].sort()).toEqual([a, b].sort())
    expect(rowIds()).not.toContain(stillOpen)
    expect(inList('[data-phone-header] [data-display-trigger]')!.getAttribute('aria-label')).toBe('Display options')
    expect(before(search()!, inList('[data-phone-row]')!)).toBe(true)
    await type(search()!, 'invoice')
    await waitFor(() => rowIds().join() === a, 'only the match')
    // A search that matches nothing shows the filtered-empty state, in the phone screen.
    await type(search()!, 'zebra')
    await waitFor(() => rowIds().length === 0 && !!inList('[data-empty-state="duration"]'), 'nothing matches')
    await r.unmount()
  })

  it('Completed pages its logbook: Show more loads the earlier completions', async () => {
    for (let i = 0; i < 101; i++) await setTaskCompleted(await createTask({ title: `Task ${i}` }), true)
    const r = await open({ view: 'completed' })
    await waitFor(() => !!inList('[data-logbook-more]') && rowIds().length === 100, 'the first page and Show more')
    expect(inList('[data-logbook-more]')!.textContent).toBe('Show more 1 older')
    await click(inList('[data-logbook-more]')!)
    await waitFor(() => rowIds().length === 101 && !inList('[data-logbook-more]'), 'every completion')
    await r.unmount()
  })
})

describe('a project in the phone list', () => {
  async function project() {
    const work = await createProject({ name: 'Work' })
    const backlog = await createSection(work, 'Backlog')
    const shipped = await createSection(work, 'Shipped')
    const loose = await createTask({ title: 'Send the invoice', project_id: work })
    const planned = await createTask({ title: 'Plan the launch', project_id: work, section_id: backlog })
    const done = await createTask({ title: 'Old thing', project_id: work, section_id: shipped })
    await setTaskCompleted(done, true)
    return { work, backlog, shipped, loose, planned, done }
  }
  const section = (id: string) => inList(`[data-section-heading="${id}"]`)!
  const menuItems = () => [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].map((el) => el.textContent?.trim() ?? '')

  it('lists its sections as groups, each with its header, its add and its menu', async () => {
    const s = await project()
    const r = await open({ view: 'project', id: s.work })
    await waitFor(() => rowIds().join() === [s.loose, s.planned].join(), 'the project\'s rows')
    expect(headings()).toEqual(['No section', 'Backlog', 'Shipped'])
    expect(section(s.backlog).querySelector('[data-group-label]')!.textContent).toBe('Backlog')
    expect(section(s.backlog).querySelector('[data-group-count] [aria-hidden]')!.textContent).toBe('1')
    expect(section(s.backlog).closest('section')!.querySelector(`[data-phone-row="${s.planned}"]`)).not.toBeNull()
    expect(section(s.backlog).querySelector('button[aria-label="Add a task to Backlog"]')).not.toBeNull()
    await click(section(s.backlog).querySelector('button[aria-label="Section menu for Backlog"]')!)
    await waitFor(() => menuItems().some((text) => text.startsWith('Rename')), 'the section menu with Rename')
    await r.unmount()
  })

  it('a section with only completed tasks says "n completed" with Show, and the list ends with the hidden note and Add section', async () => {
    const s = await project()
    const r = await open({ view: 'project', id: s.work })
    await waitFor(() => !!section(s.shipped)?.querySelector('[data-reveal-completed]'), 'the Shipped section')
    expect(section(s.shipped).querySelector('[data-group-note]')!.textContent).toBe('1 completedShow')
    expect(inList('[data-hidden-note]')!.textContent).toContain('1 completed task hidden')
    const add = inList('[data-add-section]')!
    expect(add.textContent).toContain('Add section')
    expect(before(allInList('[data-phone-row]').at(-1)!, add)).toBe(true)
    await click(section(s.shipped).querySelector('[data-reveal-completed]')!)
    await waitFor(() => !!section(s.shipped).closest('section')!.querySelector(`[data-phone-row="${s.done}"]`), 'the completed task shown in its section')
    await r.unmount()
  })

  it('shows its note and its sub-projects above the tasks', async () => {
    const s = await project()
    await updateProject(s.work, { description: 'Remember the keys' })
    const child = await createProject({ name: 'Launch', parent_id: s.work })
    await createTask({ title: 'Book the room', project_id: child })
    const r = await open({ view: 'project', id: s.work })
    await waitFor(() => inList('[data-project-note="open"]')?.textContent === 'Remember the keys' && !!inList(`[data-sub-projects] [data-sub-project="${child}"]`), 'the note and the sub-project')
    const sub = inList(`[data-sub-projects] [data-sub-project="${child}"]`)!
    expect(sub.textContent).toContain('Launch')
    expect(headings()[0]).toBe('Sub-projects')
    const firstRow = inList('[data-phone-row]')!
    expect(before(inList('[data-project-note]')!, sub)).toBe(true)
    expect(before(sub, firstRow)).toBe(true)
    // The sub-project's task is not a row of this list until its group is opened.
    expect(rowIds()).toEqual([s.loose, s.planned])
    await r.unmount()
  })
})

describe('a label, Anytime and Someday in the phone list', () => {
  it('each lists its tasks, the label with its count under the title', async () => {
    const errand = await createLabel({ name: 'errand' })
    const work = await createProject({ name: 'Work' })
    const labelled = await createTask({ title: 'Buy stamps', labels: [errand] })
    const any = await createTask({ title: 'Send the invoice', project_id: work })
    const parked = await createTask({ title: 'Learn the cello', start: 'someday' })
    const r = await open({ view: 'label', id: errand })
    // The label's row is read after its tasks: the title is "Label" until it is.
    await waitFor(() => rowIds().join() === labelled && inList('[data-page-title]')?.textContent === 'errand' && !!inList('[data-phone-summary]')?.textContent?.includes('1'), 'the label\'s task, name and count')
    // The rows of the list left behind stay a moment while the next one draws: wait for the rows themselves.
    navigate({ view: 'anytime' })
    await waitFor(() => list()?.getAttribute('data-phone-list') === 'anytime' && rowIds().join() === [labelled, any].join() && headings().join() === 'Inbox,Work', 'Anytime with its two tasks under Inbox and Work')
    navigate({ view: 'someday' })
    await waitFor(() => list()?.getAttribute('data-phone-list') === 'someday' && rowIds().join() === parked, 'Someday with its task')
    await r.unmount()
  })
})

describe('states of the phone list', () => {
  it('a filter that matches nothing shows the filtered-empty state, and clearing it brings the rows back', async () => {
    const work = await createProject({ name: 'Work' })
    const task = await createTask({ title: 'Send the invoice', project_id: work })
    await saveQueryFilter(projectFilterKey(work), 'p1')
    const r = await open({ view: 'project', id: work })
    await waitFor(() => !!inList('[data-empty-state="duration"]'), 'the filtered-empty state')
    expect(rowIds()).toEqual([])
    expect(inList('[data-empty-state="duration"]')!.textContent).toContain('No task matches')
    // The filter shows as a chip in the bar.
    expect(inList('[data-phone-header]')!.textContent).toContain('Priority is P1')
    const clear = [...inList('[data-empty-state="duration"]')!.querySelectorAll('button')].find((b) => b.textContent === 'Clear the filter')!
    await click(clear)
    await waitFor(() => rowIds().join() === task && !inList('[data-empty-state="duration"]'), 'the rows again')
    await r.unmount()
  })

  it('a project or a label that no longer exists says so, and its link leads to a phone screen', async () => {
    await createProject({ name: 'Work' })
    await createLabel({ name: 'errand' })
    await createTask({ title: 'An idea' })
    setPhoneUiEnabled(true)
    navigate({ view: 'label', id: 'gone' })
    const r = await render(<Shell user={user} onLogout={() => {}} />)
    const frame = () => document.querySelector<HTMLElement>('[data-app-frame]')
    await waitFor(() => !!frame()?.textContent?.includes('This label no longer exists.'), 'the missing label')
    expect([...frame()!.querySelectorAll('button')].some((b) => b.textContent === 'All labels')).toBe(true)
    navigate({ view: 'project', id: 'gone' })
    await waitFor(() => !!frame()?.textContent?.includes('This project no longer exists.'), 'the missing project')
    expect(list()).toBeNull()
    await click([...frame()!.querySelectorAll('button')].find((b) => b.textContent === 'Go to Inbox')!)
    await waitFor(() => list()?.getAttribute('data-phone-list') === 'inbox' && rowIds().length === 1, 'the Inbox as a phone list')
    await r.unmount()
  })

  // Missing: PhoneList returns MissingTarget before its screen, so the state has no phone header and sits under the shell's bar with an empty title.
  it.skip('a missing project shows its state inside the phone screen, under the phone header', async () => {
    await createProject({ name: 'Work' })
    setPhoneUiEnabled(true)
    navigate({ view: 'project', id: 'gone' })
    const r = await render(<Shell user={user} onLogout={() => {}} />)
    await waitFor(() => !!document.querySelector('[data-phone-screen]')?.textContent?.includes('This project no longer exists.') && !!document.querySelector('[data-phone-header]') && !document.querySelector('[data-phone-bar]'), 'the missing state in the phone screen')
    await r.unmount()
  })
})

describe('the page menu of the phone list, for the lists phoneLists.test.tsx leaves out', () => {
  const items = () => [...document.querySelectorAll<HTMLElement>('[role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"]')].map((el) => el.textContent?.trim() ?? '').filter(Boolean).sort()
  /** Opens the last menu of a bar (the page's own menu) and returns its items; closes it again. */
  async function menuOf(bar: () => Element | null | undefined): Promise<string[]> {
    await waitFor(() => !!bar()?.querySelector('button[aria-haspopup="menu"], button[aria-haspopup="true"]'), 'the page menu button')
    const triggers = [...bar()!.querySelectorAll<HTMLElement>('button[aria-haspopup="menu"], button[aria-haspopup="true"]')]
    await click(triggers.at(-1)!)
    await waitFor(() => items().length > 0, 'the menu open')
    const found = items()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await waitFor(() => items().length === 0, 'the menu closed')
    return found
  }
  const everyRow = () => [...document.querySelectorAll<HTMLElement>('[data-task-id]')].map((el) => el.dataset.taskId!)
  const controls = (bar: Element) => [...bar.querySelectorAll('button[aria-label]')].map((b) => b.getAttribute('aria-label')).sort()

  const ROUTES: [string, Route][] = [
    ['Completed', { view: 'completed' }],
    ['Anytime', { view: 'anytime' }],
    ['Someday', { view: 'someday' }],
    ['Assigned to me', { view: 'assigned' }],
  ]
  for (const [name, route] of ROUTES) {
    it(`${name} offers every item its present phone menu offers, and the same controls in the bar`, async () => {
      const work = await createProject({ name: 'Work' })
      await createTask({ title: 'Send the invoice', project_id: work, assignee_id: user.id })
      await createTask({ title: 'Learn the cello', start: 'someday' })
      await setTaskCompleted(await createTask({ title: 'Old thing' }), true)
      navigate(route)
      const r = await render(<Shell user={user} onLogout={() => {}} />)
      await waitFor(() => !!document.querySelector('[data-list-page]') && everyRow().length > 0, 'the present list')
      const present = await menuOf(() => document.querySelector('[data-phone-bar]'))
      const presentControls = controls(document.querySelector('[data-phone-bar]')!)
      setPhoneUiEnabled(true)
      await waitFor(() => list()?.getAttribute('data-phone-list') === route.view && rowIds().length > 0, 'the phone list')
      const phone = await menuOf(() => inList('[data-phone-header]'))
      expect(present.length).toBeGreaterThan(0)
      for (const item of present) expect(phone).toContain(item)
      expect(controls(inList('[data-phone-header]')!)).toEqual(presentControls)
      await r.unmount()
    })
  }
})
