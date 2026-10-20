// @vitest-environment happy-dom
// The sequence spotlight (OpenSpec change shortcut-spotlight, keyboard-shortcuts
// "Sequence spotlight"): shown after a hesitation, never for fluent typing; a late
// key, a click, Esc, the close button and a stray key behave as specified; it lists
// only what is available here, Vim's `gg` included.
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { click, flush, render } from '../../ui/test-utils'
import { installShortcutDispatcher, isPrefixPending, registerShortcutScope, resetShortcutScopes } from './dispatch'
import { Keys } from './Kbd'
import { Spotlight, SPOTLIGHT_DELAY_MS } from './Spotlight'

async function press(key: string, init: KeyboardEventInit = {}, target: EventTarget = document.body) {
  await act(async () => { target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init })) })
}
const card = () => document.querySelector('[data-spotlight]')
const entries = () => [...document.querySelectorAll('[data-spotlight-entry]')].map((b) => b.getAttribute('data-spotlight-entry'))

let ran: string[] = []
let release = () => {}
beforeEach(() => {
  ran = []
  release = installShortcutDispatcher()
  registerShortcutScope({
    scope: 'global',
    handlers: { 'go.today': () => { ran.push('today') }, 'go.inbox': () => { ran.push('inbox') }, 'go.upcoming': () => { ran.push('upcoming') }, 'go.week': () => { ran.push('week') } },
  })
})
afterEach(() => { release(); resetShortcutScopes(); document.body.innerHTML = '' })

describe('showing', () => {
  it('opens after a hesitation with the key pressed and what can follow, grouped', async () => {
    const r = await render(<Spotlight />)
    await press('g')
    await flush(SPOTLIGHT_DELAY_MS + 50)
    expect(card()).toBeTruthy()
    expect(card()!.textContent).toContain('Press a key')
    expect(card()!.querySelector('kbd')!.textContent).toBe('g')
    expect(entries().sort()).toEqual(['go.inbox', 'go.today', 'go.upcoming', 'go.week'])
    expect([...card()!.querySelectorAll('h3')].map((h) => h.textContent)).toEqual(['Views', 'Calendar'])
    await r.unmount()
  })

  it('never shows for a second key within the delay', async () => {
    const r = await render(<Spotlight />)
    await press('g')
    await flush(100)
    await press('t')
    await flush(SPOTLIGHT_DELAY_MS + 50)
    expect(card()).toBeNull()
    expect(ran).toEqual(['today'])
    await r.unmount()
  })

  it('does not open while typing in a field', async () => {
    const r = await render(<><input data-testid="field" /><Spotlight /></>)
    const input = document.querySelector('input')!
    input.focus()
    await press('g', {}, input)
    await flush(SPOTLIGHT_DELAY_MS + 50)
    expect(card()).toBeNull()
    await r.unmount()
  })

  it('lists only entries with a handler here (no Ask when the assistant is off)', async () => {
    const r = await render(<Spotlight />)
    await press('g')
    await flush(SPOTLIGHT_DELAY_MS + 50)
    expect(entries()).not.toContain('go.ask')
    await r.unmount()
  })

  it('lists Vim’s gg when the layer is on', async () => {
    registerShortcutScope({ scope: 'vim', handlers: {} })
    const r = await render(<Spotlight />)
    await press('g')
    await flush(SPOTLIGHT_DELAY_MS + 50)
    expect(entries()).toContain('vim.first')
    expect(card()!.textContent).toContain('First task')
    await r.unmount()
  })
})

describe('finishing', () => {
  it('a late key runs its shortcut and closes it', async () => {
    const r = await render(<Spotlight />)
    await press('g')
    await flush(SPOTLIGHT_DELAY_MS + 900)
    expect(card()).toBeTruthy()
    await press('u')
    await flush()
    expect(ran).toEqual(['upcoming'])
    expect(card()).toBeNull()
    await r.unmount()
  })

  it('a click on an entry runs it', async () => {
    const r = await render(<Spotlight />)
    await press('g')
    await flush(SPOTLIGHT_DELAY_MS + 50)
    await click(document.querySelector('[data-spotlight-entry="go.inbox"]')!)
    await flush()
    expect(ran).toEqual(['inbox'])
    expect(card()).toBeNull()
    await r.unmount()
  })

  it('Esc, the close button and a stray key cancel without running anything, focus untouched', async () => {
    const r = await render(<><button type="button" data-testid="before">before</button><Spotlight /></>)
    const before = document.querySelector<HTMLButtonElement>('[data-testid="before"]')!
    before.focus()
    for (const finish of ['Escape', 'close', 'z'] as const) {
      await press('g')
      await flush(SPOTLIGHT_DELAY_MS + 50)
      expect(card(), finish).toBeTruthy()
      if (finish === 'close') await click(card()!.querySelector('button[aria-label="Cancel"]')!)
      else await press(finish)
      await flush()
      expect(card(), finish).toBeNull()
      expect(isPrefixPending()).toBe(false)
      expect(document.activeElement).toBe(before)
    }
    expect(ran).toEqual([])
    await r.unmount()
  })
})

describe('keycaps', () => {
  it('reads sequences with "then" and alternatives with "or", one keycap per chord', () => {
    const html = renderToStaticMarkup(<Keys keys={['g t']} />)
    expect(html.match(/<kbd/g)).toHaveLength(2)
    expect(html).toContain('>then<')
    const alt = renderToStaticMarkup(<Keys keys={['j', '↓']} />)
    expect(alt).toContain('>or<')
    expect(alt).toContain('<kbd class="ui-kbd">j</kbd>')
    // A gesture is text, not a keycap.
    expect(renderToStaticMarkup(<Keys keys={['Drag (touch: press and hold)']} />)).not.toContain('<kbd')
  })
})
