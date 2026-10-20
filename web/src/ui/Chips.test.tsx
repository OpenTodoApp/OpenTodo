// @vitest-environment happy-dom
// Chips are read by screen readers (OpenSpec assistive-tech-semantics): the full
// phrase is visually hidden text inside the chip, never an aria-label on a span,
// which has no role and whose name assistive technology ignores.
import { act } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { LabelDots, NeutralChip, ReadAs, ToneText } from './Chips'
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

// Calm rows' labels (OpenSpec change calm-rows, design D6).
describe('LabelDots', () => {
  const errand = { id: 'l1', name: 'errand', color: 'var(--ot-hue-green-solid)' }
  const call = { id: 'l2', name: 'call', color: 'var(--ot-hue-violet-solid)' }
  const home = { id: 'l3', name: 'home', color: 'var(--ot-hue-blue-solid)' }

  it('three labels: three dots, the first name and "+2", every name spoken, a tab stop and a tooltip on focus', async () => {
    const r = await render(<LabelDots labels={[errand, call, home]} />)
    const g = r.container.querySelector('[data-label-dots]')!
    expect(g.getAttribute('role')).toBe('group')
    expect(g.hasAttribute('aria-label')).toBe(false)
    expect(g.querySelectorAll('[data-label-dot]')).toHaveLength(3)
    expect(visibleText(g)).toBe('errand +2')
    expect(spokenText(g)).toBe('Labels: errand, call, home')
    expect(g.getAttribute('tabindex')).toBe('0')
    await act(async () => { g.dispatchEvent(new FocusEvent('focusin', { bubbles: true })) })
    expect(document.querySelector('[role="tooltip"]')?.textContent).toBe('errand, call, home')
  })

  it('one label: its name, no "+n", no tab stop and no tooltip', async () => {
    const r = await render(<LabelDots labels={[errand]} />)
    const g = r.container.querySelector('[data-label-dots]')!
    expect(visibleText(g)).toBe('errand')
    expect(g.hasAttribute('tabindex')).toBe(false)
    await act(async () => { g.dispatchEvent(new FocusEvent('focusin', { bubbles: true })) })
    expect(document.querySelector('[role="tooltip"]')).toBeNull()
  })

  it('leaves out the omitted label, and renders nothing when none is left', async () => {
    const r = await render(<LabelDots labels={[errand, call, home]} omit="l1" />)
    const g = r.container.querySelector('[data-label-dots]')!
    expect(g.querySelectorAll('[data-label-dot]')).toHaveLength(2)
    expect(visibleText(g)).toBe('call +1')
    expect(spokenText(g)).toBe('Labels: call, home')
    const none = await render(<LabelDots labels={[errand]} omit="l1" />)
    expect(none.container.querySelector('[data-label-dots]')).toBeNull()
  })
})
