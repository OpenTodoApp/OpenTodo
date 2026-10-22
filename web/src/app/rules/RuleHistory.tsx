// A rule's history (OpenSpec change automation-rules, "Run log"): its runs, newest
// first, each expandable to the tasks it changed. Titles come from this device's
// data; the server never stores them. A task deleted since is shown by its id.
import { useEffect, useState } from 'react'
import { api } from '../../lib/api'
import { formatInstant } from '../../lib/dates'
import { t, msg, translatedMap } from '../../lib/i18n'
import { useOnline } from '../../lib/online'
import { useTaskTitles } from '../../lib/rules/store'
import type { Rule, RuleRun } from '../../lib/types'
import { Dialog, Notice, Skeleton } from '../../ui'

export const OUTCOME_LABEL = translatedMap<RuleRun['outcome']>({
  pending: msg('Running'),
  applied: msg('Applied'),
  already_matched: msg('Already matched'),
  skipped: msg('Skipped'),
  stopped: msg('Stopped: too many rules in a row'),
  failed: msg('Failed'),
  partial: msg('Partial'),
})

function RunTasks({ run }: { run: RuleRun }) {
  const ids = run.changes.map((c) => c.task_id)
  const titles = useTaskTitles(ids)
  if (ids.length === 0) return null
  return (
    <ul className="ml-4 list-disc space-y-0.5 text-meta text-muted">
      {ids.map((id) => <li key={id}>{titles.get(id) ?? t('Deleted task ({id})', { id: id.slice(0, 8) })}</li>)}
    </ul>
  )
}

/** The runs list, newest first, each expandable. */
export function RunList({ runs }: { runs: RuleRun[] }) {
  if (runs.length === 0) return <p className="text-body text-muted">{t('This rule has not run yet.')}</p>
  return (
    <ul className="space-y-2" aria-label={t('Runs')}>
      {runs.map((r) => (
        <li key={r.id} data-rule-run={r.outcome}>
          <details>
            <summary className="cursor-pointer text-body">
              {formatInstant(r.at, 'datetime')} · {OUTCOME_LABEL[r.outcome]}
              {r.reason ? ` · ${r.reason}` : ''}
              {r.changes.length > 0 ? ` · ${t('{n, plural, one {# task} other {# tasks}}', { n: r.changes.length })}` : ''}
            </summary>
            <RunTasks run={r} />
          </details>
        </li>
      ))}
    </ul>
  )
}

export function RuleHistory({ rule, onClose }: { rule: Rule; onClose: () => void }) {
  const online = useOnline()
  const [runs, setRuns] = useState<RuleRun[] | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    if (!online) return
    api.ruleRuns(rule.id).then((r) => setRuns(r.runs), () => setFailed(true))
  }, [rule.id, online])
  return (
    <Dialog title={t('History of {name}', { name: rule.name })} onClose={onClose} size="md" testId="rule-history">
      {!online || failed ? (
        <Notice tone="info">{t('The history is on the server: connect to see it.')}</Notice>
      ) : runs === null ? (
        <Skeleton shape="line" count={3} label={t('Loading runs')} />
      ) : (
        <RunList runs={runs} />
      )}
    </Dialog>
  )
}
