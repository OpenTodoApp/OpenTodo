// @vitest-environment happy-dom
// Number input (settings-foundation D7): unit inside the field, range errors,
// No limit, and arrow keys that step within the range.
import { describe, expect, it, vi } from 'vitest'
import { useState } from 'react'
import { act } from 'react'
import { click, key, render, type } from './test-utils'
import { NumberInput } from './NumberInput'

function Harness({ initial = 25 as number | null, onChange, onValidity }: { initial?: number | null; onChange?: (v: number | null) => void; onValidity?: (ok: boolean) => void }) {
  const [v, setV] = useState<number | null>(initial)
  return <NumberInput label="Maximum file size" unit="MB" min={1} max={500} value={v} noLimit
    onChange={(x) => { setV(x); onChange?.(x) }} onValidityChange={onValidity} />
}

const field = () => document.querySelector<HTMLInputElement>('[data-number-input] input[type="text"]')!
const noLimitBox = () => document.querySelector<HTMLInputElement>('[data-number-input] input[type="checkbox"]')!

describe('NumberInput', () => {
  it('shows the unit inside the field and reads it with the field', async () => {
    await render(<Harness />)
    expect(field().value).toBe('25')
    expect(field().inputMode).toBe('numeric')
    const described = field().getAttribute('aria-describedby')!.split(' ').map((id) => document.getElementById(id)?.textContent)
    expect(described).toContain('MB')
  })

  it('refuses a value outside the range and says the range', async () => {
    const onChange = vi.fn()
    const onValidity = vi.fn()
    await render(<Harness onChange={onChange} onValidity={onValidity} />)
    await type(field(), '0')
    expect(field().getAttribute('aria-invalid')).toBe('true')
    expect(document.body.textContent).toContain('Between 1 and 500 MB')
    expect(onChange).not.toHaveBeenCalled()
    expect(onValidity).toHaveBeenLastCalledWith(false)
    await type(field(), '40')
    expect(onChange).toHaveBeenLastCalledWith(40)
    expect(onValidity).toHaveBeenLastCalledWith(true)
  })

  it('steps with the arrow keys within the range', async () => {
    const onChange = vi.fn()
    await render(<Harness initial={500} onChange={onChange} />)
    await act(async () => field().focus())
    await key(field(), 'ArrowUp')
    expect(field().value).toBe('500')
    await key(field(), 'ArrowDown')
    expect(onChange).toHaveBeenLastCalledWith(499)
  })

  it('No limit clears and disables the field', async () => {
    const onChange = vi.fn()
    await render(<Harness onChange={onChange} />)
    await click(noLimitBox())
    expect(onChange).toHaveBeenLastCalledWith(null)
    expect(field().disabled).toBe(true)
    expect(field().value).toBe('')
    expect(field().hasAttribute('aria-invalid')).toBe(false)
    await click(noLimitBox())
    expect(onChange).toHaveBeenLastCalledWith(1)
    expect(field().disabled).toBe(false)
  })
})
