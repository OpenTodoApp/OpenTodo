// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fileChunks, onSaveFailed, saveFile, type ShellFileChunk } from './saveFile'
import type { OpenTodoShell } from './shell'

const bytes = (n: number) => Uint8Array.from({ length: n }, (_, i) => i % 251)
const decode = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))

function shellWith(saveFileFn: (c: ShellFileChunk) => string | Promise<string>, capabilities = ['files']): ShellFileChunk[] {
  const calls: ShellFileChunk[] = []
  const bridge: OpenTodoShell = {
    bridge: 1, platform: 'android', app: '1.5.0', capabilities,
    saveFile: (json) => { const c = JSON.parse(json) as ShellFileChunk; calls.push(c); return saveFileFn(c) },
  }
  window.opentodoShell = bridge
  return calls
}

afterEach(() => {
  delete window.opentodoShell
  vi.restoreAllMocks()
})

describe('fileChunks', () => {
  it('cuts a file into ordered chunks that join back to it, the last one marked', () => {
    const data = bytes(2500)
    const chunks = fileChunks(data, 'id', 'a.bin', 'application/octet-stream', 1000)
    expect(chunks.map((c) => c.last)).toEqual([false, false, true])
    expect(chunks.every((c) => c.id === 'id' && c.name === 'a.bin')).toBe(true)
    expect(Uint8Array.from(chunks.flatMap((c) => [...decode(c.data)]))).toEqual(data)
  })

  it('sends an empty file and an exact multiple as they are', () => {
    expect(fileChunks(new Uint8Array(), 'id', 'empty.txt', 'text/plain')).toEqual([{ id: 'id', name: 'empty.txt', type: 'text/plain', data: '', last: true }])
    expect(fileChunks(bytes(2000), 'id', 'a', '', 1000).map((c) => c.last)).toEqual([false, true])
  })
})

describe('saveFile', () => {
  it('hands a shell with files every chunk in order and reports its answer', async () => {
    const calls = shellWith((c) => (c.last ? 'saved' : 'more'))
    const data = bytes(600 * 1024)
    await expect(saveFile(new Blob([data], { type: 'text/plain' }), 'key.txt')).resolves.toBe('saved')
    expect(calls.map((c) => c.last)).toEqual([false, false, true])
    expect(new Set(calls.map((c) => c.id)).size).toBe(1)
    expect(calls[0]).toMatchObject({ name: 'key.txt', type: 'text/plain' })
    expect(Uint8Array.from(calls.flatMap((c) => [...decode(c.data)]))).toEqual(data)
  })

  it('reports a cancelled dialog without calling it a failure', async () => {
    shellWith(() => Promise.resolve('cancelled'))
    const failed = vi.fn()
    const off = onSaveFailed(failed)
    await expect(saveFile(new Blob(['x']), 'a.txt')).resolves.toBe('cancelled')
    expect(failed).not.toHaveBeenCalled()
    off()
  })

  it('stops at a chunk the shell refuses and tells the listeners', async () => {
    const calls = shellWith(() => 'failed')
    const failed = vi.fn()
    const off = onSaveFailed(failed)
    await expect(saveFile(new Blob([bytes(600 * 1024)]), 'big.bin')).resolves.toBe('failed')
    expect(calls).toHaveLength(1)
    expect(failed).toHaveBeenCalledWith('big.bin')
    off()
  })

  it('fails when the shell throws or answers something else', async () => {
    shellWith(() => { throw new Error('gone') })
    await expect(saveFile(new Blob(['x']), 'a.txt')).resolves.toBe('failed')
    shellWith(() => 'ok')
    await expect(saveFile(new Blob(['x']), 'a.txt')).resolves.toBe('failed')
  })

  it('clicks a download link in a browser and in a shell without files', async () => {
    const calls = shellWith(() => 'saved', ['reminders'])
    URL.createObjectURL = vi.fn(() => 'blob:x')
    URL.revokeObjectURL = vi.fn()
    const clicked: { href: string; download: string }[] = []
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { clicked.push({ href: this.href, download: this.download }) })
    await expect(saveFile(new Blob(['x']), 'a.txt')).resolves.toBe('saved')
    delete window.opentodoShell
    await expect(saveFile(new Blob(['x']), 'b.txt')).resolves.toBe('saved')
    expect(calls).toHaveLength(0)
    expect(clicked.map((c) => c.download)).toEqual(['a.txt', 'b.txt'])
  })
})
