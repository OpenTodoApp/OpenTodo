// @vitest-environment happy-dom
// Skills in the assistant panel and "Break this down" from a task (OpenSpec
// change assistant-skills, task 3.2).
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetSkills } from '../lib/assistantSkills'
import { openAssistantWith, resetAssistantStatus, setAssistantStatus, takeAssistantPrefill, type AssistantStatus } from '../lib/assistantStatus'
import { GRID_PREFS_META_KEY } from '../lib/calendar'
import { db, setMeta } from '../lib/db'
import { createTask, resetDeviceId } from '../lib/ops'
import { click, flush, render } from '../ui/test-utils'
import { AssistantPanel } from './assistant/AssistantPanel'
import { TaskDetail } from './task-detail/TaskDetail'

const status: AssistantStatus = {
  available: true, enabled: true, reason: '', provider: 'anthropic', provider_label: 'Anthropic (Claude)', model: 'm', consented: true,
  disclosure_version: 1, fields: [], allow_member_keys: false, own_key_set: false, operator_key_set: true,
}
const SKILLS = [
  { id: 'plan-week', name: 'Plan my week', description: 'Proposes due dates within your working hours.', example: 'Plan my week', result: 'changes' as const },
  { id: 'break-down', name: 'Break this down', description: 'Turns one task into subtasks.', example: 'Break this task into steps', result: 'changes' as const, subject: 'selection' as const },
]

let turns: Record<string, unknown>[] = []
beforeEach(async () => {
  await db.delete()
  await db.open()
  resetDeviceId()
  resetAssistantStatus()
  resetSkills(SKILLS)
  setAssistantStatus(status)
  turns = []
  vi.stubGlobal('fetch', vi.fn(async (path: string, init?: RequestInit) => {
    if (path === '/api/v1/me/assistant') return new Response(JSON.stringify(status), { status: 200 })
    if (path === '/api/v1/assistant/skills') return new Response(JSON.stringify({ skills: SKILLS }), { status: 200 })
    if (path === '/api/v1/assistant/turn') {
      turns.push(JSON.parse(String(init?.body)))
      return new Response('event: text\ndata: {"text":"Done."}\n\nevent: done\ndata: {"stop_reason":"end_turn"}\n\n', { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
    }
    return new Response('{}', { status: 404 })
  }))
})
afterEach(() => { document.body.innerHTML = ''; vi.unstubAllGlobals() })

const panel = () => render(<AssistantPanel onClose={() => {}} context={() => ({ view: 'today' })} onApplied={() => {}} />)

describe('skills in the panel', () => {
  it('a prefilled skill is sent with the device working day', async () => {
    await setMeta(GRID_PREFS_META_KEY, { startHour: 9, endHour: 17, dayLength: 420 })
    openAssistantWith({ text: 'my week', skill: 'plan-week', send: true })
    const r = await panel()
    for (let i = 0; i < 40 && turns.length === 0; i++) await flush(25)
    expect(turns).toHaveLength(1)
    expect(turns[0]).toMatchObject({ skill: 'plan-week', workday: { startHour: 9, endHour: 17, dayLength: 420 }, view: 'today' })
    expect((turns[0].messages as { text: string }[]).at(-1)!.text).toBe('my week')
    await r.unmount()
  })

  it('choosing a skill from the menu shows its description before sending', async () => {
    const r = await panel()
    await flush(40)
    await click(document.querySelector('[data-assistant-panel] button[aria-label="Skills"]')!)
    await flush(20)
    const item = [...document.querySelectorAll('[role^="menuitem"]')].find((b) => b.textContent?.includes('Plan my week'))!
    await click(item)
    await flush(20)
    const chosen = document.querySelector('[data-assistant-chosen]')!
    expect(chosen.textContent).toContain('Skill: Plan my week.')
    expect(chosen.textContent).toContain('Proposes due dates within your working hours.')
    expect(turns).toHaveLength(0)
    await r.unmount()
  })

  it('pasted material is sent as an untrusted message before the question', async () => {
    openAssistantWith({ text: 'turn this into a project', pasted: 'Notes\n- soil', send: true })
    const r = await panel()
    for (let i = 0; i < 40 && turns.length === 0; i++) await flush(25)
    const msgs = turns[0].messages as { text: string; untrusted?: boolean }[]
    expect(msgs.slice(-2)).toEqual([{ role: 'user', text: 'Notes\n- soil', untrusted: true }, { role: 'user', text: 'turn this into a project' }])
    await r.unmount()
  })
})

describe('Break this down from a task', () => {
  it('opens the panel with the skill and the task selected', async () => {
    const id = await createTask({ title: 'Plan the offsite' })
    const r = await render(<TaskDetail taskId={id} projects={[]} labelMap={new Map()} onClose={() => {}} />)
    await flush(40)
    await click(document.querySelector('button[aria-label="Task actions"]')!)
    await flush(20)
    await click([...document.querySelectorAll('[role^="menuitem"]')].find((b) => b.textContent?.includes('Break this down'))!)
    const p = takeAssistantPrefill()
    expect(p).toMatchObject({ skill: 'break-down', selected: [id] })
    await r.unmount()
    openAssistantWith({ ...p!, send: true })
    const r2 = await panel()
    for (let i = 0; i < 40 && turns.length === 0; i++) await flush(25)
    expect(turns[0]).toMatchObject({ skill: 'break-down', selected: [id] })
    await r2.unmount()
  })
})
