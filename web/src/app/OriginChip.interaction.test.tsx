// @vitest-environment happy-dom
// The Obsidian origin chip (OpenSpec change obsidian-origin, task 3.2): a note
// link opens once through the shell, and a shell without `obsidian-links` gets a
// chip whose menu copies the link instead of opening it.
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { OpenTodoShell } from '../lib/shell'
import type { Origin } from '../lib/types'
import { click, render, waitFor } from '../ui/test-utils'
import { OriginChip } from './OriginChip'

const note: Origin = { kind: 'obsidian', id: 'Daily/2026-10-29.md', url: 'obsidian://open?vault=Notes&file=Daily%2F2026-10-29', title: '2026-10-29' }

function installShell(capabilities: string[]) {
  const openExternal = vi.fn()
  const s: OpenTodoShell = { bridge: 1, platform: 'android', app: '0.20.0', capabilities, openExternal }
  window.opentodoShell = s
  return openExternal
}

afterEach(() => {
  delete window.opentodoShell
  vi.unstubAllGlobals()
})

describe('Obsidian origin chip', () => {
  it('in a browser is a same-page link to the note with the note name and its place as tooltip', async () => {
    const r = await render(<OriginChip origin={note} />)
    const a = r.container.querySelector<HTMLAnchorElement>('a[data-origin="obsidian"]')!
    expect(a.getAttribute('href')).toBe(note.url)
    expect(a.getAttribute('target')).toBeNull()
    expect(a.textContent).toContain('2026-10-29')
  })

  it('in a shell with obsidian-links hands the link over once and never navigates', async () => {
    const openExternal = installShell(['links', 'obsidian-links'])
    const r = await render(<OriginChip origin={note} />)
    const a = r.container.querySelector<HTMLAnchorElement>('a[data-origin="obsidian"]')!
    const ev = new MouseEvent('click', { bubbles: true, cancelable: true })
    a.dispatchEvent(ev)
    expect(ev.defaultPrevented).toBe(true)
    expect(openExternal).toHaveBeenCalledTimes(1)
    expect(openExternal).toHaveBeenCalledWith(note.url)
  })

  it('in a shell without obsidian-links offers Copy link, which copies the note link', async () => {
    const openExternal = installShell(['links'])
    const writeText = vi.fn(async () => undefined)
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })
    const r = await render(<OriginChip origin={note} />)
    expect(r.container.querySelector('a')).toBeNull()
    const trigger = r.container.querySelector<HTMLButtonElement>('[data-origin="obsidian"] button')!
    await click(trigger)
    await waitFor(() => !!document.querySelector('[data-origin-copy]'), 'the Copy link item')
    await click(document.querySelector('[data-origin-copy]')!)
    await waitFor(() => writeText.mock.calls.length === 1, 'the copy')
    expect(writeText).toHaveBeenCalledWith(note.url)
    expect(openExternal).not.toHaveBeenCalled()
  })

  it('never links a url origin carrying an Obsidian link', async () => {
    const r = await render(<OriginChip origin={{ kind: 'url', url: 'obsidian://open?vault=Notes&file=a' }} />)
    expect(r.container.querySelector('a')).toBeNull()
  })
})
