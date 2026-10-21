// @vitest-environment happy-dom
// Device relay screens (OpenSpec change mcp-device-relay): the settings card
// and the confirmation sheet of a relayed write.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../lib/db'
import { encryptValue, generateAccountKey } from '../lib/crypto'
import { click, flush, mockFetch, render, waitFor } from '../ui/test-utils'

const key = vi.hoisted(() => ({ current: null as CryptoKey | null }))
vi.mock('../lib/e2ee', async (orig) => ({ ...(await orig<typeof import('../lib/e2ee')>()), currentKey: async () => key.current }))

const { answer, setConfirmWrites } = await import('../lib/relay')
const { RelayConfirm } = await import('./RelayConfirm')
const { RelayView } = await import('./RelaySettings')

beforeEach(async () => {
  await db.delete()
  await db.open()
  key.current = await generateAccountKey()
  mockFetch(() => ({ devices: [] }))
})
afterEach(() => {
  document.body.innerHTML = ''
})

const write = (title: string) => ({ op: 'encrypt' as const, items: [{ entity: 'task', id: 't1', field: 'title', value: title }], call: { tool: 'create_tasks', token: 'Claude.ai', write: true }, deadline: Date.now() + 10_000 })

describe('confirmation sheet', () => {
  it('shows the text to write and Decline answers declined_on_device', async () => {
    await setConfirmWrites(true)
    const r = await render(<RelayConfirm />)
    const pending = answer(write('Call the plumber'))
    await waitFor(() => !!document.querySelector('[data-relay-decline]'), 'the sheet')
    expect(document.body.textContent).toContain('Call the plumber')
    expect(document.body.textContent).toContain('Claude.ai')
    await click(document.querySelector('[data-relay-decline]')!)
    expect(await pending).toEqual({ error: 'declined_on_device' })
    await flush()
    expect(document.querySelector('[data-relay-decline]')).toBeNull()
    await r.unmount()
  })

  it('Apply encrypts the text with the account key', async () => {
    await setConfirmWrites(true)
    const r = await render(<RelayConfirm />)
    const pending = answer(write('Buy paint'))
    await waitFor(() => !!document.querySelector('[data-relay-apply]'), 'the sheet')
    await click(document.querySelector('[data-relay-apply]')!)
    const out = await pending
    expect('results' in out && out.results[0].value?.startsWith('enc:v1:')).toBe(true)
    await r.unmount()
  })

  it('never asks for a read', async () => {
    await setConfirmWrites(true)
    const ct = await encryptValue(key.current!, 'task', 't1', 'title', 'x')
    const r = await render(<RelayConfirm />)
    expect(await answer({ op: 'decrypt', items: [{ entity: 'task', id: 't1', field: 'title', value: ct }], call: { tool: 'get_task', write: false }, deadline: Date.now() + 10_000 })).toEqual({ results: [{ value: 'x' }] })
    expect(document.querySelector('[data-relay-apply]')).toBeNull()
    await r.unmount()
  })
})

describe('settings card', () => {
  const base = { unlocked: true, optedIn: false, connected: false, confirmWrites: false, devices: [], recent: [], busy: false, error: null, onConfirmWrites: () => {} }

  it('states the trust model and turns on with one switch', async () => {
    const onToggle = vi.fn()
    const r = await render(<RelayView {...base} onToggle={onToggle} />)
    expect(document.body.textContent).toContain('passes through your server')
    expect(document.body.textContent).toContain('5,000')
    await click(document.querySelector('[data-relay-settings] [role="switch"]')!)
    expect(onToggle).toHaveBeenCalledWith(true)
    await r.unmount()
  })

  it('needs an unlocked device to turn on, and lists recent requests without their text', async () => {
    const r = await render(<RelayView {...base} unlocked={false} onToggle={() => {}} />)
    expect(document.querySelector<HTMLButtonElement>('[data-relay-settings] [role="switch"]')!.disabled).toBe(true)
    await r.unmount()
    const at = Date.UTC(2026, 9, 21, 9, 30)
    const r2 = await render(<RelayView {...base} optedIn connected recent={[{ at, tool: 'list_tasks', op: 'decrypt', count: 24, outcome: 'answered' }]} onToggle={() => {}} />)
    expect(document.querySelector('[data-relay-recent]')!.textContent).toContain('list_tasks')
    expect(document.querySelector('[data-relay-recent]')!.textContent).toContain('24')
    await r2.unmount()
  })
})
