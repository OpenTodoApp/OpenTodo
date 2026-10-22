// @vitest-environment happy-dom
// A settings section draws its cards together once each has its first answer
// (OpenSpec change motion-polish, D3; task-list-presentation "Skeleton loading").
import { act, useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { flush, render } from '../ui/test-utils'
import { SETTLE_MS, SettingsPendingGate, useSettingsPending } from './settingsPending'

let setters: Record<string, (v: boolean) => void> = {}
function Card({ name, waiting }: { name: string; waiting: boolean }) {
  const [w, setW] = useState(waiting)
  setters[name] = setW
  useSettingsPending(w)
  return <p>{name}</p>
}
const settling = (c: HTMLElement) => !!c.querySelector('[data-settings-settling]')

afterEach(() => { setters = {}; vi.useRealTimers() })

describe('settings sections settle before they show', () => {
  it('shows at once when no card waits', async () => {
    const r = await render(<SettingsPendingGate><Card name="a" waiting={false} /></SettingsPendingGate>)
    expect(settling(r.container)).toBe(false)
    await r.unmount()
  })

  it('stays invisible until the last card answers, then never hides again', async () => {
    const r = await render(<SettingsPendingGate><Card name="a" waiting /><Card name="b" waiting /></SettingsPendingGate>)
    expect(settling(r.container)).toBe(true)
    expect(r.container.querySelector('[aria-busy="true"]')).not.toBeNull()
    await flush(); setters.a(false); await flush()
    expect(settling(r.container)).toBe(true)
    setters.b(false); await flush()
    expect(settling(r.container)).toBe(false)
    // A reload after a change: the section stays visible.
    setters.a(true); await flush()
    expect(settling(r.container)).toBe(false)
    await r.unmount()
  })

  it(`shows after ${SETTLE_MS} ms even if a card never answers`, async () => {
    vi.useFakeTimers()
    const r = await render(<SettingsPendingGate><Card name="a" waiting /></SettingsPendingGate>)
    expect(settling(r.container)).toBe(true)
    await act(() => vi.advanceTimersByTimeAsync(SETTLE_MS + 10))
    expect(settling(r.container)).toBe(false)
    await r.unmount()
  })

  it('a card outside a gate reports to no one', async () => {
    const r = await render(<Card name="alone" waiting />)
    expect(r.container.textContent).toBe('alone')
    await r.unmount()
  })
})
