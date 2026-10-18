// @vitest-environment happy-dom
// Ask composer on Today, the Ask screen and their availability (OpenSpec change
// assistant-skills, tasks 3.3 and 3.4).
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetSkills } from '../lib/assistantSkills'
import { resetAssistantStatus, setAssistantStatus, takeAssistantPrefill, type AssistantStatus } from '../lib/assistantStatus'
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
    const user = { id: 'u1', email: 'a@example.com', name: 'Ada', role: 'member', created_at: 0 } as unknown as User
    navigate({ view: 'inbox' })
    const r = await render(<Shell user={user} onLogout={() => {}} />)
    await flush(30)
    // The sidebar's More menu lists Ask while the assistant is available (ux-overhaul, sidebar-compact-desktop).
    await click(document.querySelector('[data-sidebar-more-menu] button[aria-haspopup="menu"]')!)
    await flush(10)
    expect(document.querySelector('[role="menu"] [data-menu-label="Ask"]')).not.toBeNull()
    await key(document.body, 'Escape')
    await flush(10)
    await key(document.body, 'g')
    await key(document.body, 'k')
    await flush(30)
    expect(document.querySelector('[data-ask-screen]')).toBeTruthy()
    expect(document.activeElement?.hasAttribute('data-ask-input')).toBe(true)
    await r.unmount()
  })
})
