// @vitest-environment happy-dom
// Radio group (settings-foundation D7): one native radio group, so the browser's
// group semantics apply; the chosen option is marked, a disabled one says why.
import { describe, expect, it, vi } from 'vitest'
import { useState } from 'react'
import { click, render } from './test-utils'
import { RadioGroup } from './RadioGroup'

const options = [
  { value: 'read', label: 'Read only', description: 'Reads tasks and projects.' },
  { value: 'agent', label: 'Can make changes', description: 'Adds and changes tasks.' },
  { value: 'admin', label: 'Administration', disabled: true, reason: 'Needs a recent sign-in.' },
] as const

function Harness({ onChange }: { onChange?: (v: string) => void }) {
  const [v, setV] = useState<'read' | 'agent' | 'admin'>('read')
  return <RadioGroup label="What the assistant may do" value={v} options={options} onChange={(x) => { setV(x); onChange?.(x) }} />
}

const radios = () => [...document.querySelectorAll<HTMLInputElement>('input[type="radio"]')]

describe('RadioGroup', () => {
  it('is one named group with the chosen option checked', async () => {
    await render(<Harness />)
    const group = document.querySelector('[role="radiogroup"]')!
    const labelId = group.getAttribute('aria-labelledby')!
    expect(document.getElementById(labelId)?.textContent).toBe('What the assistant may do')
    expect(radios().map((r) => r.checked)).toEqual([true, false, false])
    expect(new Set(radios().map((r) => r.name)).size).toBe(1)
    expect(document.querySelector('[data-radio-option="read"]')?.hasAttribute('data-chosen')).toBe(true)
  })

  it('chooses an option on click and reports it', async () => {
    const onChange = vi.fn()
    await render(<Harness onChange={onChange} />)
    await click(document.querySelector('[data-radio-option="agent"]')!)
    expect(onChange).toHaveBeenCalledWith('agent')
    expect(radios()[1].checked).toBe(true)
  })

  it('disables an option and reads its reason', async () => {
    await render(<Harness />)
    const admin = radios()[2]
    expect(admin.disabled).toBe(true)
    expect(document.getElementById(admin.getAttribute('aria-describedby')!)?.textContent).toBe('Needs a recent sign-in.')
  })

  it('describes each option for assistive technology', async () => {
    await render(<Harness />)
    expect(document.getElementById(radios()[0].getAttribute('aria-describedby')!)?.textContent).toBe('Reads tasks and projects.')
  })
})
