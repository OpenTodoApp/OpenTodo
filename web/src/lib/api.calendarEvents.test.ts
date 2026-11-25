import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from './api'

// The event routes of calendar-event-edits (task 4.1): addresses and bodies.
let calls: { url: string; init: RequestInit }[]
beforeEach(() => {
  calls = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, init })
    return init.method === 'DELETE' ? new Response(null, { status: 204 }) : new Response('{"event":{},"replaces":"e1"}', { status: 200, headers: { 'Content-Type': 'application/json' } })
  }))
})
afterEach(() => vi.unstubAllGlobals())

describe('calendar event API client', () => {
  it('patches, deletes with the rev and undoes an event of a connection', async () => {
    await api.updateCalendarEvent('c 1', 'e1', { rev: 'r1', summary: 'Planning' })
    expect(calls[0].url).toBe('/api/v1/calendar-sync/connections/c%201/events/e1')
    expect(calls[0].init.method).toBe('PATCH')
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ rev: 'r1', summary: 'Planning' })
    await api.deleteCalendarEvent('c1', 'e1', 'r/1')
    expect(calls[1].url).toBe('/api/v1/calendar-sync/connections/c1/events/e1?rev=r%2F1')
    expect(calls[1].init.method).toBe('DELETE')
    await api.undoCalendarEvent('c1', 'e2')
    expect(calls[2].url).toBe('/api/v1/calendar-sync/connections/c1/events/e2/undo')
    expect(calls[2].init.method).toBe('POST')
  })
})
