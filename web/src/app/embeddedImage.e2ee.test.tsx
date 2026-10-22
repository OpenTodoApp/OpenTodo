// @vitest-environment happy-dom
// Embedded images of an encrypted account (OpenSpec change editor-everywhere,
// task 4.3, end-to-end-encryption "Reactions, note mentions and embedded images
// under encryption"): the device fetches the ciphertext from the app's own route,
// decrypts it and shows it; a locked device shows "Encrypted image".
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const key = { current: null as CryptoKey | null }
vi.mock('../lib/e2ee', async (orig) => ({ ...(await orig<typeof import('../lib/e2ee')>()), currentKey: async () => key.current }))
const decryptFile = vi.fn(async (_k: CryptoKey, _id: string, envelope: Blob, type?: string) => new Blob([`plain:${await envelope.text()}`], { type }))
vi.mock('../lib/crypto', async (orig) => ({ ...(await orig<typeof import('../lib/crypto')>()), decryptFile: (...a: Parameters<typeof decryptFile>) => decryptFile(...a) }))

const { setMeta, useDatabase } = await import('../lib/db')
const { applyOps, createTask, resetDeviceId } = await import('../lib/ops')
const { flush, render } = await import('../ui/test-utils')
const { Markdown } = await import('./Markdown')

let n = 0
let task = ''
beforeEach(async () => {
  useDatabase(`embedded-e2ee-${Date.now()}-${n++}`)
  resetDeviceId()
  await setMeta('userId', 'me')
  task = await createTask({ title: 'Passport scan' })
  let ts = 100
  const op = (field: string, value: unknown) => ({ id: `a-${field}`, entity: 'attachment' as const, entityId: 'att-e', field, value, ts: ts++, device: 'other' })
  await applyOps([op('task_id', task), op('author_id', 'me'), op('name', 'scan.png'), op('mime', 'image/png'), op('size', 9), op('sha256', 'ab'), op('encrypted', true), op('created_at', 5), op('uploaded_at', 9)])
})
afterEach(() => {
  key.current = null
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

async function waitFor(ok: () => boolean) {
  for (let i = 0; i < 100 && !ok(); i++) await flush(20)
  expect(ok()).toBe(true)
}

describe('embedded images under encryption', () => {
  it('Encrypted account: the ciphertext comes from the app route and is decrypted on the device', async () => {
    key.current = {} as CryptoKey
    const fetch = vi.fn(async () => new Response('CIPHER', { status: 200 }))
    vi.stubGlobal('fetch', fetch)
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:decrypted')
    vi.spyOn(URL, 'revokeObjectURL').mockReturnValue(undefined)
    const r = await render(<Markdown source="![scan](attachment:att-e)" taskId={task} />)
    await waitFor(() => !!r.container.querySelector('img'))
    expect(r.container.querySelector('img')!.getAttribute('src')).toBe('blob:decrypted')
    expect(String((fetch.mock.calls[0] as unknown[])[0])).toBe('/api/v1/attachments/att-e/content')
    expect(await (decryptFile.mock.calls[0][2] as Blob).text()).toBe('CIPHER')
    await r.unmount()
  })

  it('Embedded image on a locked device: "Encrypted image", nothing fetched', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    const r = await render(<Markdown source="![scan](attachment:att-e)" taskId={task} />)
    await waitFor(() => r.container.querySelector('[data-state]')?.getAttribute('data-state') === 'locked')
    expect(r.container.textContent).toContain('Encrypted image')
    expect(r.container.querySelector('img')).toBeNull()
    expect(fetch).not.toHaveBeenCalled()
    await r.unmount()
  })
})
