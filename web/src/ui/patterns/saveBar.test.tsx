// @vitest-environment happy-dom
// Save bar and draft (settings-foundation D8): the bar shows only while the draft
// differs from the saved value; Discard restores it; Save is disabled while a
// field is invalid or the form cannot save.
import { describe, expect, it, vi } from 'vitest'
import { useState } from 'react'
import { click, render } from '../test-utils'
import { SaveBar, useDraft } from './SaveBar'

function Form({ saved, onSave, disabledReason }: { saved: { size: number; name: string }; onSave: (v: { size: number; name: string }) => void; disabledReason?: string }) {
  const d = useDraft(saved)
  return (
    <div>
      <button data-edit onClick={() => d.set({ size: d.draft.size + 1 })}>edit</button>
      <button data-bad onClick={() => d.setValid('size', false)}>bad</button>
      <span data-size>{d.draft.size}</span>
      <SaveBar dirty={d.dirty} invalid={d.invalid} disabledReason={disabledReason} onDiscard={d.reset} onSave={() => onSave(d.draft)} />
    </div>
  )
}

function Saving() {
  const [saved, setSaved] = useState({ size: 25, name: 'x' })
  return <Form saved={saved} onSave={setSaved} />
}

const bar = () => document.querySelector('[data-save-bar]')
const btn = (text: string) => [...document.querySelectorAll('button')].find((b) => b.textContent === text)!

describe('SaveBar and useDraft', () => {
  it('shows only while there are unsaved changes, and Discard restores the saved value', async () => {
    await render(<Form saved={{ size: 25, name: 'x' }} onSave={() => {}} />)
    expect(bar()).toBeNull()
    await click(document.querySelector('[data-edit]')!)
    expect(bar()).not.toBeNull()
    expect(document.querySelector('[data-size]')!.textContent).toBe('26')
    await click(btn('Discard'))
    expect(bar()).toBeNull()
    expect(document.querySelector('[data-size]')!.textContent).toBe('25')
  })

  it('Save stores the draft and the bar leaves once the saved value follows', async () => {
    await render(<Saving />)
    await click(document.querySelector('[data-edit]')!)
    await click(btn('Save'))
    expect(bar()).toBeNull()
    expect(document.querySelector('[data-size]')!.textContent).toBe('26')
  })

  it('disables Save while a field is invalid or the form cannot save', async () => {
    const onSave = vi.fn()
    await render(<Form saved={{ size: 25, name: 'x' }} onSave={onSave} />)
    await click(document.querySelector('[data-edit]')!)
    await click(document.querySelector('[data-bad]')!)
    expect(btn('Save').disabled).toBe(true)
    expect(bar()!.textContent).toContain('Fix the highlighted fields to save.')
  })

  it('names why it cannot save', async () => {
    await render(<Form saved={{ size: 25, name: 'x' }} onSave={() => {}} disabledReason="Needs a connection." />)
    await click(document.querySelector('[data-edit]')!)
    expect(btn('Save').disabled).toBe(true)
    expect(bar()!.textContent).toContain('Needs a connection.')
  })
})
