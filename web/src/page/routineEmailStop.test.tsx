// @vitest-environment happy-dom
// The stop page of a routine email (OpenSpec change routines-shared-email):
// the routine's name, only the button stops, an invalid link.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { click, render, waitFor } from '../ui/test-utils'
import { RoutineEmailStopScreen } from './RoutineEmailStopScreen'

let calls: string[] = []
let stopped = false
let invalid = false

beforeEach(() => {
  calls = []
  stopped = false
  invalid = false
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    calls.push(`${init?.method ?? 'GET'} ${url}`)
    expect(init?.credentials).toBe('omit')
    if (invalid) return new Response(JSON.stringify({ error: { code: 'link_invalid', message: 'this link is no longer valid' } }), { status: 404 })
    if (init?.method === 'POST') stopped = true
    return new Response(JSON.stringify({ routine: 'Weekly chores', stopped }), { status: 200 })
  }))
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('routine email stop page', () => {
  it('names the routine and stops only on the button', async () => {
    await render(<RoutineEmailStopScreen token="ots_abc" />)
    await waitFor(() => !!document.querySelector('[data-stop-button]'), 'the button')
    expect(document.body.textContent).toContain('Stop emails from “Weekly chores”?')
    expect(calls).toEqual(['GET /api/v1/routine-emails/ots_abc'])
    await click(document.querySelector<HTMLElement>('[data-stop-button]')!)
    await waitFor(() => !!document.querySelector('[data-stop-done]'), 'stopped')
    expect(document.body.textContent).toContain('You will get no more emails from “Weekly chores”.')
    expect(calls).toEqual(['GET /api/v1/routine-emails/ots_abc', 'POST /api/v1/routine-emails/ots_abc/stop'])
  })

  it('says when the link is no longer valid', async () => {
    invalid = true
    await render(<RoutineEmailStopScreen token="ots_gone" />)
    await waitFor(() => !!document.querySelector('[data-stop-invalid]'), 'invalid')
    expect(document.querySelector('[data-stop-button]')).toBeNull()
  })
})
