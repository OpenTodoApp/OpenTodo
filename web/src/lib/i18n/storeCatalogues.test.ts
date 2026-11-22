// precache-device-language D3: the first visit's catalogue is asked for again once a
// service worker controls the page, so the worker stores it for offline use.
import { describe, expect, it } from 'vitest'
import { storeCataloguesOnceControlled } from './catalog'

function worker(controller: unknown) {
  const listeners: (() => void)[] = []
  return {
    controller,
    addEventListener: (_t: string, fn: () => void) => void listeners.push(fn),
    fire: () => listeners.forEach((fn) => fn()),
    listeners,
  } as unknown as ServiceWorkerContainer & { fire: () => void; listeners: unknown[] }
}

const loaded = () => [
  'https://cdn.example.net/assets/lang-fr-AAAAAAAA.js',
  'https://todo.example.com/assets/index-a1.js',
  'https://todo.example.com/assets/lang-de-DBpiZ4My.js',
  'https://todo.example.com/assets/lang-de-DBpiZ4My.js',
  'https://todo.example.com/assets/de-Bpy5dmup.js',
  'https://todo.example.com/api/v1/sync',
]

describe('storeCataloguesOnceControlled', () => {
  it('asks once for each catalogue of the app\'s own origin the page loaded when a worker takes control', () => {
    const sw = worker(null)
    const got: string[] = []
    storeCataloguesOnceControlled(sw, loaded, async (u) => void got.push(u), 'https://todo.example.com')
    expect(got).toEqual([])
    sw.fire()
    expect(got).toEqual(['https://todo.example.com/assets/lang-de-DBpiZ4My.js'])
  })

  it('does nothing when the page started controlled, or without service workers', () => {
    const sw = worker({})
    const got: string[] = []
    storeCataloguesOnceControlled(sw, loaded, async (u) => void got.push(u))
    expect(sw.listeners).toHaveLength(0)
    storeCataloguesOnceControlled(undefined, loaded, async (u) => void got.push(u))
    expect(got).toEqual([])
  })
})
