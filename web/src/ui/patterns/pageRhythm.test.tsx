// @vitest-environment happy-dom
// The page rhythm (OpenSpec change page-rhythm): the lead line under the title (D1),
// the two frames and the slide (D3, D4), and group headers as labels (D2).
import { afterEach, describe, expect, it, vi } from 'vitest'
import { render } from '../test-utils'
import { frameKind, PageBody, PageHeader } from './PageHeader'
import { pageBar } from './pageBar'
import { frameSlideAllowed, FRAME_JUMP_PX, slideFrom } from './frameSlide'

afterEach(() => { vi.unstubAllGlobals(); delete document.documentElement.dataset.motion })

/** matchMedia answering `width` for min-width queries and `reduce` for reduced motion. */
function stubMedia(width: number, reduce = false) {
  vi.stubGlobal('matchMedia', (q: string) => {
    const min = /min-width:\s*(\d+)px/.exec(q)
    const matches = min ? width >= Number(min[1]) : q.includes('reduced-motion') ? reduce : false
    return { matches, media: q, addEventListener() {}, removeEventListener() {} }
  })
}

describe('PageHeader lead line (page-rhythm D1)', () => {
  it('puts the title on its own line at the display step and the meta under it', async () => {
    stubMedia(1280)
    const r = await render(<PageHeader title="Today" meta="Wednesday 21 October · 5 h 15 m planned" actions={<button>Add</button>} help="today" />)
    const title = r.container.querySelector('[data-page-title]')!
    expect(title.className).toContain('text-display')
    const lead = r.container.querySelector('[data-page-lead]')!
    expect(lead.textContent).toBe('Wednesday 21 October · 5 h 15 m planned')
    expect(lead.className).toContain('text-muted')
    expect(lead.className).toContain('text-meta')
    // The title's row holds the title and the actions, not the lead line.
    const row = r.container.querySelector('[data-page-header-row]')!
    expect(row.contains(lead)).toBe(false)
    expect(row.querySelector('[data-page-actions]')).not.toBeNull()
    // One header element: the lead line is inside it (the interface budget counts elements).
    expect(r.container.querySelectorAll('[data-page-header]')).toHaveLength(1)
    expect(r.container.querySelector('[data-page-header]')!.contains(lead)).toBe(true)
    await r.unmount()
  })

  it('renders no lead line without meta', async () => {
    stubMedia(1280)
    const r = await render(<PageHeader title="Inbox" />)
    expect(r.container.querySelector('[data-page-lead]')).toBeNull()
    await r.unmount()
  })

  it('below 768 px gives the lead line to the shell bar as its subtitle', async () => {
    stubMedia(390)
    const r = await render(<PageHeader title="Today" meta="Wednesday 21 October" />)
    expect(pageBar()?.title).toBe('Today')
    expect(pageBar()?.subtitle).toBe('Wednesday 21 October')
    expect(r.container.querySelector('[data-page-title]')).toBeNull()
    expect(r.container.querySelector('[data-page-lead]')).toBeNull()
    await r.unmount()
  })

  it('keeps an explicit subtitle for the bar (the board column)', async () => {
    stubMedia(390)
    const r = await render(<PageHeader title="Q4 launch" meta="3 members" subtitle="Doing" />)
    expect(pageBar()?.subtitle).toBe('Doing')
    await r.unmount()
  })
})

describe('two frames (page-rhythm D3)', () => {
  it('a page without a layout switch is standalone; a full page is a layout page', () => {
    expect(frameKind('list')).toBe('standalone')
    expect(frameKind('form')).toBe('standalone')
    expect(frameKind('wide')).toBe('standalone')
    expect(frameKind('wide', 'layout')).toBe('layout')
    expect(frameKind('full')).toBe('layout')
    expect(frameKind('full', 'standalone')).toBe('layout')
  })

  it('PageBody marks its frame and width', async () => {
    const r = await render(<><PageBody width="list" data-a>a</PageBody><PageBody width="full" data-b>b</PageBody></>)
    const a = r.container.querySelector('[data-a]')!
    const b = r.container.querySelector('[data-b]')!
    expect([a.getAttribute('data-page-frame'), a.getAttribute('data-page-body')]).toEqual(['standalone', 'list'])
    expect([b.getAttribute('data-page-frame'), b.getAttribute('data-page-body')]).toEqual(['layout', 'full'])
    await r.unmount()
  })

  it('the stylesheet gives a standalone frame its content width plus the padding', async () => {
    const css = (await import('../../index.css?raw')).default
    expect(css).toMatch(/\.page-frame\[data-page-frame="standalone"\]\s*\{[^}]*max-width:\s*calc\(var\(--page-width, 80rem\) \+ 2 \* var\(--page-gutter\)\)/)
    expect(css).toMatch(/\.page-frame\[data-page-body="list"\]\s*\{\s*--page-width:\s*48rem/)
    expect(css).toMatch(/\.page-frame\[data-page-body="form"\]\s*\{\s*--page-width:\s*42rem/)
    expect(css).toMatch(/\.page-frame\[data-page-body="wide"\]\s*\{\s*--page-width:\s*72rem/)
  })
})

describe('the frame slides when the panel docks (page-rhythm D4)', () => {
  const before = { width: 1664, left: 416 }
  it('slides by the distance the frame jumped when the column narrows by a panel', () => {
    expect(slideFrom(before, { width: 1184, left: 176 }, true)).toBe(240)
    expect(slideFrom({ width: 1184, left: 176 }, before, true)).toBe(-240)
  })
  it('does not slide for a window drag, nothing moving, or reduced motion', () => {
    expect(slideFrom(before, { width: before.width - FRAME_JUMP_PX + 1, left: 300 }, true)).toBeNull()
    expect(slideFrom({ width: 1184, left: 0 }, { width: 768, left: 0 }, true)).toBeNull()
    expect(slideFrom(before, { width: 1184, left: 176 }, false)).toBeNull()
  })
  it('is not allowed under reduced motion or the no-motion setting', () => {
    stubMedia(1920, false)
    expect(frameSlideAllowed()).toBe(true)
    stubMedia(1920, true)
    expect(frameSlideAllowed()).toBe(false)
    stubMedia(1920, false)
    document.documentElement.dataset.motion = 'none'
    expect(frameSlideAllowed()).toBe(false)
  })
})
