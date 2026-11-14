// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { KEYBOARD_ATTR, KEYBOARD_LIKELY, raisesKeyboard, touchOnly } from './keyboardLikely'

/** A window whose media queries answer `likely` for the keyboard-like inputs. */
function device(likely: boolean, seen = false) {
  const root = document.createElement('html')
  if (seen) root.setAttribute(KEYBOARD_ATTR, '')
  const asked: string[] = []
  const win = { matchMedia: (q: string) => { asked.push(q); return { matches: likely } }, document: { documentElement: root } } as unknown as Window
  return { win, asked }
}

describe('touchOnly', () => {
  it('is true with only touch input and no hardware key seen', () => {
    const { win, asked } = device(false)
    expect(touchOnly(win)).toBe(true)
    expect(asked).toEqual([KEYBOARD_LIKELY])
  })

  it('is false with a mouse, a trackpad or anything that hovers', () => {
    expect(touchOnly(device(true).win)).toBe(false)
  })

  it('is false once a hardware key was pressed', () => {
    expect(touchOnly(device(false, true).win)).toBe(false)
  })

  it('answers "a keyboard" where the question cannot be asked', () => {
    expect(touchOnly(undefined)).toBe(false)
    expect(touchOnly({ document } as unknown as Window)).toBe(false)
  })

  it('asks what the stylesheet asks', async () => {
    const css = (await import('../index.css?raw')).default
    expect(css).toContain('@media not ((any-pointer: fine) or (any-hover: hover))')
    expect(css).toContain(`:root:not([${KEYBOARD_ATTR}])`)
    expect(KEYBOARD_LIKELY).toBe('(any-pointer: fine), (any-hover: hover)')
  })
})

describe('raisesKeyboard', () => {
  const el = (html: string) => { const d = document.createElement('div'); d.innerHTML = html; return d.firstElementChild }

  it('is true for text fields', () => {
    for (const html of ['<input>', '<input type="search">', '<input type="email">', '<input type="number">', '<textarea></textarea>', '<div contenteditable="true"></div>']) {
      expect(raisesKeyboard(el(html)), html).toBe(true)
    }
  })

  it('is false for buttons, switches and nothing', () => {
    for (const html of ['<button></button>', '<input type="checkbox">', '<input type="radio">', '<input type="range">', '<select></select>', '<a href="#"></a>']) {
      expect(raisesKeyboard(el(html)), html).toBe(false)
    }
    expect(raisesKeyboard(null)).toBe(false)
  })
})
