// @vitest-environment happy-dom
// haptic-kinds D2: a switch flipped and a segment chosen by touch play `selection`;
// the keyboard, the mouse and a click from a script play nothing.
import 'fake-indexeddb/auto'
import { act, useState } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useDatabase } from '../lib/db'
import { resetHaptics } from '../lib/haptics'
import { resetDeviceId } from '../lib/ops'
import { SegmentedControl } from './SegmentedControl'
import { Switch } from './Switch'
import { render, waitFor } from './test-utils'

let played: string[] = []
let n = 0
beforeEach(() => {
  useDatabase(`haptic-kinds-ui-${Date.now()}-${n++}`)
  resetDeviceId()
  resetHaptics()
  played = []
  window.opentodoShell = { bridge: 1, platform: 'ios', app: '1.6.0', capabilities: ['haptics'], haptic: (kind: string) => void played.push(kind) }
})
afterEach(() => { delete window.opentodoShell; resetHaptics() })

async function press(el: Element, pointerType: string | null) {
  await act(async () => {
    if (pointerType) el.dispatchEvent(new PointerEvent('pointerdown', { pointerType, bubbles: true }))
    ;(el as HTMLElement).click()
  })
}

function OneSwitch() {
  const [on, setOn] = useState(false)
  return <Switch checked={on} onChange={setOn} label="Show full task titles" />
}

function Segments() {
  const [v, setV] = useState<'list' | 'board'>('list')
  return <SegmentedControl label="Layout" value={v} onChange={setV} options={[{ id: 'list', label: 'List' }, { id: 'board', label: 'Board' }]} />
}

describe('selection haptics', () => {
  it('a switch flipped by touch plays selection once', async () => {
    const r = await render(<OneSwitch />)
    const sw = document.querySelector('[role="switch"]')!
    await press(sw, 'touch')
    await waitFor(() => played.length === 1, 'the haptic')
    expect(played).toEqual(['selection'])
    expect(sw.getAttribute('aria-checked')).toBe('true')
    await r.unmount()
  })

  it('a switch flipped by keyboard or mouse plays nothing (the scenario "A switch by keyboard")', async () => {
    const r = await render(<OneSwitch />)
    const sw = document.querySelector('[role="switch"]')!
    await press(sw, null)
    await press(sw, 'mouse')
    expect(sw.getAttribute('aria-checked')).toBe('false')
    // A touch afterwards plays, and is the only feedback of the three flips.
    await press(sw, 'touch')
    await waitFor(() => played.length === 1, 'the touch haptic')
    expect(played).toEqual(['selection'])
    await r.unmount()
  })

  it('a segment chosen by touch plays selection; the chosen segment again plays nothing', async () => {
    const r = await render(<Segments />)
    const board = document.querySelector('[data-segment="board"]')!
    await press(board, 'touch')
    await waitFor(() => played.length === 1, 'the haptic')
    await press(board, 'touch')
    await press(document.querySelector('[data-segment="list"]')!, null)
    // Back to Board by touch: the second feedback, so the two presses between played nothing.
    await press(board, 'touch')
    await waitFor(() => played.length === 2, 'the second haptic')
    expect(played).toEqual(['selection', 'selection'])
    await r.unmount()
  })
})
