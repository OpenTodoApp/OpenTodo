// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { TAP_ATTR, isTap, watchInputMode } from './inputMode'

// Events made by scripts are never trusted, so the listeners are called directly.
function fakeDoc() {
  const listeners = new Map<string, (e: unknown) => void>()
  const doc = {
    documentElement: document.documentElement,
    body: document.body,
    get activeElement() { return document.activeElement },
    addEventListener: (type: string, fn: (e: unknown) => void) => listeners.set(type, fn),
    removeEventListener: (type: string) => listeners.delete(type),
  } as unknown as Document
  const fire = (type: string, e: object) => listeners.get(type)?.({ isTrusted: true, ...e })
  return { doc, listeners, fire }
}

const key = { key: 'Tab', keyCode: 9, isComposing: false, ctrlKey: false, metaKey: false, altKey: false, target: document.body }

function button(name: string): HTMLButtonElement {
  const b = document.createElement('button')
  b.textContent = name
  document.body.append(b)
  return b
}

afterEach(() => { document.body.innerHTML = '' })

describe('watchInputMode', () => {
  it('a finger is a tap; a mouse, a trackpad and a pen are not', () => {
    expect(isTap('touch')).toBe(true)
    for (const t of ['mouse', 'pen', '']) expect(isTap(t)).toBe(false)
  })

  it('marks what a tap focuses, and only that element', () => {
    const { doc, fire } = fakeDoc()
    watchInputMode(doc)
    const a = button('a')
    const b = button('b')
    fire('pointerdown', { pointerType: 'touch' })
    fire('focusin', { target: a })
    expect(a.hasAttribute(TAP_ATTR)).toBe(true)
    fire('focusin', { target: b })
    expect(b.hasAttribute(TAP_ATTR)).toBe(true)
    expect(a.hasAttribute(TAP_ATTR)).toBe(false)
    // Never the root: the rings of the whole page would depend on it.
    expect(document.documentElement.hasAttribute(TAP_ATTR)).toBe(false)
    expect(document.body.hasAttribute(TAP_ATTR)).toBe(false)
  })

  it('a hardware key or a mouse press gives the ring back', () => {
    const { doc, fire } = fakeDoc()
    watchInputMode(doc)
    const a = button('a')
    fire('pointerdown', { pointerType: 'touch' })
    fire('focusin', { target: a })
    fire('keydown', key)
    expect(a.hasAttribute(TAP_ATTR)).toBe(false)
    fire('focusin', { target: a })
    expect(a.hasAttribute(TAP_ATTR)).toBe(false)
    fire('pointerdown', { pointerType: 'touch' })
    fire('focusin', { target: a })
    fire('pointerdown', { pointerType: 'mouse' })
    expect(a.hasAttribute(TAP_ATTR)).toBe(false)
    fire('pointerdown', { pointerType: 'pen' })
    fire('focusin', { target: a })
    expect(a.hasAttribute(TAP_ATTR)).toBe(false)
  })

  it('a tap takes the ring off what was focused before it', () => {
    const { doc, fire } = fakeDoc()
    watchInputMode(doc)
    const a = button('a')
    a.focus()
    fire('pointerdown', { pointerType: 'touch' })
    expect(a.hasAttribute(TAP_ATTR)).toBe(true)
  })

  it('ignores typing on a touch keyboard and events made by scripts', () => {
    const { doc, fire, listeners } = fakeDoc()
    watchInputMode(doc)
    const a = button('a')
    fire('pointerdown', { pointerType: 'touch' })
    fire('focusin', { target: a })
    fire('keydown', { ...key, key: 'a', keyCode: 65, target: document.createElement('input') })
    fire('keydown', { ...key, key: 'Unidentified', keyCode: 229 })
    listeners.get('pointerdown')?.({ isTrusted: false, pointerType: 'mouse' })
    expect(a.hasAttribute(TAP_ATTR)).toBe(true)
  })

  it('stops listening and leaves nothing marked', () => {
    const { doc, fire, listeners } = fakeDoc()
    const stop = watchInputMode(doc)
    const a = button('a')
    fire('pointerdown', { pointerType: 'touch' })
    fire('focusin', { target: a })
    stop()
    expect(listeners.size).toBe(0)
    expect(a.hasAttribute(TAP_ATTR)).toBe(false)
  })
})
