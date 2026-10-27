// @vitest-environment happy-dom
import { useLayoutEffect, useState } from 'react'
import { describe, expect, it } from 'vitest'
import { render } from '../ui/test-utils'
import { useResetOnChange } from './useResetOnChange'

function Draft({ id, initial, committed }: { id: string; initial: string; committed: string[] }) {
  const [draft, setDraft] = useState(initial)
  const [edited, setEdited] = useState(false)
  useResetOnChange([id], () => { setDraft(initial); setEdited(false) })
  useLayoutEffect(() => { committed.push(`${id}:${draft}`) })
  return <input aria-label="draft" value={draft} data-edited={edited || undefined} onChange={(e) => { setDraft(e.target.value); setEdited(true) }} />
}

describe('useResetOnChange', () => {
  it('resets during the render a dependency changes, so the old state never reaches the screen', async () => {
    const committed: string[] = []
    const { rerender, container } = await render(<Draft id="a" initial="one" committed={committed} />)
    await rerender(<Draft id="a" initial="ignored" committed={committed} />)
    // Same id: the draft stays.
    expect((container.querySelector('input') as HTMLInputElement).value).toBe('one')
    committed.length = 0
    await rerender(<Draft id="b" initial="two" committed={committed} />)
    expect((container.querySelector('input') as HTMLInputElement).value).toBe('two')
    // The render with the stale draft is thrown away and rendered again before commit.
    expect(committed).not.toContain('b:one')
    expect(container.querySelector('[data-edited]')).toBeNull()
  })
})
