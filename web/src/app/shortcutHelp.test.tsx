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
})
