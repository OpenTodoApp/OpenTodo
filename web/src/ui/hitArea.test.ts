import { describe, expect, it } from 'vitest'
import css from '../index.css?raw'

// OpenSpec accessibility "Pointer targets" (accessibility-aaa D4): the invisible hit area.
describe('hit area', () => {
  const rule = /\.ui-hit::after, \.ui-btn--sm::after, \.ui-btn--md::after, \.ui-btn--icon::after \{([^}]*)\}/.exec(css)

  it('extends small and medium buttons, icon buttons and ui-hit controls to 44 px without moving them', () => {
    expect(rule, 'the ::after rule').toBeTruthy()
    const body = rule![1]
    expect(body).toContain("content: ''")
    expect(body).toContain('position: absolute')
    // Negative only where the box is smaller than 44 px on that axis: a 32 px icon button
    // gets 6 px on each side, a 40 px one 2 px, a 48 px one nothing.
    expect(body).toContain('inset: min(0px, calc((100% - 44px) / 2))')
    expect(css).toMatch(/\.ui-hit \{ @apply relative z-\[1\]; \}/)
    // The button base is positioned, so its pseudo-element is measured from its own box.
    expect(/\.ui-btn \{\s*@apply relative/.test(css)).toBe(true)
  })

  it('leaves the visible sizes as they were', () => {
    expect(css).toContain('.ui-btn--icon.ui-btn--sm { @apply h-8 w-8 p-0; }')
    expect(css).toContain('.ui-btn--icon.ui-btn--md { @apply h-10 w-10 p-0; }')
    expect(css).toContain('.ui-btn--sm { @apply min-h-8 px-2.5 py-1 text-meta; }')
  })
})
