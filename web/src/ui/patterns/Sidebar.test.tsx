// @vitest-environment happy-dom
// Sidebar counts and markers (OpenSpec change quiet-sidebar, design D1 and D4): a count
// is always in the row's accessible name; it is visible always, on hover or focus, or
// never, and revealing it never changes the row's box.
import { afterEach, describe, expect, it } from 'vitest'
import { render, spokenText, visibleText } from '../test-utils'
import { SidebarGroup, SidebarGroupAction, SidebarHeader, SidebarItem, StatusDot } from './Sidebar'

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

// sidebar-v2 D4: quiet at rest, default on hover and focus, strong with an accent icon when active.
describe('SidebarItem tones', () => {
  it('rest, hover and focus, active', async () => {
    const r = await render(<><SidebarItem label="Inbox" icon="inbox" /><SidebarItem label="Today" icon="calendar-check" active /></>)
    const [rest, active] = [...r.container.querySelectorAll('[data-sidebar-item]')]
    expect(rest.getAttribute('data-tone')).toBe('quiet')
    expect(rest.className).toContain('text-faint')
    expect(rest.className).toContain('hover:text-default')
    expect(rest.className).toContain('focus-visible:text-default')
    expect(rest.querySelector('[data-icon]')!.parentElement!.className).not.toMatch(/text-/)
    expect(active.getAttribute('data-tone')).toBe('active')
    expect(active.className).toContain('text-strong')
    expect(active.className).toContain('bg-accent-soft')
    expect(active.querySelector('[data-icon]')!.parentElement!.className).toContain('text-accent')
    await r.unmount()
  })
})

// sidebar-v2 D5: the actions stay in the document, hidden by opacity only; the count is in the name.
describe('SidebarGroup header', () => {
  const group = (open: boolean) => (
    <SidebarGroup title="Projects" collapsible open={open} count={12} actions={<SidebarGroupAction aria-label="All projects">All</SidebarGroupAction>}><span>row</span></SidebarGroup>
  )

  it('reads "Projects, 12 items" open and closed; the actions are in the document and revealed by hover or focus', async () => {
    for (const open of [true, false]) {
      const r = await render(group(open))
      const heading = r.container.querySelector('[data-sidebar-group-header] button[aria-expanded]')!
      expect(spokenText(heading)).toBe('Projects, 12 items')
      const actions = r.container.querySelector('[data-group-actions]')!
      expect(actions.className).toContain('ui-reveal')
      expect(actions.className).not.toMatch(/\b(hidden|invisible|sr-only)\b/)
      expect(actions.querySelector('button[aria-label="All projects"]')).not.toBeNull()
      await r.unmount()
    }
  })

  it('the header keeps its box with and without hover: the reveal changes opacity alone', async () => {
    const css = (await import('../../index.css?raw')).default
    const rule = /\.ui-reveal \{([^}]*)\}/.exec(css)![1]
    expect(rule.replace(/\s+/g, ' ').trim()).toBe('opacity: 0; transition: opacity var(--duration-ui);')
    expect(css).toMatch(/\[data-sidebar-group-header\]\):is\(:hover, :focus-within\) \.ui-reveal, \.ui-reveal:focus-within \{ opacity: 1; \}/)
    const r = await render(group(true))
    const header = r.container.querySelector<HTMLElement>('[data-sidebar-group-header]')!
    const before = header.className
    header.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }))
    expect(header.className).toBe(before)
    await r.unmount()
  })
})

// sidebar-v2 D1: the header row is a slot; search and the rail live in the primitive.
describe('SidebarHeader', () => {
  it('the rail shows the mark alone, named "OpenTodo" with a tooltip', async () => {
    const r = await render(<SidebarHeader left={<span>OpenTodo</span>} rail={<svg data-rail-mark />} railLabel="OpenTodo" collapsed onSearch={() => {}} searchLabel="Search" />)
    const mark = r.container.querySelector('[role="img"]')!
    expect(mark.getAttribute('aria-label')).toBe('OpenTodo')
    expect(mark.querySelector('[data-rail-mark]')).not.toBeNull()
    expect(r.container.querySelector('[data-palette-button]')).toBeNull()
    await r.unmount()
  })

  it('a custom left keeps the search button and its data-palette-button', async () => {
    let opened = 0
    const r = await render(<SidebarHeader left={<button type="button" data-workspace>Home</button>} rail={null} railLabel="OpenTodo" onSearch={() => opened++} searchLabel="Search and commands" />)
    expect(r.container.querySelector('[data-workspace]')).not.toBeNull()
    const search = r.container.querySelector<HTMLButtonElement>('[data-palette-button]')!
    expect(search.getAttribute('aria-label')).toBe('Search and commands')
    search.click()
    expect(opened).toBe(1)
    await r.unmount()
  })
})
