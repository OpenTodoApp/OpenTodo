// @vitest-environment happy-dom
// Daily notes (OpenSpec change daily-notes, tasks 2.2 and 3.1): "Browse without
// writing", "First keystroke", "Setting off" and "Turn on offline".
import 'fake-indexeddb/auto'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { dailyNoteId } from '../../lib/dailyNotes'
import { setDateTime } from '../../lib/dates'
import { db, useDatabase } from '../../lib/db'
import { mutate, resetDeviceId } from '../../lib/ops'
import { setCurrentUserId } from '../../lib/sharing'
import { USER_PREFS_ID } from '../../lib/userPrefs'
import { click, flush, key, minWidthPx, render, waitFor } from '../../ui/test-utils'
import { DailyNotesSection } from '../DailyNotesSettings'
import { navigate, useRoute } from '../router'
import { installShortcutDispatcher, resetShortcutScopes } from '../shortcuts'
import { NotesPage } from './NotesPage'
import { commands, type PaletteContext } from '../palette/registry'
import { TodayNoteAction } from '../task-list/ListChrome'

const original = window.matchMedia
let run = 0
let release: () => void = () => {}

beforeEach(async () => {
  // A phone: the daily note is a page.
  window.matchMedia = ((q: string) => ({
    matches: minWidthPx(q) <= 390, media: q, onchange: null,
    addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false,
  })) as typeof window.matchMedia
  useDatabase(`daily-note-${run++}`)
  resetDeviceId()
  setDateTime({ date_format: 'day-month', time_format: '24h', week_start: 'mon' })
  await setCurrentUserId('u1')
  localStorage.clear()
  history.replaceState(null, '', '/notes')
  release = installShortcutDispatcher()
})
afterEach(() => {
  release()
  resetShortcutScopes()
  window.matchMedia = original
  document.body.innerHTML = ''
})

/** The Notes page at the route's day, as the shell renders it. */
function Routed() {
  const r = useRoute()
  return r.view === 'notes' ? <NotesPage id={r.id} day={r.day} /> : null
}

describe('a daily note', () => {
  it('"Browse without writing": opening a day and moving back three days writes nothing', async () => {
    await mutate('user_prefs', USER_PREFS_ID, { daily_notes: true, daily_notes_template: 'none' })
    const outbox = await db.outbox.count()
    await act(async () => navigate({ view: 'notes', day: '2026-11-12' }))
    const { container } = await render(<Routed />)
    await waitFor(() => !!container.querySelector('[data-daily-draft="2026-11-12"]'), 'the draft')
    for (let i = 0; i < 3; i++) await key(document, '[')
    await waitFor(() => !!container.querySelector('[data-daily-draft="2026-11-09"]'), 'three days earlier')
    await flush()
    expect(await db.notes.count()).toBe(0)
    expect(await db.outbox.count()).toBe(outbox)
  })

  it('"First keystroke": typing in the draft creates the day\'s note with the text', async () => {
    await mutate('user_prefs', USER_PREFS_ID, { daily_notes: true, daily_notes_template: 'none' })
    await act(async () => navigate({ view: 'notes', day: '2026-11-12' }))
    const { container } = await render(<Routed />)
    await waitFor(() => !!container.querySelector('[data-daily-draft] [role="textbox"]'), 'the draft')
    await key(container.querySelector('[data-daily-draft] [role="textbox"]')!, 'S')
    const id = dailyNoteId('u1', '2026-11-12')
    await waitFor(async () => !!(await db.notes.get(id)), 'the note written')
    const note = (await db.notes.get(id))!
    expect(note.day).toBe('2026-11-12')
    await waitFor(() => !!container.querySelector('[data-note-form]'), 'the note opens as a note')
  })
})

describe('"Setting off"', () => {
  const ctx = (dailyNotes: boolean) => ({ route: { view: 'today' }, user: null, today: '2026-11-12', list: null, filterQuery: null, query: '', vimEnabled: false, showShortcuts: () => {}, focusQuickAdd: () => false, dailyNotes }) as unknown as PaletteContext
  it('offers no "Open today\'s note" and no Today button while off', async () => {
    expect(commands(ctx(false)).some((c) => c.id === 'go:daily-note')).toBe(false)
    expect(commands(ctx(true)).some((c) => c.id === 'go:daily-note')).toBe(true)
    const { container } = await render(<TodayNoteAction />)
    await flush()
    expect(container.querySelector('[data-today-note]')).toBeNull()
    await mutate('user_prefs', USER_PREFS_ID, { daily_notes: true })
    await waitFor(() => !!container.querySelector('[data-today-note]'), 'the Today button once on')
  })
})

describe('Settings › General › Notes', () => {
  it('"Turn on offline": the switch writes the setting at once and shows project and template', async () => {
    const { container } = await render(<DailyNotesSection />)
    await waitFor(() => !!container.querySelector('#daily-notes-switch'), 'the switch')
    expect(container.querySelector('[data-daily-notes-template]')).toBeNull()
    await click(container.querySelector('#daily-notes-switch')!)
    await waitFor(async () => (await db.userPrefs.get(USER_PREFS_ID))?.daily_notes === true, 'the setting')
    await waitFor(() => !!container.querySelector('[data-daily-notes-template]'), 'the template choice')
  })
})
