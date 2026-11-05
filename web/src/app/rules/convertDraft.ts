// "Make an automation rule" (automation-rules, custom-views delta): a saved
// filter or a board column becomes a rule draft. The condition comes from the
// structural terms of the query, the actions from the column's on-drop rule, and
// the trigger starts at "a task is created". Nothing is saved until the user does.
import { knownRule } from '../../lib/rules'
import { queryToCondition } from '../../lib/rules/convert'
import type { Label, Project, Section, View } from '../../lib/types'
import type { RuleDraft } from '../routines/ruleDraft'

export function ruleDraftFromView(view: Pick<View, 'name' | 'query' | 'on_drop'>, names: { labels: readonly Label[]; projects: readonly Project[] }): RuleDraft {
  const { condition, dropped } = queryToCondition(view.query ?? '', names)
  return { name: view.name, trigger: { kind: 'task.created' }, condition, actions: knownRule(view.on_drop) ?? {}, dropped }
}

/**
 * "Make an automation rule" in a section's menu (section-rule-and-sub-projects D1):
 * the trigger "a task is moved into this project and section", no condition and
 * no action yet, named after the section.
 */
export function ruleDraftFromSection(section: Pick<Section, 'id' | 'name' | 'project_id'>): RuleDraft {
  return { name: section.name, trigger: { kind: 'task.moved', project_id: section.project_id, section_id: section.id }, condition: null, actions: {} }
}
