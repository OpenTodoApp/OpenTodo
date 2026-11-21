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
  it('saves a file the device does not hold from the server, for the eye and for Download alike, and opens no window', async () => {
    window.opentodoShell = iosShell
    const opened = vi.spyOn(window, 'open').mockImplementation(() => null)
    const clicks = clickedAnchors()
    await openAttachment(file())
    await openAttachment(file(), { download: true })
    expect(opened).not.toHaveBeenCalled()
    expect(clicks).toEqual([
      { href: '/api/v1/attachments/a1/content?download=1', download: 'plan.pdf', target: '' },
      { href: '/api/v1/attachments/a1/content?download=1', download: 'plan.pdf', target: '' },
    ])
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
