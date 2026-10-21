// "Make an automation rule" (automation-rules, custom-views delta): a saved
// filter or a board column becomes a rule draft. The condition comes from the
// structural terms of the query, the actions from the column's on-drop rule, and
// the trigger starts at "a task is created". Nothing is saved until the user does.
import { knownRule } from '../../lib/rules'
import { queryToCondition } from '../../lib/rules/convert'
import type { Label, Project, View } from '../../lib/types'
import type { RuleDraft } from './RuleDialog'

export function ruleDraftFromView(view: Pick<View, 'name' | 'query' | 'on_drop'>, names: { labels: readonly Label[]; projects: readonly Project[] }): RuleDraft {
  const { condition, dropped } = queryToCondition(view.query ?? '', names)
  return { name: view.name, trigger: { kind: 'task.created' }, condition, actions: knownRule(view.on_drop) ?? {}, dropped }
}
