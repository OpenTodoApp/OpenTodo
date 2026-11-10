// The project flow vectors shared with internal/flow (docs/contracts.md), run on the
// app's runtime against web/src/lib/flow.ts.
import { availability, type FlowInput, type FlowTask } from '@shared/flow'
import fixture from '../../../internal/flow/testdata/flow_fixture.json'

type Case = (typeof fixture.cases)[number]

function inputOf(c: Case): FlowInput {
  return {
    today: c.today,
    projects: c.projects as FlowInput['projects'],
    sections: (c.sections as Partial<FlowInput['sections'][number]>[]).map((s) => ({ deleted_at: null, flow_mode: '', ...s })) as FlowInput['sections'],
    tasks: (c.tasks as Partial<FlowTask>[]).map((t) => ({
      project_id: null, parent_id: null, section_id: null, completed_at: null, deleted_at: null, start: null, blocked_by: [], recurrence: null, habit: false, ...t,
    })) as FlowTask[],
  }
}

describe('flow_fixture.json', () => {
  for (const c of fixture.cases) {
    it(c.name, () => {
      const state = availability(inputOf(c))
      const ids = c.tasks.map((t) => t.id)
      expect(ids.filter((id) => state.available(id)).sort()).toEqual([...c.expected.available].sort())
      const waits: Record<string, string> = {}
      for (const id of ids) {
        const f = state.get(id)
        if (f.waits && f.heldBy) waits[id] = `${f.heldBy.kind}:${f.heldBy.id}`
      }
      expect(waits).toEqual(c.expected.waits)
    })
  }
})
