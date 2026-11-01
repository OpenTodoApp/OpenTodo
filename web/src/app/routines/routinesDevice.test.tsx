// @vitest-environment happy-dom
// The editor's warning for an encrypted account (OpenSpec change
// routines-ai-step, 4.4) and Settings → Encryption's routines opt-in.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { click, render, type Rendered } from '../../ui/test-utils'
import { EncryptedRoutineNoteView, RoutinesDeviceView } from './RoutinesDevice'
import type { RelayDevice } from '../../lib/relay'

const laptop: RelayDevice = { deviceId: 'laptop', label: 'Firefox on Linux', enabledAt: 1, online: false, thisSession: false, routines: true, mcp: false, connected: true, capabilities: ['routines', 'ai'] }

let r: Rendered | null = null
afterEach(async () => { await r?.unmount(); r = null })

const button = (name: string) => [...r!.container.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === name || b.textContent === name)

describe('the editor warning on an encrypted account', () => {
  it('"Scheduling on an encrypted account": the warning with the opt-in', async () => {
    const onTurnOn = vi.fn()
    r = await render(<EncryptedRoutineNoteView on={false} devices={[]} unlocked busy={false} error={null} onTurnOn={onTurnOn} />)
    expect(r.container.textContent).toContain('This routine reads text, so it runs on one of your devices')
    expect(r.container.textContent).toContain('Turn on Run my routines on a device.')
    await click(button('Run my routines on this device')!)
    expect(onTurnOn).toHaveBeenCalled()
  })

  it('lists the devices that run routines once one is opted in', async () => {
    r = await render(<EncryptedRoutineNoteView on devices={[laptop]} unlocked busy={false} error={null} onTurnOn={() => undefined} />)
    expect(r.container.textContent).toContain('Runs on: Firefox on Linux')
    expect(button('Run my routines on this device')).toBeUndefined()
  })
})

describe('Settings → Encryption: Run my routines on this device', () => {
  it('shows the routine running, the devices and the recent runs; another device can be turned off', async () => {
    const onTurnOff = vi.fn()
    r = await render(<RoutinesDeviceView unlocked on connected running="Groceries" devices={[laptop]} busy={false} error={null}
      recent={[{ at: 1, rule: 'g', name: 'Groceries', outcome: 'proposal', writes: 0 }]} onToggle={() => undefined} onTurnOff={onTurnOff} />)
    const text = r.container.textContent ?? ''
    expect(text).toContain('Running Groceries…')
    expect(text).toContain('AI steps')
    expect(text).toContain('Proposal waiting')
    await click(button('Turn off for Firefox on Linux')!)
    expect(onTurnOff).toHaveBeenCalledWith('laptop')
  })

  it('cannot be turned on while locked', async () => {
    r = await render(<RoutinesDeviceView unlocked={false} on={false} connected={false} running={null} devices={[]} recent={[]} busy={false} error={null}
      onToggle={() => undefined} onTurnOff={() => undefined} />)
    expect(r.container.textContent).toContain('Unlock this device to turn it on.')
    const sw = r.container.querySelector('[role="switch"]') as HTMLButtonElement | null
    expect(sw?.disabled).toBe(true)
  })
})
