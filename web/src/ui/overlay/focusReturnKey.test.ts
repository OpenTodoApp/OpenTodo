// @vitest-environment happy-dom
// Focus return to a trigger that was unmounted while its overlay was open: the phone's
// tab bar and add button leave the screen under every sheet, so the Search tab and
// the add button come back as new elements (accessibility pass, 360 and 390 px).
import { afterEach, describe, expect, it } from 'vitest'
import { captureFocus } from './stack'

const frames = (n = 4) => new Promise<void>((resolve) => {
  const step = (left: number) => (left ? requestAnimationFrame(() => step(left - 1)) : resolve())
  step(n)
})
afterEach(() => { document.body.innerHTML = '' })

describe('focus return to a keyed trigger', () => {
  it('focuses the element with the same key once it is back', async () => {
    const tab = document.createElement('button')
    tab.setAttribute('data-focus-key', 'tab-search')
    document.body.append(tab)
    const restore = captureFocus(tab)
    // The overlay is open: the tab bar is gone.
    tab.remove()
    restore()
    // The next render brings the tab bar back with a new button.
    const again = document.createElement('button')
    again.setAttribute('data-focus-key', 'tab-search')
    document.body.append(again)
    await frames()
    expect(document.activeElement).toBe(again)
  })

  it('leaves focus alone when something else took it meanwhile', async () => {
    const tab = document.createElement('button')
    tab.setAttribute('data-focus-key', 'add-button')
    const field = document.createElement('input')
    document.body.append(tab, field)
    const restore = captureFocus(tab)
    tab.remove()
    restore()
    field.focus()
    const again = document.createElement('button')
    again.setAttribute('data-focus-key', 'add-button')
    document.body.append(again)
    await frames()
    expect(document.activeElement).toBe(field)
  })

  it('never focuses a keyed control that is hidden or out of the Tab order', async () => {
    const add = document.createElement('button')
    add.setAttribute('data-focus-key', 'add-button')
    document.body.append(add)
    const restore = captureFocus(add)
    add.remove()
    restore()
    const away = document.createElement('button')
    away.setAttribute('data-focus-key', 'add-button')
    away.setAttribute('aria-hidden', 'true')
    away.tabIndex = -1
    document.body.append(away)
    await frames()
    expect(document.activeElement).toBe(document.body)
  })

  it('without a key a removed trigger is skipped, as before', async () => {
    const plain = document.createElement('button')
    document.body.append(plain)
    const restore = captureFocus(plain)
    plain.remove()
    restore()
    await frames()
    expect(document.activeElement).toBe(document.body)
  })
})
