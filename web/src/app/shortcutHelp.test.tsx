import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ShortcutHelp } from './ShortcutHelp'
import { VIM_HELP } from './vim/help'

describe('ShortcutHelp', () => {
  it('help lists Vim section only when enabled', () => {
    const on = renderToStaticMarkup(<ShortcutHelp onClose={() => undefined} vim extraSections={[VIM_HELP]} />)
    expect(on).toContain('data-help-section="Vim keybindings"')
    expect(on).toContain('data-help-section="Vim command line"')
    for (const k of ['>Shift+G<', '>First task<', '>Delete task<', '3j', ':project &lt;name&gt;', ':new &lt;title&gt;', ':help']) expect(on).toContain(k)
    expect(on).not.toContain('data-vim-hint')

    const off = renderToStaticMarkup(<ShortcutHelp onClose={() => undefined} />)
    expect(off).not.toContain('Vim keybindings</h3>')
    expect(off).not.toContain('>Delete task<')
    expect(off).toContain('data-vim-hint')
    expect(off).toContain('Vim keybindings can be enabled in Settings')
    // The default list is unchanged.
    expect(off).toContain('Toggle this cheat sheet')
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
    const plain = SHORTCUTS.filter((s) => s.keys.includes('Shift+I'))
    expect(plain).toHaveLength(1)
    // `g` then Shift+I (Import) is a different sequence; nothing else binds plain Shift+I.
    expect(SHORTCUTS.some((s) => s.keys.includes('g Shift+I'))).toBe(true)
    expect(SHORTCUTS.some((s) => s.scope === 'vim' && s.keys.includes('Shift+I'))).toBe(false)
  })

  it('names the command bar prefixes and Ctrl+Enter, and q once (moments-and-onboarding)', async () => {
    const { SHORTCUTS } = await import('../lib/shortcuts')
    const html = renderToStaticMarkup(<ShortcutHelp onClose={() => undefined} />)
    expect(html).toContain('first character in the command bar')
    expect(html).toContain('add what you typed as a task')
    expect(SHORTCUTS.filter((s) => s.keys.includes('q') && s.scope === 'global').map((s) => s.id)).toEqual(['list.quick-add'])
  })
})
