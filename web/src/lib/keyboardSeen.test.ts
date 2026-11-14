// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { fromHardwareKeyboard, KEYBOARD_ATTR, watchHardwareKeyboard } from './keyboardSeen'

const press = (over: Partial<Parameters<typeof fromHardwareKeyboard>[0]> = {}) => ({
  isTrusted: true, key: 'c', keyCode: 67, isComposing: false, ctrlKey: false, metaKey: false, altKey: false, target: document.body as EventTarget | null, ...over,
})

describe('fromHardwareKeyboard', () => {
  it('counts a key pressed outside a text field', () => {
    expect(fromHardwareKeyboard(press())).toBe(true)
    expect(fromHardwareKeyboard(press({ target: document.createElement('button'), key: 'Enter', keyCode: 13 }))).toBe(true)
  })

  it('ignores typing in a field, which an on-screen keyboard does too', () => {
    expect(fromHardwareKeyboard(press({ target: document.createElement('input') }))).toBe(false)
    expect(fromHardwareKeyboard(press({ target: document.createElement('textarea'), key: 'Enter', keyCode: 13 }))).toBe(false)
    expect(fromHardwareKeyboard(press({ target: { tagName: 'DIV', isContentEditable: true } as unknown as EventTarget }))).toBe(false)
  })

  it('counts chords, Tab and Escape inside a field', () => {
    const input = document.createElement('input')
    expect(fromHardwareKeyboard(press({ target: input, ctrlKey: true, key: 'k' }))).toBe(true)
    expect(fromHardwareKeyboard(press({ target: input, metaKey: true, key: 'k' }))).toBe(true)
    expect(fromHardwareKeyboard(press({ target: input, altKey: true, key: 'ArrowUp' }))).toBe(true)
    expect(fromHardwareKeyboard(press({ target: input, key: 'Tab', keyCode: 9 }))).toBe(true)
    expect(fromHardwareKeyboard(press({ target: input, key: 'Escape', keyCode: 27 }))).toBe(true)
  })

  it('ignores composition and presses made by scripts', () => {
    expect(fromHardwareKeyboard(press({ keyCode: 229 }))).toBe(false)
    expect(fromHardwareKeyboard(press({ key: 'Unidentified', keyCode: 0 }))).toBe(false)
    expect(fromHardwareKeyboard(press({ isComposing: true }))).toBe(false)
    expect(fromHardwareKeyboard(press({ isTrusted: false }))).toBe(false)
  })
})

describe('watchHardwareKeyboard', () => {
  afterEach(() => document.documentElement.removeAttribute(KEYBOARD_ATTR))

  it('leaves the page unmarked for a press made by a script', () => {
    const stop = watchHardwareKeyboard()
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', bubbles: true }))
    expect(document.documentElement.hasAttribute(KEYBOARD_ATTR)).toBe(false)
    stop()
  })
})
