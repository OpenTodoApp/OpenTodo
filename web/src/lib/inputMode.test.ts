// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { INPUT_ATTR, watchInputMode } from './inputMode'

// Events made by scripts are never trusted, so the listeners are called directly.
function fakeDoc() {
  const listeners = new Map<string, (e: unknown) => void>()
  const root = document.createElement('html')
  const doc = {
    documentElement: root,
    addEventListener: (type: string, fn: (e: unknown) => void) => listeners.set(type, fn),
    removeEventListener: (type: string) => listeners.delete(type),
  } as unknown as Document
  const fire = (type: string, e: object) => listeners.get(type)?.({ isTrusted: true, ...e })
  return { doc, root, listeners, fire }
}

const key = { key: 'Tab', keyCode: 9, isComposing: false, ctrlKey: false, metaKey: false, altKey: false, target: document.body }

describe('watchInputMode', () => {
  it('names the last input: touch, pen and mouse presses, a hardware key', () => {
    const { doc, root, fire } = fakeDoc()
    watchInputMode(doc)
    expect(root.hasAttribute(INPUT_ATTR)).toBe(false)
    fire('pointerdown', { pointerType: 'touch' })
    expect(root.getAttribute(INPUT_ATTR)).toBe('touch')
    fire('keydown', key)
    expect(root.getAttribute(INPUT_ATTR)).toBe('keyboard')
    fire('pointerdown', { pointerType: 'pen' })
    expect(root.getAttribute(INPUT_ATTR)).toBe('pointer')
    fire('pointerdown', { pointerType: 'touch' })
    fire('pointerdown', { pointerType: 'mouse' })
    expect(root.getAttribute(INPUT_ATTR)).toBe('pointer')
  })

  it('ignores typing on a touch keyboard and events made by scripts', () => {
    const { doc, root, fire, listeners } = fakeDoc()
    watchInputMode(doc)
    fire('pointerdown', { pointerType: 'touch' })
    fire('keydown', { ...key, key: 'a', keyCode: 65, target: document.createElement('input') })
    fire('keydown', { ...key, key: 'Unidentified', keyCode: 229 })
    listeners.get('pointerdown')?.({ isTrusted: false, pointerType: 'mouse' })
    expect(root.getAttribute(INPUT_ATTR)).toBe('touch')
  })

  it('stops listening', () => {
    const { doc, listeners } = fakeDoc()
    watchInputMode(doc)()
    expect(listeners.size).toBe(0)
  })
})
