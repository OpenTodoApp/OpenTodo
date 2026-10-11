import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Dialog } from './Dialog'
import { ToastRegion } from './Toasts'

describe('Dialog', () => {
  it('renders a labelled modal with a pinned header and a close button before the content', () => {
    const html = renderToStaticMarkup(<Dialog title="Rename view" onClose={() => {}}><input aria-label="View name" /></Dialog>)
    expect(html).toContain('role="dialog"')
    expect(html).toContain('aria-modal="true"')
    expect(html).toContain('data-overlay="dialog"')
    expect(html).toContain('sticky top-0')
    // The overlay scrolls (iOS Safari), the card is full screen below 640 px.
    expect(html).toContain('overflow-y-auto overscroll-contain')
    expect(html).toContain('min-h-full w-full')
    const close = html.indexOf('data-overlay-close')
    expect(close).toBeGreaterThan(-1)
    expect(close).toBeLessThan(html.indexOf('View name'))
    // aria-labelledby points at the title.
    const id = /aria-labelledby="([^"]+)"/.exec(html)?.[1]
    expect(id).toBeTruthy()
    expect(html).toContain(`id="${id}"`)
  })

  it('uses an explicit label and the alertdialog role when asked', () => {
    const html = renderToStaticMarkup(<Dialog title={<b>Share</b>} label="Share Home" role="alertdialog" onClose={() => {}}>x</Dialog>)
    expect(html).toContain('role="alertdialog"')
    expect(html).toContain('aria-label="Share Home"')
  })
})

describe('ToastRegion', () => {
  it('keeps toasts clear of the home indicator and the on-screen keyboard', () => {
    const html = renderToStaticMarkup(<ToastRegion live="assertive"><p>hi</p></ToastRegion>)
    expect(html).toContain('aria-live="assertive"')
    expect(html).toContain('safe-area-inset-bottom')
    expect(html).toContain('--vv-bottom')
  })
})
