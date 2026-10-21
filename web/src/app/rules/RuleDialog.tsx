// The automation rule editor (OpenSpec change automation-rules, "Rules page"):
// a name, the trigger, the condition rows and the actions, with the live count of
// open tasks that match now (computed on this device by the shared matcher) and the
// one-line summary. Saving goes through createRule/updateRule as ordinary ops.
import { useEffect, useMemo, useState } from 'react'
import { api } from '../../lib/api'
import { logicalToday } from '../../lib/dates'
import { useEncryption } from '../../lib/e2ee'
import { t } from '../../lib/i18n'
import { useOpenTasks } from '../../lib/liveTasks'
import { useLabels, useLiveSections, useMemberships, useProjects } from '../../lib/localData'
import { matchesCondition, type MatchTask } from '../../lib/rules/match'
import { createRule, updateRule } from '../../lib/rules/store'
import { summarizeRule } from '../../lib/rules/summary'
import type { Rule, RuleActions, RuleCondition, RuleTrigger, Task, Webhook } from '../../lib/types'
import { Button, Dialog, Field, Input } from '../../ui'
import { ActionFields, ConditionFields, TriggerFields } from './RuleFields'

/** What the editor starts from: a rule to edit, or a draft (a conversion, a duplicate). */
export interface RuleDraft {
  name: string
  trigger: RuleTrigger
  condition: RuleCondition | null
  actions: RuleActions
  /** Terms of a converted filter that a rule cannot use. */
  dropped?: string[]
}

export const EMPTY_DRAFT: RuleDraft = { name: '', trigger: { kind: 'task.created' }, condition: null, actions: {} }

/** A task as the matcher reads it. */
export function matchTaskOf(task: Task): MatchTask {
  return {
    id: task.id, project_id: task.project_id, section_id: task.section_id ?? null, labels: task.labels, priority: task.priority,
    dueDate: task.due?.date ?? null, deadline: task.deadline ?? null, start: task.start ?? null, evening: !!task.evening,
    blocked_by: task.blocked_by ?? [], assignee_id: task.assignee_id ?? null, origin: task.origin ?? null, habit: !!task.habit,
    estimate_minutes: task.estimate_minutes ?? null,
  }
}

/** How many open tasks a condition matches now on this device. */
export function useMatchCount(condition: RuleCondition | null, me: string): number {
  const tasks = useOpenTasks()
  const projects = useProjects()
  return useMemo(() => {
    const parent = new Map(projects.map((p) => [p.id, p.parent_id]))
    const open = new Set(tasks.map((x) => x.id))
    const ctx = { userId: me, today: logicalToday(), parent: (id: string) => parent.get(id) ?? null, open: (id: string) => open.has(id), tracked: () => 0 }
    return tasks.filter((x) => matchesCondition(condition, matchTaskOf(x), ctx)).length
  }, [tasks, projects, condition, me])
}

function triggerComplete(tr: RuleTrigger): boolean {
  if (tr.kind === 'label.added' || tr.kind === 'label.removed') return !!tr.label_id
  if (tr.kind === 'task.moved') return !!tr.project_id
  if (tr.kind === 'schedule') return !!tr.at && (tr.weekdays?.length ?? 0) > 0
  return true
}

export function RuleDialog({ rule, draft, me, onClose }: { rule?: Rule; draft?: RuleDraft; me: string; onClose: () => void }) {
  const start = rule ? { name: rule.name, trigger: rule.trigger ?? EMPTY_DRAFT.trigger, condition: rule.condition, actions: rule.actions ?? {} } : draft ?? EMPTY_DRAFT
  const [name, setName] = useState(start.name)
  const [trigger, setTrigger] = useState<RuleTrigger>(start.trigger)
  const [condition, setCondition] = useState<RuleCondition>(start.condition ?? {})
  const [actions, setActions] = useState<RuleActions>(start.actions)
  const [error, setError] = useState<string | null>(null)
  const [webhooks, setWebhooks] = useState<Webhook[] | null>(null)
  const labels = useLabels()
  const projects = useProjects()
  const sections = useLiveSections()
  const memberships = useMemberships()
  const encrypted = useEncryption().enabled
  const shared = useMemo(() => new Set(memberships.map((m) => m.projectId)), [memberships])
  useEffect(() => { api.listWebhooks().then((r) => setWebhooks(r.webhooks), () => setWebhooks(null)) }, [])
  const cond = Object.keys(condition).length ? condition : null
  const count = useMatchCount(cond, me)
  const names = { labels, projects, sections }
  const ready = name.trim() !== '' && Object.keys(actions).length > 0 && triggerComplete(trigger)
  const save = () => {
    setError(null)
    const done = rule
      ? updateRule(rule.id, { name, trigger, condition: cond, actions })
      : createRule({ name, trigger, condition: cond, actions })
    Promise.resolve(done).then(onClose, (e: unknown) => setError(e instanceof Error ? e.message : String(e)))
  }
  return (
    <Dialog title={rule ? t('Edit rule') : t('New rule')} onClose={onClose} size="md" testId="rule-dialog">
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (ready) save() }}>
        <Field label={t('Name')}><Input autoFocus value={name} maxLength={200} onChange={(e) => setName(e.target.value)} placeholder={t('Sunday sweep')} /></Field>
        <TriggerFields value={trigger} onChange={setTrigger} names={names} sharedProjects={shared} />
        <ConditionFields value={condition} onChange={setCondition} names={names} />
        {start.dropped && start.dropped.length > 0 && (
          <ul className="space-y-0.5 text-meta text-muted" data-rule-dropped>
            {start.dropped.map((d) => <li key={d}>{t('{term} cannot be used in a rule', { term: d })}</li>)}
          </ul>
        )}
        <p className="text-meta text-muted" aria-live="polite" data-rule-count>
          {t('{n, plural, one {# open task matches now} other {# open tasks match now}}', { n: count })}
        </p>
        <ActionFields value={actions} onChange={setActions} names={names} encrypted={encrypted} webhooks={webhooks} sharedProjects={shared} />
        <p className="text-meta text-muted" data-rule-summary>{summarizeRule({ trigger, condition: cond, actions }, names)}</p>
        {error && <p role="alert" className="text-meta text-danger">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>{t('Cancel')}</Button>
          <Button type="submit" variant="primary" disabled={!ready}>{t('Save')}</Button>
        </div>
      </form>
    </Dialog>
  )
}
