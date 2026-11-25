// @vitest-environment happy-dom
// Keys in a text field wait for the input method (OpenSpec change composition-keys):
// an element around a field leaves a composing Enter or Escape to the input method too.
import 'fake-indexeddb/auto'
import { act } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { ReviewItem } from '../lib/assistant'
import { key, render, type } from '../ui/test-utils'
import { ItemEditor } from './assistant/ItemEditor'
import { NewLabelForm } from './LabelsView'

// Safari reports a composing key as key code 229 with isComposing false.
const safari = (el: Element, k: string) => act(async () => {
  const e = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true })
  Object.defineProperty(e, 'keyCode', { get: () => 229 })
  el.dispatchEvent(e)
})

describe('composing keys around a field', () => {
  it('the new label form stays open on a composing Escape and closes after', async () => {
    const onDone = vi.fn()
    const r = await render(<NewLabelForm onDone={onDone} />)
    const field = r.container.querySelector<HTMLInputElement>('input[aria-label="New label name"]')!
    await type(field, 'しごと')
    await key(field, 'Escape', { isComposing: true })
    await safari(field, 'Escape')
    expect(onDone).not.toHaveBeenCalled()
    expect(field.value).toBe('しごと')
    await key(field, 'Escape')
    expect(onDone).toHaveBeenCalledOnce()
    await r.unmount()
  })

  it('the proposal item editor neither applies nor closes on a composing Enter or Escape', async () => {
    const item: ReviewItem = {
      change: { entity: 'task', entityId: 'n', create: true, patch: { title: 'Buy seeds' } },
      state: 'pending', checked: true, title: 'Buy seeds', lines: [], shared: false,
    } as unknown as ReviewItem
    const onEdit = vi.fn(), onClose = vi.fn()
    const r = await render(<ItemEditor item={item} index={0} onEdit={onEdit} onClose={onClose} />)
    const field = r.container.querySelector<HTMLInputElement>('[data-assistant-editor] input')!
    await type(field, 'たねをかう')
    await key(field, 'Enter', { isComposing: true })
    await key(field, 'Escape', { isComposing: true })
    expect(onEdit).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
    await key(field, 'Enter')
    expect(onEdit).toHaveBeenCalledWith(0, { title: 'たねをかう' })
    expect(onClose).toHaveBeenCalledOnce()
    await r.unmount()
  })
})
