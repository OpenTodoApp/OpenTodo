// @vitest-environment happy-dom
// No style rule re-matches the whole list on a change in it (issue 1179): a `:has()` rule
// whose subject holds the 2,000-row list (#content, the app frame, the root) makes the
// browser match it again on every change inside the list. Two such rules, the selection
// bar's room (no-layout-jump) and Focus's break tone (focus-redesign), took a completion
// in the 2,000-row list from about 70 to 440 ms in the phone profile while every count of
// React renders stayed the same. Here the list is drawn in the shell's frame with the
// selection bar showing, and the subject of every `:has()` of the stylesheet may hold one
// row block at most. The root marks that replaced them are checked as well.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useDatabase } from '../lib/db'
import { applyOps, createProject, resetDeviceId } from '../lib/ops'
import type { Op } from '../lib/types'
import { key, mockFetch, noPublicLinks, render, waitFor } from '../ui/test-utils'
import { BLOCK_ROWS } from './task-list/rowBlocks'
import { TaskListView } from './TaskListView'
import css from '../index.css?raw'

const ROWS = 2000

/** Splits a selector list at its top-level commas. */
function selectorList(list: string): string[] {
  const out: string[] = []
  let depth = 0
  let from = 0
  for (let i = 0; i < list.length; i++) {
    const c = list[i]
    if (c === '(' || c === '[') depth++
    else if (c === ')' || c === ']') depth--
    else if (c === ',' && depth === 0) { out.push(list.slice(from, i).trim()); from = i + 1 }
  }
  out.push(list.slice(from).trim())
  return out.filter(Boolean)
}

/** The subject of each top-level `:has(` of a selector (one inside `:is()`, `:where()` or `:not()` is scoped by that compound). */
function subjectsOf(selector: string): string[] {
  const out: string[] = []
  let depth = 0
  for (let i = 0; i < selector.length; i++) {
    const c = selector[i]
    if (depth === 0 && selector.startsWith(':has(', i)) {
      const before = selector.slice(0, i)
      out.push(!before.trim() || /[\s>+~]$/.test(before) ? `${before.trim()} *`.trim() : before.trim())
    }
    if (c === '(' || c === '[') depth++
    else if (c === ')' || c === ']') depth--
  }
  return out
}

/** The `:has()` rules of the stylesheet's source, nested blocks included, `@media print` left out (nothing changes while printing). */
function hasRules(source: string): { selector: string; subject: string }[] {
  const src = source.replace(/\/\*[\s\S]*?\*\//g, '')
  const stack: boolean[] = []
  const out: { selector: string; subject: string }[] = []
  let from = 0
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (c === '{') {
      const prelude = src.slice(from, i).trim()
      const print = (stack.at(-1) ?? false) || /^@media\s+print\b/.test(prelude)
      stack.push(print)
      if (!print && !prelude.startsWith('@') && prelude.includes(':has(')) {
        for (const selector of selectorList(prelude)) for (const subject of subjectsOf(selector)) out.push({ selector, subject })
      }
      from = i + 1
    } else if (c === '}' || c === ';') {
      if (c === '}') stack.pop()
      from = i + 1
    }
  }
  return out
}

beforeEach(() => {
  useDatabase(`style-scope-${Date.now()}`)
  resetDeviceId()
  localStorage.clear()
  mockFetch(noPublicLinks)
})
afterEach(() => { vi.unstubAllGlobals() })

async function seed(count: number, projectId: string) {
  const ops: Op[] = []
  for (let i = 0; i < count; i++) {
    const id = `t${String(i).padStart(5, '0')}`
    ops.push({ id: `s-${i}-t`, entity: 'task', entityId: id, field: 'title', value: `Task ${i}`, ts: 100, device: 'seed' })
    ops.push({ id: `s-${i}-p`, entity: 'task', entityId: id, field: 'position', value: i + 1, ts: 100, device: 'seed' })
    ops.push({ id: `s-${i}-j`, entity: 'task', entityId: id, field: 'project_id', value: projectId, ts: 100, device: 'seed' })
  }
  await applyOps(ops)
}

describe('style rules at scale', () => {
  it('the stylesheet has `:has()` rules to check (the parser reads it)', () => {
    const rules = hasRules(css)
    expect(rules.length).toBeGreaterThan(3)
    expect(rules.map((r) => r.subject)).toContain('.row-block')
  })

  it(`with the selection bar showing, no \`:has()\` subject holds more than one row block of a ${ROWS}-row list`, async () => {
    const project = await createProject({ name: 'Big' })
    await seed(ROWS, project)
    // The shell's frame around the list, as Shell draws it, with the phone's add button after it.
    const r = await render(
      <>
        <div data-app-frame=""><div id="content"><TaskListView route={{ view: 'project', id: project }} /></div></div>
        <button type="button" data-add-button="">Add</button>
      </>,
    )
    await waitFor(() => r.container.querySelectorAll('li[data-task-id]').length === ROWS, 'every row rendered', 120_000)
    await key(document.body, 'j')
    await key(document.body, 'x')
    await waitFor(() => !!document.querySelector('[data-selection-bar]'), 'the selection bar', 10_000)
    // The bar's room and the add button stepping aside read a mark on the root, which no list change touches.
    expect(document.documentElement.hasAttribute('data-selection-docked')).toBe(true)
    const widest: { selector: string; rows: number }[] = []
    for (const { selector, subject } of hasRules(css)) {
      let rows = 0
      for (const el of document.querySelectorAll(subject)) rows = Math.max(rows, el.querySelectorAll('li[data-task-id]').length)
      widest.push({ selector, rows })
    }
    console.info(`[issue 1179] rows under each :has() subject of index.css in a ${ROWS}-row list: ${widest.map((w) => `${w.rows} ${w.selector}`).join('; ')}`)
    // A row block holds up to twice BLOCK_ROWS rows (rowBlocks.ts); #content held all of them.
    expect(widest.filter((w) => w.rows > BLOCK_ROWS * 2)).toEqual([])
    await key(document.body, 'Escape')
    await waitFor(() => !document.querySelector('[data-selection-bar]'), 'the bar gone', 10_000)
    expect(document.documentElement.hasAttribute('data-selection-docked')).toBe(false)
    await r.unmount()
  }, 180_000)
})
