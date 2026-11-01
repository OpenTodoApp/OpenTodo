// A rule draft made from a saved filter or a board column ("Make an automation
// rule", automation-rules): the routine editor opens it as a When card and one
// Change tasks card (routines-editor D1).
import type { RuleActions, RuleCondition, RuleTrigger } from '../../lib/types'

export interface RuleDraft {
  name: string
  trigger: RuleTrigger
  condition: RuleCondition | null
  actions: RuleActions
  /** Terms of a converted filter that a rule cannot use. */
  dropped?: string[]
}
