import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ShortcutHelp } from './ShortcutHelp'
import { VIM_HELP } from './vim/help'

describe('ShortcutHelp', () => {
  it('help lists Vim section only when enabled', () => {
    const on = renderToStaticMarkup(<ShortcutHelp onClose={() => undefined} extraSections={[VIM_HELP]} />)
    expect(on).toContain('data-help-section="Vim keybindings"')
    for (const k of ['gg / G', 'dd', '3j, 5k, 2↓', ':project &lt;name&gt;', ':new &lt;title&gt;', ':help']) expect(on).toContain(k)
    expect(on).not.toContain('data-vim-hint')

    const off = renderToStaticMarkup(<ShortcutHelp onClose={() => undefined} />)
    expect(off).not.toContain('Vim keybindings</h3>')
    expect(off).not.toContain('gg / G')
    expect(off).toContain('data-vim-hint')
    expect(off).toContain('Vim keybindings can be enabled in Settings')
    // The default list is unchanged.
    expect(off).toContain('Toggle this help')
  })

  it('scrolls the overlay and keeps a close button at the top on small screens', () => {
    const html = renderToStaticMarkup(<ShortcutHelp onClose={() => undefined} />)
    // The overlay itself scrolls (a percentage max-height on the panel failed on iOS Safari).
    expect(html).toContain('overflow-y-auto overscroll-contain')
    expect(html).not.toContain('max-h-full')
    // A close button sits in the pinned header, before any shortcut row.
    const closeAt = html.indexOf('aria-label="Close"')
    expect(closeAt).toBeGreaterThan(-1)
    expect(closeAt).toBeLessThan(html.indexOf('Quick add a task'))
    expect(html).toContain('sticky top-0')
  })

  it('lists the assistant shortcut once, without clashing with another key (in-app-assistant)', async () => {
    const { SHORTCUTS } = await import('../lib/shortcuts')
    const html = renderToStaticMarkup(<ShortcutHelp onClose={() => undefined} />)
    expect(html).toContain('Open the assistant')
    const plain = SHORTCUTS.filter((s) => s.keys === 'Shift+I')
    expect(plain).toHaveLength(1)
    // `g` then Shift+I (Import) is a different sequence; nothing else binds plain Shift+I.
    expect(SHORTCUTS.some((s) => s.keys.startsWith('g then Shift+I'))).toBe(true)
    expect(VIM_HELP.rows.some((r) => /^I\b|Shift\+I/.test(r[0]))).toBe(false)
  })
})
