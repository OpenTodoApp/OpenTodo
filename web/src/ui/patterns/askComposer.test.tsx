// @vitest-environment happy-dom
// Ask composer (OpenSpec change assistant-skills, task 3.1).
import { act } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { click, flush, key, render } from '../test-utils'
import { AskComposer, type AskRequest, type AskSkill } from './AskComposer'

afterEach(() => { document.body.innerHTML = '' })

async function type(el: HTMLTextAreaElement, text: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(el, text)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

const SKILLS: AskSkill[] = [
  { id: 'idea-to-project', name: 'Turn an idea into a project', description: 'd1', example: 'Plan a garden makeover' },
  { id: 'plan-week', name: 'Plan my week', description: 'd2', example: 'Plan my week' },
  { id: 'weekly-review', name: 'Weekly review', description: 'd3', example: 'Run my weekly review' },
  { id: 'break-down', name: 'Break this down', description: 'd5', example: 'Break this task into steps' },
]

async function setup() {
  const asks: AskRequest[] = []
  const r = await render(<AskComposer skills={SKILLS} onAsk={(a) => asks.push(a)} />)
  return { r, asks, input: document.querySelector('[data-ask-input]') as HTMLTextAreaElement }
}

describe('AskComposer', () => {
  it('Enter sends the typed text', async () => {
    const { r, asks, input } = await setup()
    await type(input, 'what is overdue in Work?')
    await key(input, 'Enter')
    expect(asks).toEqual([{ text: 'what is overdue in Work?', send: true }])
    expect(input.value).toBe('')
    await r.unmount()
  })

  it('a skill is chosen from the menu with the keyboard', async () => {
    const { r, asks } = await setup()
    const trigger = document.querySelector('button[aria-label="Skills"]') as HTMLButtonElement
    trigger.focus()
    await click(trigger)
    await flush(20)
    const menu = document.querySelector('[role="menu"]')!
    expect(menu).toBeTruthy()
    // Move to "Break this down" and choose it.
    for (let i = 0; i < 3; i++) await key(document.activeElement!, 'ArrowDown')
    expect(document.activeElement?.textContent).toContain('Break this down')
    await key(document.activeElement!, 'Enter')
    await click(document.activeElement!) // Enter on a native button activates it
    await flush(20)
    expect(asks).toEqual([{ text: '', skill: 'break-down', send: false }])
    await r.unmount()
  })

  it('shows three example cards that fill in the skill and its example', async () => {
    const { r, asks } = await setup()
    const cards = document.querySelectorAll('[data-ask-example]')
    expect(cards).toHaveLength(3)
    await click(cards[1])
    expect(asks).toEqual([{ text: 'Plan my week', skill: 'plan-week', send: false }])
    await r.unmount()
  })

  it('a multi-line paste becomes material and is sent with the question', async () => {
    const { r, asks, input } = await setup()
    await act(async () => {
      const ev = new Event('paste', { bubbles: true, cancelable: true }) as Event & { clipboardData: { getData: () => string } }
      ev.clipboardData = { getData: () => 'Notes\n- buy soil\n- call Ann' }
      input.dispatchEvent(ev)
    })
    expect(document.querySelector('[data-ask-pasted]')!.textContent).toContain('3 lines')
    expect(input.value).toBe('')
    await type(input, 'turn this into a project')
    await key(input, 'Enter')
    expect(asks).toEqual([{ text: 'turn this into a project', pasted: 'Notes\n- buy soil\n- call Ann', send: true }])
    await r.unmount()
  })
})
