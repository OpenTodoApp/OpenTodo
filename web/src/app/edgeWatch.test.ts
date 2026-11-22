// @vitest-environment happy-dom
// swipe-back-follows D1, D2: the page moves with the finger and hands its offset to the
// back transition; a cancelled swipe springs back; the closed menu slides out with it.
import { afterEach, describe, expect, it } from 'vitest'
import { headerBack, menuFollower, pageFollower } from './edgeWatch'
import { NAV_FROM } from './pageTransition'

afterEach(() => { document.documentElement.style.removeProperty(NAV_FROM); document.body.innerHTML = '' })

describe('the page follower', () => {
  it('moves the page mid-drag, with the page shadow', () => {
    const page = document.createElement('div')
    const f = pageFollower(page)
    f.move(120)
    expect(page.style.transform).toBe('translateX(120px)')
    expect(page.style.transition).toBe('none')
    expect(page.style.boxShadow).toBe('var(--shadow-3)')
  })

  it('a committed release hands the offset to the back transition and leaves the page in place', () => {
    const page = document.createElement('div')
    const f = pageFollower(page)
    f.move(150)
    f.settle(true, 150)
    expect(document.documentElement.style.getPropertyValue(NAV_FROM)).toBe('150px')
    expect(page.style.transform).toBe('')
    expect(page.style.boxShadow).toBe('')
  })

  it('a short release springs back and sets no hand-off (the scenario "A short slow swipe")', () => {
    const page = document.createElement('div')
    const f = pageFollower(page)
    f.move(70)
    f.settle(false, 70)
    expect(page.style.transform).toBe('')
    expect(page.style.transition).toContain('var(--ease-spring)')
    expect(document.documentElement.style.getPropertyValue(NAV_FROM)).toBe('')
  })
})

describe('the menu follower', () => {
  it('slides the closed menu out with the finger, never past open', () => {
    const drawer = document.createElement('aside')
    Object.defineProperty(drawer, 'offsetWidth', { value: 300 })
    const f = menuFollower(drawer)
    f.move(100)
    expect(drawer.style.transform).toBe('translateX(-200px)')
    f.move(400)
    expect(drawer.style.transform).toBe('translateX(0px)')
    f.settle(true, 400)
    expect(drawer.style.transform).toBe('')
  })
})

describe("the header's Back (from 768 px)", () => {
  it('follows the visible Back link of the page header', () => {
    document.body.innerHTML = '<main id="content"><a data-page-back href="#">Back</a></main>'
    const link = document.querySelector<HTMLElement>('[data-page-back]')!
    Object.defineProperty(link, 'offsetParent', { get: () => document.body })
    let clicked = 0
    link.addEventListener('click', () => { clicked++ })
    headerBack()?.()
    expect(clicked).toBe(1)
  })

  it("follows a task page's Close, which goes back to the list", () => {
    document.body.innerHTML = '<main id="content"><button data-task-close>Close</button></main>'
    const close = document.querySelector<HTMLElement>('[data-task-close]')!
    Object.defineProperty(close, 'offsetParent', { get: () => document.body })
    let clicked = 0
    close.addEventListener('click', () => { clicked++ })
    headerBack()?.()
    expect(clicked).toBe(1)
  })

  it('is none when the page has no Back or it is hidden', () => {
    expect(headerBack()).toBeUndefined()
    document.body.innerHTML = '<main id="content"><a data-page-back href="#">Back</a></main>'
    Object.defineProperty(document.querySelector('[data-page-back]')!, 'offsetParent', { get: () => null })
    expect(headerBack()).toBeUndefined()
  })
})
