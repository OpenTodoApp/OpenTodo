// @vitest-environment happy-dom
// Copying a code block from rendered Markdown (OpenSpec change copy-code-block):
// the button puts the block's text, without its fences and its trailing newline, on
// the clipboard; indentation is kept.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { click, render, waitFor } from '../ui/test-utils'
import { Markdown } from './Markdown'
import css from '../index.css?raw'

const realClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
function stubClipboard(writeText: (t: string) => Promise<void>) {
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
}
afterEach(() => {
  if (realClipboard) Object.defineProperty(navigator, 'clipboard', realClipboard)
})

// An empty line closes a paragraph (a blank one would already close it and be
// skipped); a fence then opens its own block.
const SOURCE = ['Before.', '', '```bash', 'docker compose up -d', '```', '', 'After.'].join('\n')

describe('a code block in rendered Markdown', () => {
  it('copies the code without the fences and announces it', async () => {
    const writeText = vi.fn(async () => {})
    stubClipboard(writeText)
    const { container, unmount } = await render(<Markdown source={SOURCE} />)
    const button = container.querySelector('[data-code-copy]')!
    expect(button).not.toBeNull()
    await click(button)
    await waitFor(() => writeText.mock.calls.length === 1, 'the copy')
    expect(writeText).toHaveBeenCalledWith('docker compose up -d')
    await waitFor(() => button.getAttribute('aria-label') === 'Copied', 'the confirmation')
    await unmount()
  })

  it('keeps the indentation and drops a trailing newline', async () => {
    const writeText = vi.fn(async () => {})
    stubClipboard(writeText)
    const src = ['```python', 'def go():', '    return 1', '', '```'].join('\n')
    const { container, unmount } = await render(<Markdown source={src} />)
    await click(container.querySelector('[data-code-copy]')!)
    await waitFor(() => writeText.mock.calls.length === 1, 'the copy')
    // The parser keeps every line between the fences, the blank one included
    // (lib/markdown.ts: `body.join('\n')`); codeText drops only the trailing newlines.
    expect(writeText).toHaveBeenCalledWith('def go():\n    return 1')
    await unmount()
  })

  it('shows the code as before and says so when the clipboard is refused', async () => {
    stubClipboard(async () => { throw new Error('denied') })
    const { container, unmount } = await render(<Markdown source={SOURCE} />)
    expect(container.querySelector('pre code')!.textContent).toBe('docker compose up -d')
    await click(container.querySelector('[data-code-copy]')!)
    await waitFor(() => container.querySelector('[data-code-copy]')!.getAttribute('aria-label') === 'Could not copy', 'the refusal')
    expect(container.querySelector('pre code')!.textContent).toBe('docker compose up -d')
    await unmount()
  })

  it('gives every block its own button', async () => {
    stubClipboard(vi.fn(async () => {}))
    const { container, unmount } = await render(<Markdown source={'```\na\n```\n\n```\nb\n```'} />)
    expect(container.querySelectorAll('[data-code-copy]').length).toBe(2)
    await unmount()
  })

  // The bar ends at the block's own end corner (copy-code-block D3). Reserving the
  // note's corner on every bar pushed the button 72 px in from it, on blocks far below
  // the corner; the room belongs to the note's first block, once.
  it("keeps the bar at the block's end corner and the corner's room on the note's first block", () => {
    expect(css).toMatch(/\.md-code__bar \{ @apply flex justify-end px-0\.5 pt-0\.5; \}/)
    expect(css).toMatch(/\.notes-frame\[data-corner\] \.notes-editor > :first-child:not\(\.md-code\),/)
    expect(css).toMatch(/\.notes-frame\[data-corner\] \.notes-editor > :first-child\.md-code \.md-code__bar \{ padding-inline-end: var\(--notes-corner\); \}/)
    expect(css).not.toMatch(/:not\(\.notes-corner\):has\(\.md-code\) \.md-code__bar/)
  })
})
