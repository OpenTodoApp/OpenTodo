// A routine's AI step on this device (assistant-routine-blocks 1.1): an Ask AI
// step answering in text is offered the server's three show tools with its show
// note, checks the ids against this device's rows, keeps kinds and parameters
// only and stays within the run's blocks and the rounds.
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../db'
import { createTask, resetDeviceId } from '../ops'
import { manifest } from '../assistantDevice/manifest'
import type { Request, Round, ToolResult } from '../assistantDevice/providers'

const script = vi.hoisted(() => ({ rounds: [] as Partial<Round & { text: string }>[], req: null as unknown, results: [] as unknown[][], calls: 0 }))
vi.mock('../assistantDevice/settings', () => ({ getDeviceSetup: async () => ({ provider: 'anthropic', key: 'k', model: 'm' }) }))
vi.mock('../assistantDevice/providers', async (orig) => ({
  ...(await orig<typeof import('../assistantDevice/providers')>()),
  providerFor: () => ({
    start(req: Request) {
      script.req = req
      return {
        async next(onText: (d: string) => void): Promise<Round> {
          const r = script.rounds[Math.min(script.calls++, script.rounds.length - 1)]
          if (r.text) onText(r.text)
          return { stop: 'end_turn', rawStop: '', toolCalls: [], input: 10, output: 5, ...r }
        },
        addToolResults(results: ToolResult[]) { script.results.push(results) },
      }
    },
  }),
}))

const { completeOnDevice, ROUTINE_SYSTEM, UNTRUSTED_NOTE } = await import('./deviceAI')

const call = (show: number) => ({ instruction: 'Brief me', context: [], answer: 'text', maxTokens: 1000, show })
const tool = (id: string, name: string, args: unknown) => ({ id, name, args: JSON.stringify(args) })

beforeEach(async () => {
  await db.delete()
  await db.open()
  resetDeviceId()
  script.rounds = []
  script.results = []
  script.calls = 0
})

describe('an AI step on the device', () => {
  it('uses the manifest: the server\'s fixed instructions', () => {
    expect(ROUTINE_SYSTEM).toBe(manifest.routine.system)
    expect(UNTRUSTED_NOTE).toBe(manifest.untrusted_note)
    expect(manifest.routine.tools).toEqual(['show_tasks', 'show_calendar', 'show_deadlines'])
  })

  it('"Morning briefing": shows the day and the tasks as kinds and ids, refusing other tools and unknown ids', async () => {
    const id = await createTask({ title: 'Send the slides' })
    script.rounds = [
      { stop: 'tool_use', toolCalls: [
        tool('c1', 'show_calendar', { date: '2026-11-06', span: 'day' }),
        tool('c2', 'show_tasks', { ids: [id, 'gone'], title: 'Start with' }),
        tool('c3', 'show_map', { task_ids: [id] }),
        tool('c4', 'show_tasks', { ids: ['nope'] }),
      ] },
      { text: 'A light day.' },
    ]
    const ans = await completeOnDevice(call(4))
    const req = script.req as Request
    expect(req.tools.map((t) => t.name)).toEqual(['show_tasks', 'show_calendar', 'show_deadlines'])
    expect(req.system).toBe(`${manifest.routine.system}\n${manifest.routine.show_note}`)
    expect(ans.blocks).toEqual([{ kind: 'calendar', date: '2026-11-06', span: 'day' }, { kind: 'tasks', ids: [id] }])
    const res = script.results[0] as ToolResult[]
    expect(res[2].content).toContain('unknown_tool')
    expect(res[3].content).toContain('not_found')
    expect(ans).toMatchObject({ text: 'A light day.', input: 20, output: 10 })
  })

  it('keeps to the blocks left in the run and to the rounds', async () => {
    script.rounds = [{ text: 'Today. ', stop: 'tool_use', toolCalls: [tool('c1', 'show_calendar', { date: '2026-11-06', span: 'day' }), tool('c2', 'show_calendar', { date: '2026-11-07', span: 'day' })] }]
    const ans = await completeOnDevice(call(1))
    expect(script.calls).toBe(manifest.routine.max_rounds)
    expect(ans.blocks).toHaveLength(1)
    expect((script.results[0] as ToolResult[])[1].content).toContain('block_limit')
    expect(ans.text).toBe('Today. Today. Today.')
  })

  it('offers no tool when the step may show none', async () => {
    script.rounds = [{ text: 'Done.' }]
    const ans = await completeOnDevice(call(0))
    expect((script.req as Request).tools).toEqual([])
    expect((script.req as Request).system).toBe(manifest.routine.system)
    expect(ans.blocks).toBeUndefined()
  })
})
