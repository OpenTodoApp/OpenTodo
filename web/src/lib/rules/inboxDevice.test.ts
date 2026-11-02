// The Inbox card for an encrypted account's device runs (OpenSpec change
// routines-ai-step D9): "Waiting for one of your devices" and the missed run.
import { describe, expect, it } from 'vitest'
import type { RoutineInboxRun } from '../types'
import { inboxLines } from './inbox'

const run = (more: Partial<RoutineInboxRun>): RoutineInboxRun => ({
  id: 1, run_id: 'r1', rule_id: 'g', occurrence: 'schedule:1', at: 10, outcome: 'waiting_device', changes: [], depth: 1, source: 'schedule', run_as: 'me',
  test: false, steps_count: 0, writes: 0, duration_ms: 0, undone_at: null, failed_step: -1, tokens: 0, ai_auto: false, steps: [], kind: 'waiting', ...more,
} as RoutineInboxRun)

describe('device runs in the Inbox card', () => {
  it('lists a waiting run after failures and a missed run as a failure', () => {
    const lines = inboxLines([run({}), run({ run_id: 'r0', rule_id: 'h', outcome: 'missed', kind: 'failure', at: 5 })],
      [{ id: 'g', name: 'Groceries' }, { id: 'h', name: 'Notes' }], () => 'today')
    expect(lines.map((l) => [l.kind, l.text])).toEqual([
      ['failure', 'Notes failed · no device was available'],
      ['waiting', 'Groceries · waiting for one of your devices'],
    ])
  })
})
