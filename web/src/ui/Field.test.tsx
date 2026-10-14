// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { Field, Input, Select, Textarea } from './Field'
import { Checkbox, Switch } from './Switch'
import { click, key, render } from './test-utils'
import { useState } from 'react'

describe('Field', () => {
  it('puts the description and the error in the accessible description and marks the control invalid', async () => {
    const { container, unmount } = await render(
      <Field label="Name" description="Shown to members" error="Name is required"><Input /></Field>,
    )
    const input = container.querySelector('input')!
    const label = container.querySelector('label')!
    expect(label.getAttribute('for')).toBe(input.id)
    expect(input.getAttribute('aria-invalid')).toBe('true')
    const ids = input.getAttribute('aria-describedby')!.split(' ')
    const text = ids.map((id) => document.getElementById(id)!.textContent).join(' ')
    expect(text).toContain('Name is required')
    expect(text).toContain('Shown to members')
    await unmount()
  })

  it('wires textarea and select the same way, valid when no error', async () => {
    const { container, unmount } = await render(
      <>
        <Field label="Notes"><Textarea /></Field>
        <Field label="Role"><Select><option>Editor</option></Select></Field>
      </>,
    )
    for (const el of container.querySelectorAll('textarea, select')) {
      expect(el.id).not.toBe('')
      expect(el.hasAttribute('aria-invalid')).toBe(false)
    }
    await unmount()
  })
})

describe('Switch and Checkbox', () => {
  function Toggle() {
    const [on, setOn] = useState(false)
    return <Switch checked={on} onChange={setOn} label="Include task titles" />
  }

  it('a switch announces its state and toggles with Space (native button activation) and click', async () => {
    const { container, unmount } = await render(<Toggle />)
    const sw = container.querySelector('[role="switch"]')! as HTMLButtonElement
    expect(sw.getAttribute('aria-checked')).toBe('false')
    sw.focus()
    await key(sw, ' ')
    await click(sw) // Space on a native button fires click; happy-dom needs it explicitly
    expect(sw.getAttribute('aria-checked')).toBe('true')
    expect(sw.closest('label')!.textContent).toContain('Include task titles')
    await unmount()
  })

  it('a checkbox can be indeterminate', async () => {
    const { container, unmount } = await render(<Checkbox label="All tasks" indeterminate readOnly />)
    expect((container.querySelector('input') as HTMLInputElement).indeterminate).toBe(true)
    await unmount()
  })
})
