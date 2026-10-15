import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, publicApi } from './api'

afterEach(() => vi.unstubAllGlobals())

describe('publicApi (public-links D8)', () => {
  it('never sends cookies and posts the tick body', async () => {
    const calls: [string, RequestInit][] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      calls.push([url, init])
      return new Response(JSON.stringify({ taskId: 't1', completed_at: 5 }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }))
    await publicApi.list('otl_abc')
    await publicApi.tick('otl_abc', 't1', true)
    expect(calls.map(([u, i]) => [u, i.credentials])).toEqual([['/api/v1/public/otl_abc', 'omit'], ['/api/v1/public/otl_abc/tick', 'omit']])
    expect(JSON.parse(calls[1][1].body as string)).toEqual({ taskId: 't1', completed: true })
  })

  it('surfaces link_invalid as an ApiError', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: { code: 'link_invalid', message: 'gone' } }), { status: 404, headers: { 'Content-Type': 'application/json' } })))
    await expect(publicApi.list('otl_x')).rejects.toMatchObject({ status: 404, code: 'link_invalid' })
    await expect(publicApi.list('otl_x')).rejects.toBeInstanceOf(ApiError)
  })
})
