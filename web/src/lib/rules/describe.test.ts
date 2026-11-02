// Describe it on the device (OpenSpec change routines-describe-it, task 2.3):
// the same request as the server's (vectors from internal/assistant), the
// same reading of the answer, the TypeScript check with one retry, and no
// request to the OpenTodo server.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import vectors from '../assistantDevice/routineDraft.vectors.json'
import { draftNamesOf, editorDraftOf, type DraftNames } from './describe'

type ScriptRound = { stop: string; calls?: { id: string; name: string; args: string }[]; text?: string }
const provider = vi.hoisted(() => ({ rounds: [] as ScriptRound[], requests: [] as { system: string; messages: { text: string }[]; tools: { name: string }[] }[], results: [] as unknown[][] }))
vi.mock('../assistantDevice/settings', async (orig) => ({ ...(await orig<typeof import('../assistantDevice/settings')>()), getDeviceSetup: async () => ({ provider: 'anthropic', model: 'claude-opus-5-5', key: 'sk-device' }) }))
vi.mock('../assistantDevice/providers', async (orig) => ({
  ...(await orig<typeof import('../assistantDevice/providers')>()),
  providerFor: () => ({
    start: (req: (typeof provider.requests)[number]) => {
      provider.requests.push(req)
      let i = 0
      return {
        next: async (onText: (d: string) => void) => {
          const r = provider.rounds[Math.min(i++, provider.rounds.length - 1)]
          if (r.text) onText(r.text)
          return { stop: r.stop, rawStop: r.stop, toolCalls: r.calls ?? [], input: 100, output: 20 }
        },
        addToolResults: (res: unknown[]) => { provider.results.push(res) },
      }
    },
  }),
}))

const { checkDraftOnDevice, draftMessage, draftOnDevice, draftSystemFor, readDraft } = await import('./describeDevice')

const names: DraftNames = {
  projects: [{ id: 'p1', name: 'Groceries' }, { id: 'p2', name: 'Errands' }], sections: [], labels: [{ id: 'l1', name: 'waiting' }], views: [], webhooks: [],
}
const groceries = `[{"id":"a","kind":"note_text","in":{"of":{"literal":{"project":"p1"}}}},{"id":"b","kind":"split_lines","in":{"text":{"ref":"a"}}},{"id":"c","kind":"create_tasks","in":{"text":{"ref":"b"},"project":{"literal":{"project":"p2"}}}}]`
const call = (id: string, steps: string, trigger = '{"kind":"schedule","at":"17:00","weekdays":[5]}') =>
  ({ id, name: 'draft_routine', args: JSON.stringify({ name: 'Groceries', trigger, condition: 'null', steps, note: '' }) })

let fetches: string[] = []
beforeEach(() => {
  provider.rounds = []
  provider.requests = []
  provider.results = []
  fetches = []
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => { fetches.push(String(input)); return new Response('{}') }))
})
afterEach(() => vi.unstubAllGlobals())

describe('the request', () => {
  it('matches the server’s system text and message (vectors)', () => {
    for (const v of vectors.prompts) {
      expect(draftSystemFor(v.kinds), v.name).toBe(v.system)
      expect(draftMessage(v.text, v.names as DraftNames), v.name).toBe(v.message)
    }
  })

  it('reads the answer like the server (vectors)', () => {
    for (const v of vectors.reads) {
      const got = readDraft(v.args)
      expect(got.draft, v.name).toEqual(v.draft)
      expect(got.note, v.name).toBe(v.note)
      expect(got.problems, v.name).toEqual(v.problems)
    }
  })
})

describe('the device check', () => {
  const draft = (steps: string, trigger: unknown = { kind: 'schedule', at: '17:00', weekdays: [5] }) => ({ name: 'G', trigger, condition: null, steps: JSON.parse(steps) }) as never

  it('passes a draft that checks, and names a type error, an unknown id and an unavailable step', () => {
    expect(checkDraftOnDevice(draft(groceries), names, null)).toEqual([])
    const bad = checkDraftOnDevice(draft(`[{"id":"a","kind":"create_tasks","in":{"text":{"ref":"z"}}}]`), names, null)
    expect(bad[0]).toMatchObject({ step: 'a', code: 'invalid_input' })
    const unknown = checkDraftOnDevice(draft(groceries.replace('"p2"', '"p9"')), names, null)
    expect(unknown[0]).toMatchObject({ step: 'c', input: 'project', code: 'invalid_input' })
    const email = checkDraftOnDevice(draft(`[{"id":"a","kind":"email_me","in":{"subject":{"literal":"Week"},"text":{"literal":"x"}}}]`), names,
      { email_me: { kind: 'email_me', group: 'communication', available: false, reason: 'encrypted' } })
    expect(email).toEqual([expect.objectContaining({ step: 'a', code: 'unavailable' })])
    expect(checkDraftOnDevice(draft(groceries, { kind: 'schedule', at: '25:00', weekdays: [5] }), names, null)[0].message).toContain('HH:MM')
    expect(checkDraftOnDevice(draft(groceries, { kind: 'label.added', label_id: 'l9' }), names, null)[0].message).toContain('no such label')
  })
})

describe('a draft on the device', () => {
  it('"Encrypted account": a draft fixed on retry, and no request reaches the OpenTodo server', async () => {
    provider.rounds = [
      { stop: 'tool_use', calls: [call('c1', `[{"id":"a","kind":"get_task","in":{"task":{"literal":{"task":"t1"}}}}]`)] },
      { stop: 'tool_use', calls: [call('c2', groceries)] },
    ]
    const ans = await draftOnDevice('every Friday at five, make tasks in Errands from my Groceries note', names, null)
    expect(ans.errors).toEqual([])
    expect(ans.draft?.steps).toHaveLength(3)
    expect(provider.requests).toHaveLength(1)
    expect(provider.requests[0].tools.map((t) => t.name)).toEqual(['draft_routine'])
    expect(provider.requests[0].system).not.toContain('- get_task:')
    expect(provider.requests[0].messages[0].text).toContain('"untrusted_text"')
    expect(JSON.stringify(provider.results[0])).toContain('chosen by hand')
    expect(fetches).toEqual([])
    // As the editor's draft: never "apply without asking".
    expect(editorDraftOf(ans.draft!)).toMatchObject({ aiApply: '', aiBudget: 0 })
  })

  it('a draft that fails twice comes back with its errors; words without a draft are the note', async () => {
    provider.rounds = [{ stop: 'tool_use', calls: [call('c1', `[{"id":"a","kind":"create_tasks","in":{"text":{"ref":"z"}}}]`)] }]
    const ans = await draftOnDevice('x', names, null)
    expect(ans.draft).not.toBeNull()
    expect(ans.errors[0]).toMatchObject({ step: 'a' })
    provider.rounds = [{ stop: 'end_turn', text: 'Email is not available here.' }]
    const words = await draftOnDevice('email me', names, null)
    expect(words).toMatchObject({ draft: null, note: 'Email is not available here.', errors: [{ code: 'no_draft' }] })
    expect(fetches).toEqual([])
  })
})

describe('the editor’s draft', () => {
  it('repairs what the editor cannot show: an unknown trigger, a condition that is no object, unknown steps', () => {
    const d = editorDraftOf({ name: 'x', trigger: { kind: 'weekly' } as never, condition: [] as never,
      steps: [{ id: 'a', kind: 'teleport' }, { id: 'b', kind: 'repeat', in: {}, do: [{ id: 'c', kind: 'nope' }, { id: 'd', kind: 'notify' }] }] as never })
    expect(d).toEqual({ name: 'x', trigger: { kind: 'manual' }, condition: null, steps: [{ id: 'b', kind: 'repeat', in: {}, do: [{ id: 'd', kind: 'notify' }] }], aiApply: '', aiBudget: 0 })
  })
})

describe('names', () => {
  it('leaves out archived projects and their sections, and gives webhooks by host', () => {
    const n = draftNamesOf({
      projects: [{ id: 'p1', name: 'A', archived: false, deleted_at: null }, { id: 'p2', name: 'B', archived: true, deleted_at: null }] as never,
      sections: [{ id: 's1', name: 'S', project_id: 'p2', deleted_at: null }] as never,
      labels: [], views: [],
      webhooks: [{ id: 'w1', url: 'https://hooks.example.com/secret/token', enabled: true }] as never,
    })
    expect(n).toEqual({ projects: [{ id: 'p1', name: 'A' }], sections: [], labels: [], views: [], webhooks: [{ id: 'w1', name: 'hooks.example.com' }] })
  })
})
