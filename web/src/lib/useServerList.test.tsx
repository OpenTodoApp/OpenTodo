// @vitest-environment happy-dom
import { act } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, waitFor } from '../ui/test-utils'
import { useServerList, type ServerList, type ServerListOptions } from './useServerList'

type Row = { id: string; name: string }

async function mount(opts: ServerListOptions<{ enabled: boolean }, Row>) {
  const box: { current: ServerList<Row> | null } = { current: null }
  function Probe() {
    box.current = useServerList(opts)
    return null
  }
  await render(<Probe />)
  return () => box.current!
}

describe('useServerList', () => {
  it('reads the rows only while the switch is on, and caches them', async () => {
    const list = vi.fn(async () => [{ id: 'a', name: 'A' }])
    const cache = vi.fn(async () => undefined)
    const s = await mount({ setting: async () => ({ enabled: true }), list, cached: async () => [], cache })
    await waitFor(() => s().rows !== null, 'rows')
    expect(s().enabled).toBe(true)
    expect(s().connected).toBe(true)
    expect(cache).toHaveBeenCalledWith([{ id: 'a', name: 'A' }])
    await act(async () => s().upsert({ id: 'b', name: 'B' }))
    await act(async () => s().upsert({ id: 'a', name: 'A2' }))
    expect(s().rows).toEqual([{ id: 'a', name: 'A2' }, { id: 'b', name: 'B' }])
    await act(async () => s().remove('a'))
    expect(s().rows).toEqual([{ id: 'b', name: 'B' }])

    const off = await mount({ setting: async () => ({ enabled: false }), list: vi.fn(async () => []), cached: async () => [], cache })
    await waitFor(() => off().enabled === false, 'switch read')
    expect(off().rows).toBeNull()
  })

  it('shows the cached rows until the server answers, and an unreachable server leaves them shown, not connected', async () => {
    const s = await mount({
      setting: () => Promise.reject(new TypeError('Failed to fetch')),
      list: async () => [],
      cached: async () => [{ id: 'c', name: 'Cached' }],
      cache: async () => undefined,
    })
    await waitFor(() => s().rows !== null, 'cached rows')
    expect(s().enabled).toBe(true)
    await waitFor(() => !s().connected, 'unreachable')
    expect(s().error).toBeNull()
  })
})
