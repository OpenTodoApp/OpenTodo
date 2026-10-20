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

describe('Dialog placement (lean-chrome D3)', () => {
  it('center renders exactly as before: a full-screen card below 640 px', () => {
    const html = renderToStaticMarkup(<Dialog title="Rename" onClose={() => {}}>x</Dialog>)
    expect(html).toContain('class="h-fit min-h-full w-full bg-surface outline-none sm:surface-overlay sm:my-auto sm:min-h-0 sm:max-w-sm"')
    expect(html).toContain('pt-[env(safe-area-inset-top)]')
    expect(html).not.toContain('data-placement')
    expect(html).toBe(renderToStaticMarkup(<Dialog title="Rename" onClose={() => {}} placement="center">x</Dialog>))
  })

  it('sheet is anchored to the bottom, at most two thirds high, rounded on top, and the centred card from 640 px', () => {
    const html = renderToStaticMarkup(<Dialog title="Start" onClose={() => {}} placement="sheet">x</Dialog>)
    const card = /<div[^>]*data-overlay="dialog"[^>]*>/.exec(html)![0]
    expect(card).toContain('data-placement="sheet"')
    for (const c of ['mt-auto', 'max-h-[66dvh]', 'rounded-t-card', 'overflow-y-auto', 'dialog-sheet', 'sm:my-auto', 'sm:max-h-none', 'sm:surface-overlay']) expect(card).toContain(c)
    expect(card).not.toContain('min-h-full')
    expect(html).toContain('safe-area-inset-bottom')
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
