import { describe, expect, it } from 'vitest'
import fixture from '../../../internal/flow/testdata/flow_fixture.json'
import { availability, effectiveSectionFlow, projectFlowOf, sectionFlowOf, type FlowInput, type FlowTask } from './flow'

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

describe('shared vectors (internal/flow/testdata/flow_fixture.json)', () => {
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

describe('reading the flow', () => {
  it('reads empty, missing and unknown values as the defaults', () => {
    expect(projectFlowOf({ flow_mode: '' })).toBe('parallel')
    expect(projectFlowOf({})).toBe('parallel')
    expect(projectFlowOf({ flow_mode: 'staged' })).toBe('parallel')
    expect(projectFlowOf({ flow_mode: 'area' })).toBe('area')
    expect(sectionFlowOf({ flow_mode: 'area' })).toBe('')
    expect(sectionFlowOf({ flow_mode: 'sequential' })).toBe('sequential')
    expect(effectiveSectionFlow({ flow_mode: '' }, 'area')).toBe('parallel')
    expect(effectiveSectionFlow({ flow_mode: '' }, 'sequential')).toBe('sequential')
    expect(effectiveSectionFlow({ flow_mode: 'parallel' }, 'sequential')).toBe('parallel')
  })

  it('reopening a step makes the next one wait again', () => {
    const base = (doneVan: boolean): FlowInput => ({
      today: '2026-10-30', projects: [{ id: 'm', flow_mode: 'sequential' }], sections: [],
      tasks: ['van', 'pack', 'keys'].map((id, i) => ({ id, project_id: 'm', parent_id: null, section_id: null, position: i, completed_at: id === 'van' && doneVan ? 1 : null, deleted_at: null, start: null, blocked_by: [], recurrence: null, habit: false })),
    })
    expect(availability(base(true)).available('pack')).toBe(true)
    expect(availability(base(false)).waits('pack')).toBe(true)
  })
})
