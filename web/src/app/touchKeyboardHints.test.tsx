// @vitest-environment happy-dom
// Keyboard hints only where a key can be pressed (OpenSpec change touch-keyboard-hints):
// one rule in the stylesheet hides `.ui-kbd` and `[data-kbd-hint]` on a touch-only
// device; these tests pin the rule and the markers it reads. What a phone and a
// computer draw is checked in a browser (the change's tasks).
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { render } from '../ui/test-utils'
import { MenuItem } from '../ui/Menu'
import { Tooltip } from '../ui/Tooltip'
import { KEYBOARD_ATTR } from '../lib/keyboardSeen'
import { Kbd } from './shortcuts/Kbd'
import { HINTS_KEY, setShortcutHints } from './shortcuts/hints'

const css = readFileSync(path.resolve(process.cwd(), 'src/index.css'), 'utf8')

beforeEach(() => { localStorage.removeItem(HINTS_KEY) })
afterEach(() => { localStorage.removeItem(HINTS_KEY) })

describe('the stylesheet rule', () => {
  it('hides badges and hint lines only without a fine pointer, a hovering one or a seen keyboard', () => {
    const rules = css.match(/@media not \(\(any-pointer: fine\) or \(any-hover: hover\)\) \{[^@]*?\n\}/g) ?? []
    expect(rules).toHaveLength(1)
    expect(rules[0]).toContain(`:root:not([${KEYBOARD_ATTR}]) :is(.ui-kbd, [data-kbd-hint]):not([data-kbd-keep], [data-kbd-keep] *) { display: none; }`)
  })

  it('sits outside every cascade layer, so no utility class shows a hint again', () => {
    const before = css.slice(0, css.indexOf('@media not ((any-pointer: fine)'))
    const lastLayer = before.lastIndexOf('@layer ')
    // The last layer block before the rule is closed: a line that is only "}".
    expect(before.slice(lastLayer)).toMatch(/\n\}\n/)
  })
})

describe('the markers', () => {
  it('a key inside a sentence is kept, a badge on its own is not', async () => {
    setShortcutHints(true)
    const r = await render(<><p data-prose>Open it with <Kbd k="a" />.</p><p data-chrome>Close <Kbd k="Esc" only /></p></>)
    expect(r.container.querySelector('[data-prose] kbd')!.hasAttribute('data-kbd-keep')).toBe(true)
    expect(r.container.querySelector('[data-chrome] kbd')!.hasAttribute('data-kbd-keep')).toBe(false)
    await r.unmount()
  })

  it('a tooltip hides its separator with its keys', async () => {
    const r = await render(<Tooltip label="Share project" shortcut="g t"><button>Share</button></Tooltip>)
    await act(async () => { r.container.querySelector('button')!.dispatchEvent(new FocusEvent('focusin', { bubbles: true })) })
    const tip = document.querySelector('[role="tooltip"]')!
    const shown = [...tip.children].filter((c) => !c.hasAttribute('data-kbd-hint')).map((c) => c.textContent)
    expect(shown).toEqual(['Share project'])
    expect(tip.querySelector('[data-kbd-hint]')!.textContent).toContain('·')
    await r.unmount()
  })

  it('a menu item keeps its shortcut for assistive technology', async () => {
    const r = await render(<MenuItem label="Complete" shortcut="c" onSelect={() => {}} />)
    const item = r.container.querySelector('[role="menuitem"]')!
    expect(item.getAttribute('aria-keyshortcuts')).toBe('c')
    expect(document.getElementById(item.getAttribute('aria-describedby')!)!.classList.contains('ui-kbd')).toBe(true)
    await r.unmount()
  })
})
