// @vitest-environment happy-dom
// Ask composer on Today, the Ask screen and their availability (OpenSpec change
// assistant-skills, tasks 3.3 and 3.4).
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetSkills } from '../lib/assistantSkills'
import { resetAssistantStatus, setAssistantStatus, takeAssistantPrefill, type AssistantStatus } from '../lib/assistantStatus'
import { db, getMeta } from '../lib/db'
import type { User } from '../lib/types'
import { click, flush, key, render } from '../ui/test-utils'
import { AskScreen, HINT_DISMISSED_KEY, TodayAsk } from './assistant/AskEntry'
import { navigate, parseRoute } from './router'
import { Shell } from './Shell'

const base: AssistantStatus = {
  available: true, enabled: true, reason: '', provider: 'anthropic', provider_label: 'Anthropic (Claude)', model: 'm', consented: true,
  disclosure_version: 1, fields: [], allow_member_keys: false, own_key_set: false, operator_key_set: true,
}
const off: AssistantStatus = { ...base, available: false, enabled: false, reason: 'disabled' }
const encrypted: AssistantStatus = { ...base, available: false, reason: 'encryption_enabled' }
const SKILLS = [
  { id: 'idea-to-project', name: 'Turn an idea into a project', description: 'd', example: 'Plan a garden makeover', result: 'changes' as const },
  { id: 'plan-week', name: 'Plan my week', description: 'd', example: 'Plan my week', result: 'changes' as const },
  { id: 'weekly-review', name: 'Weekly review', description: 'd', example: 'Run my weekly review', result: 'changes' as const },
]

beforeEach(async () => {
  await db.delete()
  await db.open()
  resetAssistantStatus()
  resetSkills(SKILLS)
})
afterEach(() => { document.body.innerHTML = ''; vi.unstubAllGlobals() })

describe('Today composer (3.3)', () => {
  it('shows the composer with example cards when the assistant is available, and Enter opens the panel with the text', async () => {
    setAssistantStatus(base)
    const r = await render(<TodayAsk role="member" />)
    await flush(10)
    expect(document.querySelector('[data-today-ask] [data-ask-composer]')).toBeTruthy()
    expect(document.querySelectorAll('[data-ask-example]')).toHaveLength(3)
    const input = document.querySelector('[data-ask-input]') as HTMLTextAreaElement
    const { act } = await import('react')
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(input, 'what is overdue in Work?')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await key(input, 'Enter')
    expect(takeAssistantPrefill()).toEqual({ text: 'what is overdue in Work?', send: true })
    await r.unmount()
  })

  it('off: the owner sees one hint that stays dismissed on this device; a member sees nothing', async () => {
    setAssistantStatus(off)
    let r = await render(<TodayAsk role="owner" />)
    await flush(20)
    expect(document.querySelector('[data-ask-hint]')!.textContent).toContain('Set up the assistant')
    expect(document.querySelector('[data-ask-composer]')).toBeNull()
    await click([...document.querySelectorAll('[data-ask-hint] button')].find((b) => b.textContent === 'Dismiss')!)
    await flush(20)
    expect(document.querySelector('[data-ask-hint]')).toBeNull()
    expect(await getMeta(HINT_DISMISSED_KEY, false)).toBe(true)
    await r.unmount()
    r = await render(<TodayAsk role="owner" />)
    await flush(20)
    expect(document.querySelector('[data-ask-hint]')).toBeNull()
    await r.unmount()
    r = await render(<TodayAsk role="member" />)
    await flush(20)
    expect(document.body.textContent).toBe('')
    await r.unmount()
  })

  it('an encrypted account gets no composer on Today', async () => {
    setAssistantStatus(encrypted)
    const r = await render(<TodayAsk role="owner" />)
    await flush(20)
    expect(document.querySelector('[data-ask-composer]')).toBeNull()
    expect(document.querySelector('[data-ask-hint]')).toBeNull()
    await r.unmount()
  })
})

describe('Ask screen (3.4)', () => {
  it('lists every skill and "Use this skill" opens the panel with it', async () => {
    setAssistantStatus(base)
    const r = await render(<AskScreen role="member" />)
    await flush(10)
    expect(document.querySelectorAll('[aria-label="Skills"] li')).toHaveLength(3)
    await click([...document.querySelectorAll('[data-ask-screen] button')].find((b) => b.textContent === 'Use this skill')!)
    expect(takeAssistantPrefill()).toEqual({ text: '', skill: 'idea-to-project', send: false })
    await r.unmount()
  })

  it('explains an encrypted account and shows no composer', async () => {
    setAssistantStatus(encrypted)
    const r = await render(<AskScreen role="member" />)
    await flush(10)
    expect(document.querySelector('[data-ask-unavailable]')!.textContent).toContain('can’t read end-to-end encrypted tasks')
    expect(document.querySelector('[data-ask-composer]')).toBeNull()
    await r.unmount()
  })

  it('/ask is a route, and g then k opens it with focus in the composer', async () => {
    expect(parseRoute('/ask')).toEqual({ view: 'ask' })
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })))
    setAssistantStatus(base)
    const user = { id: 'u1', email: 'a@example.com', name: 'Ada', role: 'member', created_at: 0 } as User
    navigate({ view: 'inbox' })
    const r = await render(<Shell user={user} onLogout={() => {}} />)
    await flush(30)
    // The sidebar lists Ask while the assistant is available.
    expect([...document.querySelectorAll('aside button')].some((b) => b.textContent?.trim() === 'Ask')).toBe(true)
    await key(document.body, 'g')
    await key(document.body, 'k')
    await flush(30)
    expect(document.querySelector('[data-ask-screen]')).toBeTruthy()
    expect(document.activeElement?.hasAttribute('data-ask-input')).toBe(true)
    await r.unmount()
  })
})
