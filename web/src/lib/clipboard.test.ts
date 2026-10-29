// @vitest-environment happy-dom
// Copy buttons work without https (issue 525).
import { afterEach, describe, expect, it, vi } from 'vitest'
import { copyText } from './clipboard'

const realClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
function setClipboard(value: unknown) {
  Object.defineProperty(navigator, 'clipboard', { value, configurable: true })
}
/** happy-dom has no execCommand: the browser's, as a mock. */
function execCommand(impl: (cmd: string) => boolean = () => true) {
  const fn = vi.fn(impl)
  Object.defineProperty(document, 'execCommand', { value: fn, configurable: true, writable: true })
  return fn
}

afterEach(() => {
  if (realClipboard) Object.defineProperty(navigator, 'clipboard', realClipboard)
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

describe('copyText', () => {
  it('uses the Clipboard API where the page is a secure context', async () => {
    const writeText = vi.fn(async () => undefined)
    setClipboard({ writeText })
    const exec = execCommand()
    await copyText('https://todo.example/mcp')
    expect(writeText).toHaveBeenCalledWith('https://todo.example/mcp')
    expect(exec).not.toHaveBeenCalled()
  })

  it('falls back to the copy command on plain http, where there is no Clipboard API', async () => {
    setClipboard(undefined)
    let copied = ''
    execCommand((cmd) => {
      const field = document.querySelector('textarea')
      copied = cmd === 'copy' && field ? field.value : ''
      return true
    })
    await copyText('http://192.168.1.10:8080/mcp')
    expect(copied).toBe('http://192.168.1.10:8080/mcp')
    expect(document.querySelector('textarea')).toBeNull()
  })

  it('falls back when the API refuses, and rejects when nothing works', async () => {
    setClipboard({ writeText: vi.fn(async () => { throw new Error('denied') }) })
    const exec = execCommand()
    await copyText('a')
    expect(exec).toHaveBeenCalledWith('copy')
    exec.mockReturnValue(false)
    await expect(copyText('b')).rejects.toThrow()
  })

  it('gives focus back to the control that was clicked', async () => {
    setClipboard(undefined)
    execCommand()
    document.body.innerHTML = '<div role="dialog"><button id="copy">Copy</button></div>'
    const button = document.getElementById('copy') as HTMLButtonElement
    button.focus()
    await copyText('secret')
    expect(document.activeElement).toBe(button)
  })
})
