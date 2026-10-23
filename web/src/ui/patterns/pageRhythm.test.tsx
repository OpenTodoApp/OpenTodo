// @vitest-environment happy-dom
// The page rhythm (OpenSpec change page-rhythm): the lead line under the title (D1),
// the two frames (D3; list-stays-still D1), and group headers as labels (D2).
import { afterEach, describe, expect, it, vi } from 'vitest'
import { render } from '../test-utils'
import { frameKind, PageBody, PageHeader } from './PageHeader'
import { pageBar } from './pageBar'

afterEach(() => { vi.unstubAllGlobals() })

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
    expect(css).toMatch(/\.page-frame\[data-page-body="list"\]\s*\{\s*--page-width:\s*60rem/)
    // page-frame-v3 D1: the header takes the content width too (plus a sticky header's bleed).
    expect(css).toMatch(/\.page-frame\[data-page-body\]:not\(\[data-page-body="full"\]\) > \* \{ max-width: var\(--page-width\); \}/)
    expect(css).toMatch(/> \[data-page-header\]\.sticky \{ max-width: calc\(var\(--page-width\) \+ 4rem\); \}/)
    expect(css).toMatch(/\.page-frame\[data-page-body="form"\]\s*\{\s*--page-width:\s*42rem/)
    expect(css).toMatch(/\.page-frame\[data-page-body="wide"\]\s*\{\s*--page-width:\s*72rem/)
  })
})

describe('opening the panel moves nothing (list-stays-still D1)', () => {
  it('puts both frames at the column\'s left edge, never centred', async () => {
    const css = (await import('../../index.css?raw')).default
    expect(css).toMatch(/\.page-frame\s*\{\s*margin-left:\s*0;\s*margin-right:\s*auto;\s*\}/)
    const r = await render(<PageBody width="list"><p>row</p></PageBody>)
    expect(r.container.querySelector('[data-page-body]')!.className).not.toContain('mx-auto')
  })
  it('gives the docked panel one width, 26 rem and 30 rem from 1440 px', async () => {
    const css = (await import('../../index.css?raw')).default
    expect(css).toMatch(/:root\s*\{\s*--panel-w:\s*26rem;\s*\}/)
    expect(css).toMatch(/@media \(min-width: 1440px\)\s*\{\s*:root\s*\{\s*--panel-w:\s*30rem;\s*\}\s*\}/)
    const sources = import.meta.glob(['../../app/PanelFrame.tsx', '../../app/task-detail/TaskDetail.tsx'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>
    for (const [path, src] of Object.entries(sources)) {
      expect(src, path).toContain('lg:w-(--panel-w)')
      expect(src, path).not.toMatch(/min-\[1440px\]:w-|lg:w-\[26rem\]/)
    }
  })
})
