// @vitest-environment happy-dom
// lazy-retry-online D1: a lazy part whose import failed loads once it is retried, and
// never retries unasked.
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { Component, Suspense, type ReactNode } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { isChunkLoadError, lazy, retryFailedImports } from './lazy'

class Catch extends Component<{ children: ReactNode }, { error: unknown }> {
  state = { error: null as unknown }
  static getDerivedStateFromError(error: unknown) { return { error } }
  render() { return this.state.error ? <p>failed</p> : this.props.children }
}

let root: ReturnType<typeof createRoot> | null = null
afterEach(() => { act(() => root?.unmount()); root = null; document.body.innerHTML = ''; retryFailedImports() })

const settle = () => act(async () => { for (let i = 0; i < 5; i++) await Promise.resolve() })

function mount(node: ReactNode) {
  const el = document.createElement('div')
  document.body.appendChild(el)
  root = createRoot(el)
  act(() => root!.render(node))
  return el
}

describe('lazy', () => {
  it('a failed import throws until retried, then loads', async () => {
    let calls = 0
    let online = false
    const Part = lazy(async () => {
      calls++
      if (!online) throw new TypeError('Failed to fetch dynamically imported module: /assets/Part.js')
      return { default: () => <p>part</p> }
    })
    const view = (key: number) => <Catch key={key}><Suspense fallback={<p>loading</p>}><Part /></Suspense></Catch>
    const el = mount(view(1))
    await settle()
    expect(el.textContent).toBe('failed')
    const tries = calls
    // Rendered again without a retry: the failure stays, no new import.
    act(() => root!.render(view(2)))
    await settle()
    expect(el.textContent).toBe('failed')
    expect(calls).toBe(tries)
    online = true
    expect(retryFailedImports()).toBe(1)
    act(() => root!.render(view(3)))
    await settle()
    expect(el.textContent).toBe('part')
    expect(calls).toBe(tries + 1)
  })

  it('passes props through', async () => {
    const Part = lazy(async () => ({ default: ({ name }: { name: string }) => <p>{name}</p> }))
    const el = mount(<Suspense fallback={null}><Part name="Ada" /></Suspense>)
    await settle()
    expect(el.textContent).toBe('Ada')
  })

  it('tells a chunk that could not be fetched from other errors', () => {
    expect(isChunkLoadError(new TypeError('Failed to fetch dynamically imported module: /a.js'))).toBe(true)
    expect(isChunkLoadError(new TypeError('Importing a module script failed.'))).toBe(true)
    expect(isChunkLoadError(new TypeError('error loading dynamically imported module: /a.js'))).toBe(true)
    expect(isChunkLoadError(new Error('Cannot read properties of undefined'))).toBe(false)
  })
})
