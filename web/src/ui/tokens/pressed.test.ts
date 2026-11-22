// Pressed states on touch (OpenSpec change touch-pressed-states, design-system "Designed
// pressed states on touch"): the `press-*` utilities and the row's rule apply on a coarse
// pointer only, take a colour token, and replace the generic dim instead of adding to it.
import { describe, expect, it } from 'vitest'
import css from '../../index.css?raw'
import { block } from './css'

describe('pressed states on touch', () => {
  it('press-* is a colour token while pressed, on a coarse pointer, never dimmed, after 60 ms', () => {
    const { body } = block(css, '@utility press-* {')
    expect(body.trim().startsWith('@media (pointer: coarse) {')).toBe(true)
    const rule = block(body, '&:active:not(:disabled, [aria-disabled="true"])').body
    expect(rule).toContain('background-color: --value(--color-*);')
    expect(rule).toContain('opacity: 1;')
    // press-feedback-delay D1: the colour waits 60 ms, then comes at once; the dim is off.
    expect(rule).toContain('transition: background-color 0s 60ms;')
    expect(rule).toContain('animation: none;')
  })

  it('press-inset keeps the colour inside a 44 px target, on a coarse pointer', () => {
    const { body } = block(css, '@utility press-inset {')
    expect(body.replace(/\s+/g, ' ').trim()).toBe('@media (pointer: coarse) { padding: 0.5rem; background-clip: content-box; }')
  })

  it('a row tints 60 ms into a press of its body, not of a control in it, the body does not dim, and a hold still wins', () => {
    const row = css.indexOf('li[data-task-id]:where(:has(> [data-row-open]:not(:has(:is(button, [role="button"], a[href]):active)):active)) { background-color: var(--color-selected-row); transition: background-color 0s 60ms; }')
    const body = css.indexOf('li[data-task-id] > [data-row-open]:active { animation: none; }')
    const hold = css.indexOf('li[data-task-id][data-touch-hold] {')
    expect(row).toBeGreaterThan(0)
    expect(body).toBeGreaterThan(row)
    // Later and more specific: the hold's tint replaces the pressed one.
    expect(hold).toBeGreaterThan(body)
    expect(css.lastIndexOf('@media (pointer: coarse) {', row)).toBeGreaterThan(css.lastIndexOf('}\n', row) - 400)
  })

  it('a held row rises from 150 ms over the 200 ms before the hold arms, on touch, with motion (row-lift-overscroll)', () => {
    const at = css.indexOf(':root:not([data-motion="none"]) :is(li[data-task-id], [data-sidebar-scroll] [data-sidebar-item])[data-touch-press] {')
    expect(at).toBeGreaterThan(0)
    expect(css.lastIndexOf('@media (pointer: coarse) and (prefers-reduced-motion: no-preference) {', at)).toBeGreaterThan(at - 120)
    const rule = block(css.slice(at), '[data-touch-press] {').body
    expect(rule).toContain('transform: scale(1.01);')
    expect(rule).toContain('box-shadow: var(--shadow-2);')
    expect(rule).toContain('transform 200ms var(--ease-spring) 150ms')
    expect(rule).toContain('box-shadow 200ms var(--ease-spring) 150ms')
  })

  it('the generic dim stays, as the fallback, 60 ms into a press of the innermost control', () => {
    expect(css).toContain(':where(:not(.ui-btn):not(:disabled):not([aria-disabled="true"]):not(:has(:is(button, [role="button"], a[href]):active))):active {\n      animation: press-dim 0s 60ms forwards;')
    expect(css).toContain('@keyframes press-dim { from, to { opacity: 0.6; } }')
  })
})
