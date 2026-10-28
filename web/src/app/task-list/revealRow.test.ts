// @vitest-environment happy-dom
// The keyboard cursor's row stays in sight (issue 514). happy-dom has no layout,
// so the test gives each element the box a browser measured in the report.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { isFirstRow, revealRow } from './revealRow'

type Box = { top: number; bottom: number }

function box(el: HTMLElement, get: () => Box) {
  el.getBoundingClientRect = () => { const b = get(); return { top: b.top, bottom: b.bottom, height: b.bottom - b.top, left: 0, right: 0, width: 0, x: 0, y: b.top, toJSON: () => ({}) } as DOMRect }
}

/** A scroller (viewport y 9–700) with a sticky header 47 px tall and 40 rows of 38 px, the list starting 170 px down. */
function page() {
  document.body.innerHTML = '<main id="sc" style="overflow-y:auto"><header id="hd" style="position:sticky"></header><ul></ul></main>'
  const sc = document.getElementById('sc') as HTMLElement
  const hd = document.getElementById('hd') as HTMLElement
  const ul = sc.querySelector('ul') as HTMLElement
  Object.defineProperty(sc, 'scrollHeight', { value: 2000 })
  Object.defineProperty(sc, 'clientHeight', { value: 691 })
  sc.scrollTop = 0
  box(sc, () => ({ top: 9, bottom: 700 }))
  box(hd, () => ({ top: 9, bottom: 56 }))
  const rows: HTMLElement[] = []
  for (let i = 0; i < 40; i++) {
    const li = document.createElement('li')
    li.dataset.taskId = `t${i}`
    ul.append(li)
    box(li, () => ({ top: 9 + 170 + i * 38 - sc.scrollTop, bottom: 9 + 170 + (i + 1) * 38 - sc.scrollTop }))
    rows.push(li)
  }
  return { sc, rows }
}

afterEach(() => vi.restoreAllMocks())

describe('revealRow', () => {
  it('keeps a row moved up to below the sticky header, not under it', () => {
    const { sc, rows } = page()
    sc.scrollTop = 900
    revealRow(rows[20])
    expect(rows[20].getBoundingClientRect().top).toBe(60) // header bottom 56 + 4
  })

  it('scrolls a row below the bottom edge into view and leaves a visible one alone', () => {
    const { sc, rows } = page()
    revealRow(rows[30])
    expect(rows[30].getBoundingClientRect().bottom).toBe(696)
    const before = sc.scrollTop
    revealRow(rows[29])
    expect(sc.scrollTop).toBe(before)
  })

  it('goes back to the very top for the first row', () => {
    const { sc, rows } = page()
    sc.scrollTop = 500
    expect(isFirstRow(rows[0])).toBe(true)
    expect(isFirstRow(rows[1])).toBe(false)
    revealRow(rows[0], { first: true })
    expect(sc.scrollTop).toBe(0)
  })

  it('falls back to the browser without a scrolling ancestor', () => {
    document.body.innerHTML = '<ul><li data-task-id="a"></li></ul>'
    const li = document.querySelector('li') as HTMLElement
    li.scrollIntoView = vi.fn()
    revealRow(li)
    expect(li.scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' })
  })
})
