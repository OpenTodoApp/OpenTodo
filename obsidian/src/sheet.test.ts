// @vitest-environment happy-dom
// The confirmation sheet, driven with the keyboard only (obsidian-plugin task 4.2).
import { beforeEach, describe, expect, it } from 'vitest'
import { readLine, type Draft, type ReadContext } from './capture'
import { renderSheet } from './sheet'

const ctx: ReadContext = { today: '2026-10-29', now: '08:00', language: 'en', projects: [{ id: 'p-work', name: 'Work' }] }
const draft = (line: string, index = 0): Draft => {
  const r = readLine(index, line, ctx)
  if (r.kind !== 'draft') throw new Error(r.kind)
  return r.draft
}
const key = (el: Element, k: string) => el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }))
const tick = () => new Promise((r) => queueMicrotask(() => r(null)))

/** The elements Tab visits, in order. */
function tabOrder(root: HTMLElement): string[] {
  return [...root.querySelectorAll<HTMLElement>('input, select, button')].filter((e) => !e.hasAttribute('disabled') && e.tabIndex >= 0).map((e) => e.getAttribute('aria-label') ?? (e.tagName === 'SELECT' ? 'SELECT' : e.textContent ?? e.tagName))
}

let root: HTMLElement
beforeEach(() => {
  document.body.replaceChildren()
  root = document.createElement('div')
  document.body.append(root)
})

describe('sheet', () => {
  it('focuses the title, reads in order, and Enter sends with the chosen project', async () => {
    let sent: { drafts: Draft[]; project: string | null } | null = null
    renderSheet(root, { drafts: [draft('Call the plumber tomorrow 9am p2')], projects: [{ id: 'p-work', name: 'Work', depth: 0 }], project: null, ctx, onSend: (drafts, project) => (sent = { drafts, project }), onCancel: () => {} })
    await tick()
    const title = root.querySelector<HTMLInputElement>('.opentodo-sheet-title')!
    expect(document.activeElement).toBe(title)
    expect(tabOrder(root)).toEqual(['Title', 'Remove Due 2026-10-30 09:00', 'Remove Priority 2', 'SELECT', 'Cancel', 'Send'])
    const select = root.querySelector('select')!
    select.value = 'p-work'
    key(select, 'Enter')
    expect(sent).not.toBeNull()
    expect(sent!.project).toBe('p-work')
    expect(sent!.drafts[0]).toMatchObject({ title: 'Call the plumber', fields: { priority: 2 } })
  })

  it('a removed chip goes back into the title; Escape cancels', async () => {
    let cancelled = false
    let sent: Draft[] = []
    const r = renderSheet(root, { drafts: [draft('Call the plumber tomorrow 9am p2')], projects: [], project: null, ctx, onSend: (d) => (sent = d), onCancel: () => (cancelled = true) })
    const remove = root.querySelector<HTMLButtonElement>('[aria-label="Remove Priority 2"]')!
    remove.click()
    expect(root.querySelector<HTMLInputElement>('.opentodo-sheet-title')!.value).toBe('Call the plumber p2')
    expect(document.activeElement).toBe(root.querySelector('.opentodo-sheet-title'))
    expect(root.querySelector('[aria-label="Remove Priority 2"]')).toBeNull()
    key(root.querySelector('.opentodo-sheet-title')!, 'Escape')
    expect(cancelled).toBe(true)
    r.send()
    expect(sent).toEqual([])
  })

  it('a selection lists each line with its own checkbox; an edited title is kept', async () => {
    let sent: Draft[] = []
    renderSheet(root, { drafts: [draft('Buy milk', 0), draft('Call Bob', 1)], projects: [], project: null, ctx, onSend: (d) => (sent = d), onCancel: () => {} })
    expect(tabOrder(root)).toEqual(['Send line 1', 'Title', 'Send line 2', 'Title', 'SELECT', 'Cancel', 'Send'])
    const titles = root.querySelectorAll<HTMLInputElement>('.opentodo-sheet-title')
    titles[1].value = 'Call Bob back'
    titles[1].dispatchEvent(new Event('input'))
    const first = root.querySelector<HTMLInputElement>('input[type=checkbox]')!
    first.checked = false
    first.dispatchEvent(new Event('change'))
    key(titles[1], 'Enter')
    expect(sent.map((d) => d.title)).toEqual(['Call Bob back'])
  })

  it('Enter on a button presses the button, not Send', async () => {
    let cancelled = false
    let sent = false
    renderSheet(root, { drafts: [draft('Buy milk')], projects: [], project: null, ctx, onSend: () => (sent = true), onCancel: () => (cancelled = true) })
    const cancel = [...root.querySelectorAll('button')].find((b) => b.textContent === 'Cancel')!
    key(cancel, 'Enter')
    expect(sent).toBe(false)
    cancel.click()
    expect(cancelled).toBe(true)
  })
})
