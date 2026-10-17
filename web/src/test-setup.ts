import 'fake-indexeddb/auto'
import { afterAll, afterEach } from 'vitest'

// No test reaches the network (OpenSpec web-lint-and-test-hygiene). Unless a test
// mocks fetch itself (vi.stubGlobal('fetch', ...), vi.spyOn(globalThis, 'fetch')),
// a request rejects, is recorded, and fails the test that made it, naming the URL.
// Without this, happy-dom sends relative URLs to http://localhost:3000.
const unexpected: string[] = []

function describeRequest(input: RequestInfo | URL, init?: RequestInit): string {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  const method = init?.method ?? (typeof input === 'object' && 'method' in input ? input.method : 'GET')
  return `${method} ${url}`
}

export const unexpectedFetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  const request = describeRequest(input, init)
  unexpected.push(request)
  return Promise.reject(new TypeError(`Unexpected network request in a test: ${request}. Mock fetch in this test.`))
}) as typeof fetch

globalThis.fetch = unexpectedFetch
if (typeof window !== 'undefined') window.fetch = unexpectedFetch

function report(): void {
  if (unexpected.length === 0) return
  const list = unexpected.splice(0)
  throw new Error(`Unexpected network request(s) in a test; mock fetch explicitly:\n  ${list.join('\n  ')}`)
}

afterEach(report)
afterAll(report)
