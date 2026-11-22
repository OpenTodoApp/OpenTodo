// @vitest-environment happy-dom
// Opening an attachment inside a phone shell (#1654). A web view has no tabs: a new
// window is blocked once the tap's gesture has passed an await, or handed to the system
// browser, which has no session and no object URL of the page. In a shell every open is
// a save, through the paths the shell handles (shell-repairs "Saving a file from the app").
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { openAttachment } from './attachmentOpen'
import { db, useDatabase } from './db'
import type { OpenTodoShell } from './shell'
import type { Attachment } from './types'

const iosShell: OpenTodoShell = { bridge: 1, platform: 'ios', app: '1.5.0', capabilities: ['reminders', 'widgets', 'share', 'links'] }

const file = (over: Partial<Attachment> = {}) => ({ id: 'a1', name: 'plan.pdf', mime: 'application/pdf', size: 5, uploaded_at: 1, ...over } as unknown as Attachment)

/** Every anchor the code clicks, with what it carried. */
function clickedAnchors() {
  const clicks: { href: string; download: string; target: string }[] = []
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    clicks.push({ href: this.getAttribute('href') ?? '', download: this.download, target: this.target })
  })
  return clicks
}

let n = 0
beforeEach(() => { useDatabase(`attachment-open-${Date.now()}-${n++}`) })
afterEach(() => {
  delete window.opentodoShell
  vi.restoreAllMocks()
})

describe('opening an attachment in the phone app (#1654)', () => {
  it('saves a file the device does not hold from the server, with its real type for the eye and as a download for Download, and opens no window', async () => {
    window.opentodoShell = iosShell
    const opened = vi.spyOn(window, 'open').mockImplementation(() => null)
    const clicks = clickedAnchors()
    await openAttachment(file())
    await openAttachment(file(), { download: true })
    expect(opened).not.toHaveBeenCalled()
    expect(clicks).toEqual([
      { href: '/api/v1/attachments/a1/content', download: 'plan.pdf', target: '' },
      { href: '/api/v1/attachments/a1/content?download=1', download: 'plan.pdf', target: '' },
    ])
  })

  it('asks the server for a risky type as a download, so the shell offers only the save dialog', async () => {
    window.opentodoShell = iosShell
    const clicks = clickedAnchors()
    await openAttachment(file({ mime: 'image/svg+xml', name: 'logo.svg' }))
    expect(clicks).toEqual([{ href: '/api/v1/attachments/a1/content?download=1', download: 'logo.svg', target: '' }])
  })

  it('saves a file the device holds instead of opening its object URL in a new window', async () => {
    window.opentodoShell = iosShell
    await db.attachmentBlobs.put({ id: 'a1', blob: new Blob(['hello'], { type: 'image/png' }) } as never)
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:https://todo.example.com/x')
    const clicks = clickedAnchors()
    await openAttachment(file({ mime: 'image/png', name: 'photo.png' }))
    await vi.waitFor(() => expect(clicks).toHaveLength(1))
    expect(clicks[0]).toEqual({ href: 'blob:https://todo.example.com/x', download: 'photo.png', target: '' })
  })

  it('still opens a link attachment in the system browser', async () => {
    window.opentodoShell = iosShell
    const opened = vi.spyOn(window, 'open').mockImplementation(() => null)
    await openAttachment(file({ url: 'https://example.com/a' }))
    expect(opened).toHaveBeenCalledWith('https://example.com/a', '_blank', 'noopener,noreferrer')
  })

  it('in a browser keeps the new tab', async () => {
    const opened = vi.spyOn(window, 'open').mockImplementation(() => null)
    await openAttachment(file())
    expect(opened).toHaveBeenCalledWith('/api/v1/attachments/a1/content', '_blank', 'noopener')
  })
})

describe('opening an attachment in a browser tab, inside the click (WebKit)', () => {
  /** A tab window.open hands back, recording where it was sent. */
  function fakeTab() {
    const tab = { location: { href: 'about:blank' }, opener: {} as unknown, close: vi.fn() }
    const opened = vi.spyOn(window, 'open').mockImplementation(() => tab as unknown as Window)
    return { tab, opened }
  }

  it('opens the tab before any await, then sends it to the server file', async () => {
    const { tab, opened } = fakeTab()
    const done = openAttachment(file({ mime: 'image/jpeg', name: 'photo.jpg' }))
    // Still inside the click: Safari and the Home Screen app allow a window only now.
    expect(opened).toHaveBeenCalledTimes(1)
    expect(opened).toHaveBeenCalledWith('about:blank', '_blank')
    await done
    expect(tab.opener).toBeNull()
    expect(tab.location.href).toBe('/api/v1/attachments/a1/content')
    expect(opened).toHaveBeenCalledTimes(1)
  })

  it('sends the tab to the copy this device holds', async () => {
    await db.attachmentBlobs.put({ id: 'a1', blob: new Blob(['hello'], { type: 'image/png' }) } as never)
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:https://todo.example.com/x')
    const { tab, opened } = fakeTab()
    const done = openAttachment(file({ mime: 'image/png', name: 'photo.png' }))
    expect(opened).toHaveBeenCalledTimes(1)
    await done
    expect(tab.location.href).toBe('blob:https://todo.example.com/x')
  })

  it('closes the tab when the file cannot be opened', async () => {
    const { tab } = fakeTab()
    await expect(openAttachment(file({ mime: 'image/png', encrypted: true } as Partial<Attachment>))).rejects.toThrow()
    expect(tab.close).toHaveBeenCalled()
  })

  it('opens no early tab for a download or a type the browser does not show', async () => {
    const opened = vi.spyOn(window, 'open').mockImplementation(() => null)
    clickedAnchors()
    void openAttachment(file({ mime: 'application/zip', name: 'a.zip' }))
    void openAttachment(file({ mime: 'image/png' }), { download: true })
    expect(opened).not.toHaveBeenCalled()
  })
})
