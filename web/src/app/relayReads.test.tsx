// @vitest-environment happy-dom
// Relay requests the device can see and refuse (OpenSpec change
// relay-request-transparency): the read sheet, the "Confirm reads first" row,
// the connector in the recent list and the footer mark's label.
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../lib/db'
import { encryptValue, generateAccountKey } from '../lib/crypto'
import { click, flush, mockFetch, render, waitFor } from '../ui/test-utils'

const key = vi.hoisted(() => ({ current: null as CryptoKey | null }))
vi.mock('../lib/e2ee', async (orig) => ({ ...(await orig<typeof import('../lib/e2ee')>()), currentKey: async () => key.current }))

const { answer, setConfirmReads } = await import('../lib/relay')
const { RelayConfirm, RelayConfirmView, SHOWN_MAX } = await import('./RelayConfirm')
const { RelayIndicatorView, RelayView } = await import('./RelaySettings')

beforeEach(async () => {
  await db.delete()
  await db.open()
  key.current = await generateAccountKey()
  mockFetch(() => ({ devices: [] }))
})

describe('read sheet', () => {
  it('names the connector, the tool and the arguments, shows the text, and Decline sends nothing', async () => {
    await setConfirmReads(true)
    const ct = await encryptValue(key.current!, 'task', 't1', 'title', 'Call the plumber')
    const r = await render(<RelayConfirm />)
    const pending = answer({ op: 'decrypt', items: [{ entity: 'task', id: 't1', field: 'title', value: ct }], call: { tool: 'get_task', token: 'Claude.ai', args: '{"id":"t1"}', write: false }, deadline: Date.now() + 10_000 })
    await waitFor(() => !!document.querySelector('[data-relay-decline]'), 'the sheet')
    const text = document.body.textContent ?? ''
    expect(text).toContain('Claude.ai')
    expect(text).toContain('get_task')
    expect(document.querySelector('[data-relay-args]')!.textContent).toBe('{"id":"t1"}')
    expect(text).toContain('Call the plumber')
    expect(document.querySelector('[data-relay-apply]')!.textContent).toBe('Allow')
    await click(document.querySelector('[data-relay-decline]')!)
    expect(await pending).toEqual({ error: 'declined_on_device' })
    await flush()
    expect(document.querySelector('[data-relay-decline]')).toBeNull()
    await r.unmount()
  })

  it(`lists at most ${SHOWN_MAX} values and counts the rest`, async () => {
    const items = Array.from({ length: SHOWN_MAX + 5 }, (_, i) => ({ entity: 'task', id: `t${i}`, field: 'title', value: `Task ${i}` }))
    const r = await render(<RelayConfirmView op="decrypt" tool="list_tasks" items={items} onApply={() => {}} onDecline={() => {}} />)
    expect(document.querySelectorAll('[data-testid="relay-confirm"] li, [role="dialog"] li').length).toBe(SHOWN_MAX)
    expect(document.body.textContent).toContain('and 5 more values')
    await r.unmount()
  })
})

describe('settings and footer', () => {
  const base = { unlocked: true, optedIn: true, connected: true, confirmWrites: false, devices: [], recent: [], busy: false, error: null, onConfirmWrites: () => {}, onToggle: () => {} }

  it('offers Confirm reads first while opted in, and names the connector in recent requests', async () => {
    const onConfirmReads = vi.fn()
    const at = Date.UTC(2026, 10, 6, 9, 30)
    const r = await render(<RelayView {...base} onConfirmReads={onConfirmReads} recent={[{ at, tool: 'list_tasks', token: 'Claude.ai', op: 'decrypt', count: 24, outcome: 'answered' }]} />)
    expect(document.body.textContent).toContain('Confirm reads first')
    const row = document.querySelector('[role="switch"][aria-describedby="relay-confirm-reads-help"]')
    expect(row).toBeTruthy()
    await click(row!)
    expect(onConfirmReads).toHaveBeenCalledWith(true)
    expect(document.querySelector('[data-relay-recent]')!.textContent).toContain('Claude.ai')
    await r.unmount()
    const off = await render(<RelayView {...base} optedIn={false} />)
    expect(document.body.textContent).not.toContain('Confirm reads first')
    await off.unmount()
  })

  it('the footer mark names the call it answers', async () => {
    const r = await render(<RelayIndicatorView busy answering={{ tool: 'list_tasks', token: 'Claude.ai' }} />)
    expect(document.querySelector('[data-relay-indicator]')!.textContent).toContain('Answering Claude.ai: list_tasks')
    await r.unmount()
  })
})
