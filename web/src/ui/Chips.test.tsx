// @vitest-environment happy-dom
// Chips are read by screen readers (OpenSpec assistive-tech-semantics): the full
// phrase is visually hidden text inside the chip, never an aria-label on a span,
// which has no role and whose name assistive technology ignores.
import { act } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { LabelChips, NeutralChip, ReadAs, ToneText } from './Chips'
import { ListGroupHeader } from './patterns/ListGroupHeader'
import { render, spokenText, visibleText } from './test-utils'

afterEach(() => { document.body.innerHTML = '' })

describe('chips for assistive technology', () => {
  it('a count chip shows the number and is read as the full phrase', async () => {
    const r = await render(<NeutralChip icon="message-circle" label="3 comments" data-comments="">3</NeutralChip>)
    const chip = r.container.querySelector('[data-comments]')!
    expect(chip.hasAttribute('aria-label')).toBe(false)
    expect(visibleText(chip)).toBe('3')
    expect(spokenText(chip)).toBe('3 comments')
    expect(chip.querySelector('.sr-only')!.textContent).toBe('3 comments')
  })

  it('an icon-only chip ("Has notes") is read by its label', async () => {
    const r = await render(<NeutralChip icon="list" label="Has notes" data-notes="" />)
    const chip = r.container.querySelector('[data-notes]')!
    expect(chip.hasAttribute('aria-label')).toBe(false)
    expect(spokenText(chip)).toBe('Has notes')
  })

  it('a tone text without a label is read as shown; with one, as the label', async () => {
    const plain = await render(<ToneText data-date="">Today</ToneText>)
    expect(spokenText(plain.container.querySelector('[data-date]')!)).toBe('Today')
    const long = await render(<ToneText data-deadline="" label="Deadline Sat 17 Oct, 3d">3d</ToneText>)
    const el = long.container.querySelector('[data-deadline]')!
    expect(el.hasAttribute('aria-label')).toBe(false)
    expect(visibleText(el)).toBe('3d')
    expect(spokenText(el)).toBe('Deadline Sat 17 Oct, 3d')
  })

  it('ReadAs without a label leaves the text as it is', async () => {
    const r = await render(<span data-x=""><ReadAs label={null}>5</ReadAs></span>)
    expect(r.container.querySelector('[data-x]')!.innerHTML).toBe('5')
  })

  it("a group header's count is read as open tasks", async () => {
    const r = await render(<ListGroupHeader title="Today" count={2} />)
    const count = r.container.querySelector('[data-group-count]')!
    expect(count.hasAttribute('aria-label')).toBe(false)
    expect(visibleText(count)).toBe('2')
    expect(spokenText(count)).toBe('2 open tasks')
  })
})

// A row's labels (OpenSpec change rows-v2, design D5).
describe('LabelChips', () => {
  const errand = { id: 'l1', name: 'errand', color: 'var(--ot-hue-green-solid)' }
  const call = { id: 'l2', name: 'call', color: 'var(--ot-hue-violet-solid)' }
  const home = { id: 'l3', name: 'home', color: 'var(--ot-hue-blue-solid)' }

  it('three labels: two chips with their dots and "+1", every name spoken, a tab stop and a tooltip on focus', async () => {
    const r = await render(<LabelChips labels={[errand, call, home]} />)
    const g = r.container.querySelector('[data-label-chips]')!
    expect(g.getAttribute('role')).toBe('group')
    expect(g.hasAttribute('aria-label')).toBe(false)
    expect(g.querySelectorAll('[data-label-chip]')).toHaveLength(2)
    expect(visibleText(g)).toBe('errandcall+1')
    expect(spokenText(g)).toBe('Labels: errand, call, home')
    expect(g.getAttribute('tabindex')).toBe('0')
    await act(async () => { g.dispatchEvent(new FocusEvent('focusin', { bubbles: true })) })
    expect(document.querySelector('[role="tooltip"]')?.textContent).toBe('errand, call, home')
  })

  it('two labels: both chips, no "+n", no tab stop and no tooltip', async () => {
    const r = await render(<LabelChips labels={[errand, call]} />)
    const g = r.container.querySelector('[data-label-chips]')!
    expect(g.querySelectorAll('[data-label-chip]')).toHaveLength(2)
    expect(g.querySelector('[data-label-more]')).toBeNull()
    expect(g.hasAttribute('tabindex')).toBe(false)
    await act(async () => { g.dispatchEvent(new FocusEvent('focusin', { bubbles: true })) })
    expect(document.querySelector('[role="tooltip"]')).toBeNull()
  })

  it('leaves out the omitted label, and renders nothing when none is left', async () => {
    const r = await render(<LabelChips labels={[errand, call, home]} omit="l1" />)
    const g = r.container.querySelector('[data-label-chips]')!
    expect(g.querySelectorAll('[data-label-chip]')).toHaveLength(2)
    expect(spokenText(g)).toBe('Labels: call, home')
    const none = await render(<LabelChips labels={[errand]} omit="l1" />)
    expect(none.container.querySelector('[data-label-chips]')).toBeNull()
  })
})

describe('labels that fit one line (row-layouts D2)', () => {
  it('shows as many chips as the width holds, then "+n", and reads every name', async () => {
    const labels = ['call', 'errand', 'home', 'deep work'].map((name, i) => ({ id: `l${i}`, name, color: '#888' }))
    const width = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth')
    const offset = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth')
    // Each chip 50 px wide in a 140 px row: two chips and the "+n" fit, not three.
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get() { return (this as HTMLElement).hasAttribute('data-label-chips') ? 140 : 0 } })
    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get() { return (this as HTMLElement).hasAttribute('data-fit-chip') ? 50 : 0 } })
    try {
      const r = await render(<LabelChips labels={labels} fit />)
      const g = r.container.querySelector('[data-label-chips]')!
      const shown = [...g.querySelectorAll('[data-fit-chip]')].filter((c) => !c.className.includes('invisible')).map((c) => c.textContent)
      expect(shown).toEqual(['call', 'errand'])
      expect(g.querySelector('[data-label-more]')!.textContent).toBe('+2')
      expect(spokenText(g)).toBe('Labels: call, errand, home, deep work')
    } finally {
      if (width) Object.defineProperty(HTMLElement.prototype, 'clientWidth', width)
      if (offset) Object.defineProperty(HTMLElement.prototype, 'offsetWidth', offset)
    }
  })
})
