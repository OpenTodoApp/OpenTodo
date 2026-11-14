// Pressed states on touch (OpenSpec change touch-pressed-states, design-system "Designed
// pressed states on touch"): the `press-*` utilities and the row's rule apply on a coarse
// pointer only, take a colour token, and replace the generic dim instead of adding to it.
import { describe, expect, it } from 'vitest'
import css from '../../index.css?raw'
import { block } from './css'

describe('pressed states on touch', () => {
  it('press-* is a colour token while pressed, on a coarse pointer, never dimmed, at once', () => {
    const { body } = block(css, '@utility press-* {')
    expect(body.trim().startsWith('@media (pointer: coarse) {')).toBe(true)
    const rule = block(body, '&:active:not(:disabled, [aria-disabled="true"])').body
    expect(rule).toContain('background-color: --value(--color-*);')
    expect(rule).toContain('opacity: 1;')
    expect(rule).toContain('transition-duration: 0s;')
  })

  it('press-inset keeps the colour inside a 44 px target, on a coarse pointer', () => {
    const { body } = block(css, '@utility press-inset {')
    expect(body.replace(/\s+/g, ' ').trim()).toBe('@media (pointer: coarse) { padding: 0.5rem; background-clip: content-box; }')
  })

  it('a row tints while its body is pressed, the body does not dim, and a hold still wins', () => {
    const row = css.indexOf('li[data-task-id]:where(:has(> [data-row-open]:active)) { background-color: var(--color-selected-row); }')
    const body = css.indexOf('li[data-task-id] > [data-row-open]:active { opacity: 1; }')
    const hold = css.indexOf('li[data-task-id][data-touch-hold] {')
    expect(row).toBeGreaterThan(0)
    expect(body).toBeGreaterThan(row)
    // Later and more specific: the hold's tint replaces the pressed one.
    expect(hold).toBeGreaterThan(body)
    expect(css.lastIndexOf('@media (pointer: coarse) {', row)).toBeGreaterThan(css.lastIndexOf('}\n', row) - 400)
  })

  it('the generic dim stays, as the fallback', () => {
    expect(css).toMatch(/:where\(:not\(\.ui-btn\):not\(:disabled\):not\(\[aria-disabled="true"\]\)\):active \{\s*opacity: 0\.6;/)
  })
})
