// @vitest-environment happy-dom
// Sidebar counts and markers (OpenSpec change quiet-sidebar, design D1 and D4): a count
// is always in the row's accessible name; it is visible always, on hover or focus, or
// never, and revealing it never changes the row's box.
import { afterEach, describe, expect, it } from 'vitest'
import { render, spokenText, visibleText } from '../test-utils'
import { SidebarItem, StatusDot } from './Sidebar'

afterEach(() => { document.body.innerHTML = '' })

const row = (mode?: 'always' | 'hover' | 'hidden', count?: number) =>
  <SidebarItem label="Website launch" count={count} countMode={mode} countLabel={count ? `${count} open tasks` : undefined} />

describe('SidebarItem counts', () => {
  it('reads "Website launch, 5 open tasks" in every mode, with data-open-count as the hook', async () => {
    for (const mode of ['always', 'hover', 'hidden'] as const) {
      const r = await render(row(mode, 5))
      const button = r.container.querySelector('[data-sidebar-item]')!
      expect(spokenText(button)).toBe('Website launch, 5 open tasks')
      expect(button.querySelector('[data-open-count]')?.getAttribute('data-open-count')).toBe('5')
      await r.unmount()
    }
  })

  it('shows the number always, quietly until hover or focus, or only to assistive technology', async () => {
    const shown = async (mode: 'always' | 'hover' | 'hidden') => {
      const r = await render(row(mode, 5))
      const n = r.container.querySelector('[data-count]')!
      const out = { visible: visibleText(r.container.querySelector('[data-sidebar-item]')!), cls: n.className }
      await r.unmount()
      return out
    }
    const always = await shown('always')
    expect(always.visible).toBe('Website launch5')
    expect(always.cls).not.toContain('ui-reveal')
    const hover = await shown('hover')
    // Opacity, not display: the number keeps its width, so the row never moves when it appears.
    expect(hover.visible).toBe('Website launch5')
    expect(hover.cls).toContain('ui-reveal')
    expect(hover.cls).not.toMatch(/\b(hidden|sr-only)\b/)
    const hidden = await shown('hidden')
    expect(hidden.visible).toBe('Website launch')
    expect(hidden.cls).toContain('sr-only')
  })

  it('a row has the same box with and without a count', async () => {
    const a = await render(row('hover', 5))
    const withCount = a.container.querySelector('[data-sidebar-item]')!.className
    await a.unmount()
    const b = await render(row('hover'))
    const without = b.container.querySelector('[data-sidebar-item]')!.className
    expect(b.container.querySelector('[data-open-count]')).toBeNull()
    expect(withCount).toBe(without)
    await b.unmount()
  })
})

describe('StatusDot', () => {
  it('is an accent dot with its meaning as hidden text, never a badge with text', async () => {
    const r = await render(<SidebarItem label="More" badge={<StatusDot label="Review due" data-review-due-more />} />)
    const dot = r.container.querySelector('[data-review-due-more]')!
    expect(dot.querySelector('[data-dot]')!.className).toContain('bg-accent')
    expect(visibleText(r.container.querySelector('[data-sidebar-item]')!)).toBe('More')
    expect(spokenText(r.container.querySelector('[data-sidebar-item]')!)).toBe('More, Review due')
    await r.unmount()
  })
})
