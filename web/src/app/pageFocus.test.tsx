// @vitest-environment happy-dom
// Page changes are announced (OpenSpec assistive-tech-semantics): the tab title
// names the page, a navigation moves focus to the page heading unless something
// else owns focus, and the skip link jumps to the heading.
import { afterEach, describe, expect, it } from 'vitest'
import { useEffect, useRef } from 'react'
import { click, flush, render, waitFor } from '../ui/test-utils'
import { pageTitle, SkipLink, usePageFocus } from './pageFocus'

afterEach(() => {
  document.body.innerHTML = ''
  delete (navigator as { userActivation?: unknown }).userActivation
})

/** A page that focuses one of its own buttons when it mounts (as Settings focuses a requested row). */
function SelfFocusing() {
  const ref = useRef<HTMLButtonElement>(null)
  useEffect(() => { ref.current?.focus() }, [])
  return <button ref={ref} type="button" data-own>Row</button>
}

function Harness({ page, heading = page, self = false }: { page: string; heading?: string; self?: boolean }) {
  const frame = useRef<HTMLElement>(null)
  const content = useRef<HTMLDivElement>(null)
  usePageFocus(page, frame, content)
  return (
    <>
      <SkipLink frame={frame} content={content} />
      <nav><button type="button" data-nav>{page}</button></nav>
      <main ref={frame}>
        <div ref={content} key={page}>
          <h1 data-page-title>{heading}</h1>
          {self && <SelfFocusing />}
        </div>
      </main>
      <div role="dialog"><button type="button" data-dialog>OK</button></div>
    </>
  )
}

const settle = () => flush(40)

describe('page focus and title', () => {
  it('formats the tab title', () => {
    expect(pageTitle('Today')).toBe('Today – OpenTodo')
    expect(pageTitle('  ')).toBe('OpenTodo')
    expect(pageTitle(null)).toBe('OpenTodo')
  })

  it('names the page in the tab title, also when the heading text arrives later', async () => {
    const r = await render(<Harness page="inbox" heading="Inbox" />)
    await waitFor(() => document.title === 'Inbox – OpenTodo', 'title from the heading')
    await r.rerender(<Harness page="inbox" heading="Groceries" />)
    await waitFor(() => document.title === 'Groceries – OpenTodo', 'title follows the heading')
    await r.unmount()
  })

  it('moves focus to the heading on navigation, not on the first load', async () => {
    const r = await render(<Harness page="Inbox" />)
    const nav = r.container.querySelector<HTMLButtonElement>('[data-nav]')!
    nav.focus()
    await settle()
    expect(document.activeElement).toBe(nav)
    await r.rerender(<Harness page="Today" />)
    await settle()
    const h1 = r.container.querySelector('h1')!
    expect(document.activeElement).toBe(h1)
    expect(h1.getAttribute('tabindex')).toBe('-1')
    await r.unmount()
  })

  it('leaves focus in a dialog, and where the new page put it', async () => {
    const r = await render(<Harness page="Inbox" />)
    const dialog = r.container.querySelector<HTMLButtonElement>('[data-dialog]')!
    dialog.focus()
    await r.rerender(<Harness page="Today" />)
    await settle()
    expect(document.activeElement).toBe(dialog)
    r.container.querySelector<HTMLButtonElement>('[data-nav]')!.focus()
    await r.rerender(<Harness page="Settings" self />)
    await settle()
    expect(document.activeElement).toBe(r.container.querySelector('[data-own]'))
    await r.unmount()
  })

  it('does not move focus before the person has used the page (the start view redirect)', async () => {
    Object.defineProperty(navigator, 'userActivation', { value: { hasBeenActive: false }, configurable: true })
    const r = await render(<Harness page="Inbox" />)
    await r.rerender(<Harness page="Today" />)
    await settle()
    expect(document.activeElement).toBe(document.body)
    await r.unmount()
  })

  it('the skip link moves focus to the page heading', async () => {
    const r = await render(<Harness page="Inbox" />)
    const link = r.container.querySelector<HTMLAnchorElement>('[data-skip-link]')!
    expect(link.textContent).toBe('Skip to content')
    expect(link.getAttribute('href')).toBe('#content')
    await click(link)
    expect(document.activeElement).toBe(r.container.querySelector('h1'))
    await r.unmount()
  })
})
