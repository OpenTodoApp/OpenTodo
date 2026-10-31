// @vitest-environment happy-dom
// Board polish (OpenSpec change board-polish; GitHub issue 561): a column folds to a
// strip from its menu or with `z`, per device and shared with the list's collapsed
// section, never written to the op log; a folded strip stays a drop target and a
// keyboard move target; and the opt-in notes preview on cards.
import 'fake-indexeddb/auto'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db, getMeta } from '../lib/db'
import { createProject, createTask, mutate, resetDeviceId } from '../lib/ops'
import { createSection, loadCollapsedSections, prefKeys, saveViewMode, setSectionCollapsed } from '../lib/sections'
import { click, flush, key, render, spokenText, waitFor } from '../ui/test-utils'
import { resetPanel } from './panel'
import { TaskListView } from './TaskListView'

beforeEach(async () => {
  await db.delete()
  await db.open()
  resetDeviceId()
  resetPanel()
  localStorage.clear()
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })))
})
afterEach(() => {
  vi.unstubAllGlobals()
})

async function board(opts: { notes?: string } = {}) {
  const p = await createProject({ name: 'Garden' })
  const doing = await createSection(p, 'Doing')
  const done = await createSection(p, 'Done')
  const a = await createTask({ title: 'Plant tomatoes', project_id: p, section_id: doing, description: opts.notes ?? '' })
  const b = await createTask({ title: 'Water', project_id: p, section_id: doing })
  await createTask({ title: 'Buy seeds', project_id: p, section_id: done })
  await saveViewMode(p, 'board')
  return { p, doing, done, a, b }
}

async function open(p: string, ready: string) {
  const r = await render(<TaskListView route={{ view: 'project', id: p }} />)
  await waitFor(() => r.container.querySelector(ready) !== null, ready)
  return r
}

const strip = (root: ParentNode, key: string) => root.querySelector<HTMLButtonElement>(`[data-column-strip="${key}"]`)
const outbox = () => db.outbox.count()

async function chooseFold(root: ParentNode, name: string) {
  await click(root.querySelector(`button[aria-label="Section menu for ${name}"]`)!)
  await waitFor(() => !!document.querySelector('[data-menu-label="Fold column"]'), 'Fold column in the column menu')
  await click(document.querySelector('[data-menu-label="Fold column"]')!)
}

describe('folding a board column', () => {
  it('Fold column turns Done into a strip named with its count, collapsed in the list on this device, with no op queued', async () => {
    const { p, done } = await board()
    const r = await open(p, `[data-column="${done}"] [data-task-id]`)
    const before = await outbox()
    await chooseFold(r.container, 'Done')
    await waitFor(() => strip(r.container, done) !== null, 'the strip')
    const s = strip(r.container, done)!
    expect(s.getAttribute('aria-expanded')).toBe('false')
    expect(s.getAttribute('aria-label')).toBe('Done, 1 open task, folded')
    expect(s.closest('[data-column]')!.className).toContain('ui-column-strip')
    expect(r.container.querySelector(`[data-column="${done}"] [data-task-id]`)).toBeNull()
    expect(await loadCollapsedSections(p)).toEqual([done])
    expect(await outbox()).toBe(before)
    // The same state in the list layout.
    await saveViewMode(p, 'list')
    await waitFor(() => !!r.container.querySelector(`[data-section-heading="${done}"]`), 'the list')
    await waitFor(() => r.container.querySelector(`[data-section-heading="${done}"] [aria-expanded="false"]`) !== null, 'Done collapsed in the list')
    await r.unmount()
  })

  it('a section collapsed in the list is folded on the board, and the strip unfolds it', async () => {
    const { p, done } = await board()
    await setSectionCollapsed(p, done, true)
    const r = await open(p, `[data-column-strip="${done}"]`)
    await click(strip(r.container, done)!)
    await waitFor(() => r.container.querySelector(`[data-column="${done}"] [data-task-id]`) !== null, 'unfolded')
    expect(await getMeta(prefKeys.collapsed(p), null)).toEqual([])
    await r.unmount()
  })

  it('z folds the selected card\'s column and selects the first card of the next one; Enter on the strip unfolds it', async () => {
    const { p, doing, done, a } = await board()
    const r = await open(p, `[data-task-id="${a}"]`)
    await click(r.container.querySelector(`[data-task-id="${a}"] [data-row-open]`)!)
    await waitFor(() => r.container.querySelector(`[data-task-id="${a}"]`)?.getAttribute('aria-current') === 'true', 'selected')
    await key(document.activeElement ?? document.body, 'z')
    await waitFor(() => strip(r.container, doing) !== null, 'Doing folded')
    await waitFor(() => r.container.querySelector(`[data-column="${done}"] [aria-current="true"]`) !== null, 'the next column\'s first card selected')
    // `h` skips the folded column: the selection stays in Done.
    await key(document.activeElement ?? document.body, 'h')
    await flush()
    expect(r.container.querySelector(`[data-column="${done}"] [aria-current="true"]`)).not.toBeNull()
    // The strip is a button: Enter (a click) unfolds it.
    strip(r.container, doing)!.focus()
    await click(strip(r.container, doing)!)
    await waitFor(() => r.container.querySelector(`[data-column="${doing}"] [data-task-id="${a}"]`) !== null, 'unfolded')
    await r.unmount()
  })

  it('z on a focused strip unfolds it', async () => {
    const { p, done } = await board()
    await setSectionCollapsed(p, done, true)
    const r = await open(p, `[data-column-strip="${done}"]`)
    strip(r.container, done)!.focus()
    await key(strip(r.container, done)!, 'z')
    await waitFor(() => strip(r.container, done) === null, 'unfolded')
    await r.unmount()
  })
})

const pointer = (type: string, x: number, y: number) => new PointerEvent(type, { bubbles: true, pointerId: 1, pointerType: 'mouse', button: 0, clientX: x, clientY: y })

describe('moving into a folded column', () => {
  it('a card dropped on the strip lands last in Done, which stays folded with 2', async () => {
    const { p, done, a } = await board()
    await setSectionCollapsed(p, done, true)
    const r = await open(p, `[data-column-strip="${done}"]`)
    const li = r.container.querySelector<HTMLElement>(`[data-task-id="${a}"]`)!
    const column = strip(r.container, done)!.closest<HTMLElement>('[data-column]')!
    document.elementFromPoint = () => column
    await act(async () => {
      li.dispatchEvent(pointer('pointerdown', 10, 10))
      window.dispatchEvent(pointer('pointermove', 300, 80))
    })
    await flush()
    // The strip shows the placeholder's dashed edge along its length, no card-height placeholder.
    expect(column.hasAttribute('data-drop-over')).toBe(true)
    expect(r.container.querySelector('[data-drop-placeholder]')).toBeNull()
    await act(async () => { window.dispatchEvent(pointer('pointerup', 300, 80)) })
    await waitFor(async () => (await db.tasks.get(a))!.section_id === done, 'the move')
    await waitFor(() => strip(r.container, done)?.getAttribute('aria-label') === 'Done, 2 open tasks, folded', 'the count')
    const moved = (await db.tasks.get(a))!
    const other = (await db.tasks.where('section_id').equals(done).filter((x) => x.id !== a).first())!
    expect(moved.position).toBeGreaterThan(other.position)
    await r.unmount()
  })

  it('Shift+→ from the last card of Doing moves it into folded Done, selects the previous card and announces it', async () => {
    const { p, doing, done, b } = await board()
    await setSectionCollapsed(p, done, true)
    const r = await open(p, `[data-task-id="${b}"]`)
    const cards = [...r.container.querySelectorAll(`[data-column="${doing}"] [data-task-id]`)].map((x) => x.getAttribute('data-task-id'))
    const last = cards[cards.length - 1]!, prev = cards[cards.length - 2]!
    await click(r.container.querySelector(`[data-task-id="${last}"] [data-row-open]`)!)
    await waitFor(() => r.container.querySelector(`[data-task-id="${last}"]`)?.getAttribute('aria-current') === 'true', 'selected')
    await key(document.activeElement ?? document.body, 'ArrowRight', { shiftKey: true })
    await waitFor(async () => (await db.tasks.get(last))!.section_id === done, 'moved')
    await waitFor(() => r.container.querySelector(`[data-task-id="${prev}"]`)?.getAttribute('aria-current') === 'true', 'the previous card selected')
    expect(r.container.querySelector('[data-board-announce]')!.textContent).toBe('Moved to Done')
    expect(strip(r.container, done)).not.toBeNull()
    await r.unmount()
  })

  it('a viewer can fold but a drag over a strip shows nothing and writes nothing', async () => {
    const { p, done, a } = await board()
    await db.memberships.put({ projectId: p, role: 'viewer', ownerId: 'someone', members: [] })
    const r = await open(p, `[data-task-id="${a}"]`)
    await chooseFold(r.container, 'Done')
    await waitFor(() => strip(r.container, done) !== null, 'folded by a viewer')
    const column = strip(r.container, done)!.closest<HTMLElement>('[data-column]')!
    const li = r.container.querySelector<HTMLElement>(`[data-task-id="${a}"]`)!
    document.elementFromPoint = () => column
    const before = await outbox()
    await act(async () => {
      li.dispatchEvent(pointer('pointerdown', 10, 10))
      window.dispatchEvent(pointer('pointermove', 300, 80))
    })
    await flush()
    expect(column.hasAttribute('data-drop-over')).toBe(false)
    await act(async () => { window.dispatchEvent(pointer('pointerup', 300, 80)) })
    await flush()
    expect((await db.tasks.get(a))!.section_id).not.toBe(done)
    expect(await outbox()).toBe(before)
    await r.unmount()
  })
})

describe('notes preview on cards', () => {
  it('is off by default; Show notes on cards writes project_prefs.card_notes and cards show the plain text after the title', async () => {
    const { p, a, b } = await board({ notes: '# Plan\n\n- [ ] call **Marco** about the [quote](https://example.com)' })
    const r = await open(p, `[data-task-id="${a}"]`)
    expect(r.container.querySelector('[data-card-notes]')).toBeNull()
    await click(r.container.querySelector('button[aria-label="Project menu"]')!)
    await waitFor(() => !!document.querySelector('[data-menu-label="Show notes on cards"]'), 'the menu item')
    await click(document.querySelector('[data-menu-label="Show notes on cards"]')!)
    await waitFor(() => r.container.querySelector(`[data-task-id="${a}"] [data-card-notes]`) !== null, 'the preview')
    const notes = r.container.querySelector(`[data-task-id="${a}"] [data-card-notes]`)!
    expect(notes.textContent).toBe('Notes: Plan · call Marco about the quote')
    expect(notes.className).toContain('line-clamp-2')
    // Part of the card's accessible name, after the title; a card without notes has no empty line.
    const spoken = spokenText(r.container.querySelector(`[data-task-id="${a}"] [data-row-open]`)!)
    expect(spoken.indexOf('Plant tomatoes')).toBeLessThan(spoken.indexOf('Notes: Plan'))
    expect(r.container.querySelector(`[data-task-id="${b}"] [data-card-notes]`)).toBeNull()
    expect((await db.prefs.get(p))?.card_notes).toBe(true)
    const op = await db.outbox.filter((o) => o.entity === 'project_prefs' && o.entityId === p).last()
    expect(op?.field).toBe('card_notes')
    await r.unmount()
  })

  it('notes still ciphertext on this device show no preview line', async () => {
    const { p, a } = await board({ notes: 'enc:v1:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' })
    await mutate('project_prefs', p, { card_notes: true })
    await db.tasks.update(a, { _e2ee: { raw: { description: 'enc:v1:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' } } } as never)
    const r = await open(p, `[data-task-id="${a}"]`)
    await flush()
    expect(r.container.querySelector('[data-card-notes]')).toBeNull()
    expect(r.container.textContent).not.toContain('enc:v1')
    await r.unmount()
  })
})
