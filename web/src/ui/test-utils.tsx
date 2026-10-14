// Helpers for interaction tests of the shared UI (files opt in with
// `// @vitest-environment happy-dom`): render into a real DOM, fire keys.
import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

export interface Rendered {
  container: HTMLElement
  rerender: (ui: ReactNode) => Promise<void>
  unmount: () => Promise<void>
}

export async function render(ui: ReactNode): Promise<Rendered> {
  const container = document.createElement('div')
  document.body.append(container)
  let root: Root | null = null
  await act(async () => {
    root = createRoot(container)
    root.render(ui)
  })
  return {
    container,
    rerender: (next) => act(async () => root!.render(next)),
    unmount: async () => {
      await act(async () => root!.unmount())
      container.remove()
    },
  }
}

export async function key(target: Element | Document, k: string, init: KeyboardEventInit = {}) {
  await act(async () => {
    target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init }))
  })
}

export async function click(el: Element) {
  await act(async () => (el as HTMLElement).click())
}

export async function type(input: HTMLInputElement, text: string) {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    setter.call(input, text)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

export const flush = (ms = 0) => act(() => new Promise<void>((r) => setTimeout(r, ms)))
