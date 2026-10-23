// @vitest-environment happy-dom
// Ask on Today, the Assistant page and their availability (OpenSpec changes
// assistant-skills, tasks 3.3 and 3.4, and assistant-surface).
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetSkills } from '../lib/assistantSkills'
import { openAssistantWith, resetAssistantStatus, setAssistantStatus, takeAssistantPrefill, type AssistantStatus } from '../lib/assistantStatus'
import { db } from '../lib/db'
import type { User } from '../lib/types'
import { click, flush, key, render } from '../ui/test-utils'
import { AskScreen, TodayAskAction } from './assistant/AskEntry'
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

describe('Today action (ux-overhaul, in-app-assistant "Ask composer")', () => {
  it('shows one Ask action in the header when the assistant is available, and it opens the panel', async () => {
    setAssistantStatus(base)
    const r = await render(<TodayAskAction role="member" />)
    await flush(10)
    const button = document.querySelector<HTMLButtonElement>('[data-today-ask]')!
    expect(button.textContent).toBe('Ask')
    expect(document.querySelector('[data-ask-composer]')).toBeNull()
    expect(document.querySelectorAll('[data-ask-example]')).toHaveLength(0)
    await click(button)
    expect(takeAssistantPrefill()).toBeNull()
    await r.unmount()
  })

  it('off: neither the owner nor a member sees a hint or a composer', async () => {
    setAssistantStatus(off)
    let r = await render(<TodayAskAction role="owner" />)
    await flush(20)
    expect(document.body.textContent).toBe('')
    expect(document.querySelector('[data-ask-hint]')).toBeNull()
    await r.unmount()
    r = await render(<TodayAskAction role="member" />)
    await flush(20)
    expect(document.body.textContent).toBe('')
    await r.unmount()
  })

  it('an encrypted account gets no Ask action on Today', async () => {
    setAssistantStatus(encrypted)
    const r = await render(<TodayAskAction role="owner" />)
    await flush(20)
    expect(document.querySelector('[data-today-ask]')).toBeNull()
    expect(document.querySelector('[data-ask-composer]')).toBeNull()
    await r.unmount()
  })
})

describe('Ask screen (3.4)', () => {
  it('is the conversation page: the greeting, the composer and the starter skills, and a starter fills the composer (assistant-surface)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })))
    setAssistantStatus(base)
    const r = await render(<AskScreen role="member" name="Ada Lovelace" />)
    await flush(40)
    expect(document.querySelector('[data-assistant-page]')).not.toBeNull()
    expect(document.querySelector('[data-assistant-empty] h2')!.textContent).toMatch(/^Good (morning|afternoon|evening), Ada\.What should we sort out\?$/)
    // The starters follow the fixed order and skip skills the server does not offer.
    expect([...document.querySelectorAll('[data-assistant-starter]')].map((b) => b.getAttribute('data-assistant-starter'))).toEqual(['plan-week', 'idea-to-project'])
    await click(document.querySelector<HTMLButtonElement>('[data-assistant-starter="plan-week"]')!)
    await flush(10)
    expect(document.querySelector('[data-assistant-chosen]')!.textContent).toContain('Skill: Plan my week.')
    // Hidden on this device once dismissed.
    await click(document.querySelector<HTMLButtonElement>('[aria-label="Hide the skill suggestions"]')!)
    expect(document.querySelector('[data-assistant-starters]')).toBeNull()
    expect(localStorage.getItem('opentodo.assistant.startersHidden')).toBe('1')
    localStorage.clear()
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
    const user = { id: 'u1', email: 'a@example.com', name: 'Ada', role: 'member', created_at: 0 } as unknown as User
    navigate({ view: 'inbox' })
    const r = await render(<Shell user={user} onLogout={() => {}} />)
    await flush(30)
    // The sidebar's More menu lists the Assistant while it is available (ux-overhaul, sidebar-compact-desktop, assistant-surface).
    await click(document.querySelector('[data-sidebar-more-menu] button[aria-haspopup="menu"]')!)
    await flush(10)
    expect(document.querySelector('[role="menu"] [data-menu-label="Assistant"]')).not.toBeNull()
    await key(document.body, 'Escape')
    await flush(10)
    await key(document.body, 'g')
    await key(document.body, 'k')
    await flush(30)
    expect(document.querySelector('[data-assistant-page]')).toBeTruthy()
    expect(document.activeElement?.hasAttribute('data-assistant-composer')).toBe(true)
    // On the page, opening the assistant (Shift+I, Ask) opens no sheet: the page is the conversation.
    openAssistantWith({ text: 'What is due?' })
    await flush(40)
    expect(document.querySelector('[data-assistant-panel]')).toBeNull()
    expect(document.querySelector<HTMLTextAreaElement>('[data-assistant-page] [data-assistant-composer]')!.value).toBe('What is due?')
    await r.unmount()
  })
})
