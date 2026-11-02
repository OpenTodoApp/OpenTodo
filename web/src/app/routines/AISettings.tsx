// A routine's AI settings in the editor (OpenSpec change routines-ai-step,
// design D4, D5, D11, D12): Apply without asking with the reason when it
// cannot be on and the notice when the server turned it off, the daily token
// budget, and the routine's AI tokens of the last 7 days. Shown below the
// cards of a routine that holds an AI step. For a saved routine the switch
// writes at once (a new op each time, so turning it on again after a fallback
// resumes auto mode); for a new one it is saved with the routine.
import { useEffect, useState } from 'react'
import { api } from '../../lib/api'
import { formatNumber, t } from '../../lib/i18n'

import { autoReason, budgetOf, fallbackText, MAX_AI_BUDGET, MIN_AI_BUDGET } from '../../lib/rules/ai'
import type { RoutineDraft } from '../../lib/rules/draft'
import { setApplyWithoutAsking } from '../../lib/rules/store'
import { MAX_AUTO_ITEMS } from '../../lib/rules/steps'
import type { Rule, RoutineAIUsage } from '../../lib/types'
import { Field, Input, Notice, Switch } from '../../ui'
import { act } from '../actionError'

/** Whether a budget field's text is a value the server accepts ('' is the default). */
export function budgetError(text: string): string {
  if (!text.trim()) return ''
  const n = Number(text)
  return Number.isInteger(n) && n >= MIN_AI_BUDGET && n <= MAX_AI_BUDGET
    ? '' : t('Enter a whole number from {min} to {max}', { min: formatNumber(MIN_AI_BUDGET), max: formatNumber(MAX_AI_BUDGET) })
}

export function AISettings({ rule, draft, online, onDraft }: {
  rule?: Rule; draft: RoutineDraft; online: boolean; onDraft: (fn: (d: RoutineDraft) => RoutineDraft) => void
}) {
  const [usage, setUsage] = useState<RoutineAIUsage | null>(null)
  const [auto, setAuto] = useState<boolean | null>(null)
  const [budgetText, setBudgetText] = useState(draft.aiBudget ? String(draft.aiBudget) : '')
  const ruleId = rule?.id
  useEffect(() => {
    if (!ruleId || !online) return
    let live = true
    api.routineAIUsage(ruleId).then((u) => { if (live) setUsage(u) }, () => undefined)
    return () => { live = false }
  }, [ruleId, online])
  const reason = autoReason(draft.steps)
  const mode = usage?.mode ?? null
  const on = reason ? false : rule ? (auto ?? (mode ? mode.auto : rule.ai_apply === 'auto')) : draft.aiApply === 'auto'
  const notice = !reason && rule && auto === null && mode?.asked && !mode.auto ? fallbackText(mode.reason) : ''
  const toggle = (next: boolean) => {
    if (!rule) { onDraft((d) => ({ ...d, aiApply: next ? 'auto' : '' })); return }
    setAuto(next)
    act(setApplyWithoutAsking(rule.id, next))
  }
  const budget = budgetOf(draft.aiBudget)
  const today = new Date().toISOString().slice(0, 10)
  const week = (usage?.days ?? []).reduce((n, d) => n + d.tokens, 0)
  const usedToday = (usage?.days ?? []).find((d) => d.day === today)?.tokens ?? 0
  const error = budgetError(budgetText)
  return (
    <section className="surface-card mx-auto w-full max-w-[44rem] space-y-3 p-3" aria-labelledby="routine-ai-title" data-routine-ai>
      <h3 id="routine-ai-title" className="text-body font-medium text-strong">{t('AI results')}</h3>
      <Switch checked={on} onChange={toggle} disabled={!!reason} label={t('Apply without asking')}
        description={reason || t('Without it, each run’s changes wait in the Inbox as a proposal you review. With it, the routine creates tasks, comments and labels and sets task fields at once, at most {n} items a run, always listed in the Inbox with Undo.', { n: MAX_AUTO_ITEMS })} />
      {notice && <Notice tone="warning">{notice}</Notice>}
      <Field label={t('Daily AI budget (tokens)')} error={error}
        description={t('An AI step that would use more today does not run. Default {n}.', { n: formatNumber(20000) })}>
        <Input inputMode="numeric" value={budgetText} placeholder={formatNumber(20000)} className="max-w-[12rem]" data-ai-budget
          onChange={(e) => {
            const text = e.target.value.replace(/[^\d]/g, '')
            setBudgetText(text)
            if (!budgetError(text)) onDraft((d) => ({ ...d, aiBudget: text ? Number(text) : 0 }))
          }} />
      </Field>
      {rule && usage && (
        <p className="text-meta text-muted" data-ai-usage>
          {t('AI tokens today: {today} of {budget} · last 7 days: {week}', { today: formatNumber(usedToday), budget: formatNumber(budget), week: formatNumber(week) })}
        </p>
      )}
    </section>
  )
}
