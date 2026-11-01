// Routine runs (OpenSpec change routines-editor, design D9): a routine's History
// tab and the all-runs page list runs newest first with their source, who they
// ran as, the outcome, writes and duration, 50 at a time; a run opens its
// detail, step by step with the items it touched (titles from this device),
// the error with a link to the setting, and Undo run. The server keeps ids and
// counts only. Offline the last fetched page is shown with its age.
import { useEffect, useState } from 'react'
import { api } from '../../lib/api'
import { formatInstant } from '../../lib/dates'
import { readJSON, writeJSON } from '../../lib/deviceStorage'
import { msg, t, translatedMap } from '../../lib/i18n'
import { useOnline } from '../../lib/online'
import { reasonText, settingPath } from '../../lib/rules/catalogue'
import { draftOf, draftTypes } from '../../lib/rules/draft'
import { outputNames, stepName } from '../../lib/rules/sentence'
import { triggerText } from '../../lib/rules/summary'
import { walkSteps } from '../../lib/rules/steps'
import { useMe } from '../../lib/timeEntries'
import type { Rule, RoutineRun, RoutineStep, RoutineStepRecord } from '../../lib/types'
import { Badge, Button, Dialog, Notice, Skeleton } from '../../ui'
import { useRoutineNames, valueNamer, type RoutineNames } from './data'
import { ProposalReview } from './ProposalReview'
import { sentenceText } from './StepCard'

const OUTCOME = translatedMap<string>({
  pending: msg('Running'), applied: msg('Done'), already_matched: msg('Nothing to change'), skipped: msg('Skipped'), stopped: msg('Stopped'),
  failed: msg('Failed'), partial: msg('Partial'), ended: msg('Ended early'), proposal: msg('Proposal'),
})
const PROPOSAL = translatedMap<string>({
  waiting: msg('Proposal waiting'), applied: msg('Proposal applied'), partly_applied: msg('Proposal partly applied'), dismissed: msg('Proposal dismissed'), expired: msg('Proposal expired'),
})
const STATUS = translatedMap<string>({
  ok: msg('Done'), skipped: msg('Skipped'), ended: msg('Ended here'), failed: msg('Failed'), unavailable: msg('Not available'), truncated: msg('Cut at the limit'),
})

type Hue = 'green' | 'red' | 'orange' | 'slate' | 'blue'

/** The outcome as a Badge's text and hue ("Failed at step 3"). */
export function outcomeOf(run: Pick<RoutineRun, 'outcome' | 'failed_step' | 'undone_at'>): { text: string; hue: Hue } {
  if (run.undone_at) return { text: t('Undone'), hue: 'slate' }
  if (run.outcome === 'failed' && run.failed_step >= 0) return { text: t('Failed at step {n}', { n: run.failed_step + 1 }), hue: 'red' }
  const hue: Hue = run.outcome === 'failed' || run.outcome === 'stopped' ? 'red' : run.outcome === 'partial' || run.outcome === 'skipped' ? 'orange' : run.outcome === 'applied' || run.outcome === 'ended' ? 'green' : run.outcome === 'proposal' ? 'blue' : 'slate'
  return { text: OUTCOME[run.outcome] ?? run.outcome, hue }
}

/** Where a run came from ("Scheduled", "You ran it", "An AI assistant ran it"). */
export function sourceText(run: Pick<RoutineRun, 'source' | 'run_as' | 'test'>, rule: Rule | undefined, me: string, names: Pick<RoutineNames, 'labels' | 'projects' | 'sections'>): string {
  if (run.test || run.source === 'test') return t('Test')
  switch (run.source) {
    case 'schedule': return t('Scheduled')
    case 'manual': return run.run_as === me ? t('You ran it') : t('Run by hand')
    case 'mcp': return t('An AI assistant ran it')
  }
  const phrase = rule ? triggerText(rule.trigger, names) : ''
  return phrase ? phrase.charAt(0).toLocaleUpperCase() + phrase.slice(1) : t('By its trigger')
}

const duration = (ms: number): string => (ms < 1000 ? t('{n} ms', { n: ms }) : t('{n} s', { n: Math.round(ms / 100) / 10 }))

/** The age of a cached page ("Updated 2 h ago"). */
function age(at: number): string {
  const min = Math.max(0, Math.round((Date.now() - at) / 60000))
  if (min < 60) return t('Updated {n} min ago', { n: min })
  return t('Updated {n} h ago', { n: Math.round(min / 60) })
}

interface Cached { at: number; runs: RoutineRun[] }

/** Runs, newest first, filterable, 50 at a time (D9). */
export function RunsList({ rules, ruleId, onOpen }: { rules: readonly Rule[]; ruleId?: string; onOpen: (run: RoutineRun) => void }) {
  const online = useOnline()
  const me = useMe() ?? ''
  const names = useRoutineNames()
  const key = `routines.runs.${ruleId ?? 'all'}`
  const [filter, setFilter] = useState({ rule: ruleId ?? '', outcome: '', source: '' })
  const [page, setPage] = useState<{ runs: RoutineRun[]; before?: number } | null>(null)
  const [cached] = useState<Cached | null>(() => readJSON<Cached | null>(key, null))
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    if (!online) return
    let live = true
    setPage(null)
    api.routineRuns({ rule: filter.rule, outcome: filter.outcome, source: filter.source }).then((r) => {
      if (!live) return
      setPage(r)
      if (!filter.outcome && !filter.source && filter.rule === (ruleId ?? '')) writeJSON(key, { at: Date.now(), runs: r.runs })
    }, () => live && setFailed(true))
    return () => { live = false }
  }, [online, filter, key, ruleId])
  const more = () => {
    if (!page?.before) return
    api.routineRuns({ ...filter, before: page.before }).then((r) => setPage({ runs: [...page.runs, ...r.runs], before: r.before }), () => setFailed(true))
  }
  const offline = !online || failed
  const runs = offline ? cached?.runs ?? null : page?.runs ?? null
  const byId = new Map(rules.map((r) => [r.id, r]))
  return (
    <div className="space-y-3" data-runs-list>
      {!ruleId && (
        <div className="flex flex-wrap gap-2" role="group" aria-label={t('Filter runs')}>
          <select className="ui-input w-auto" aria-label={t('Routine')} value={filter.rule} onChange={(e) => setFilter({ ...filter, rule: e.target.value })}>
            <option value="">{t('Every routine')}</option>
            {rules.map((r) => <option key={r.id} value={r.id}>{r.name || t('Untitled routine')}</option>)}
          </select>
          <select className="ui-input w-auto" aria-label={t('Outcome')} value={filter.outcome} onChange={(e) => setFilter({ ...filter, outcome: e.target.value })}>
            <option value="">{t('Any outcome')}</option>
            {['applied', 'partial', 'ended', 'failed', 'skipped', 'already_matched'].map((o) => <option key={o} value={o}>{OUTCOME[o]}</option>)}
          </select>
          <select className="ui-input w-auto" aria-label={t('Source')} value={filter.source} onChange={(e) => setFilter({ ...filter, source: e.target.value })}>
            <option value="">{t('Any source')}</option>
            <option value="schedule">{t('Scheduled')}</option>
            <option value="event">{t('By its trigger')}</option>
            <option value="manual">{t('Run by hand')}</option>
            <option value="mcp">{t('An AI assistant ran it')}</option>
            <option value="test">{t('Test')}</option>
          </select>
        </div>
      )}
      {offline && <Notice tone="info">{cached ? `${t('Needs a connection')} · ${age(cached.at)}` : t('The runs are on the server: connect to see them.')}</Notice>}
      {!offline && runs === null && <Skeleton shape="line" count={3} label={t('Loading runs')} />}
      {runs && runs.length === 0 && <p className="text-body text-muted">{t('No runs yet.')}</p>}
      {runs && runs.length > 0 && (
        <ul className="space-y-1" aria-label={t('Runs')}>
          {runs.map((run) => {
            const rule = byId.get(run.rule_id)
            const o = outcomeOf(run)
            return (
              <li key={run.run_id} data-run={run.outcome}>
                <button type="button" onClick={() => onOpen(run)} className="flex min-h-11 w-full flex-wrap items-center gap-x-2 gap-y-0.5 rounded-control px-2 py-1.5 text-left hover:bg-sunken dark:hover:bg-raised">
                  <span className="text-body text-default">{formatInstant(run.at, 'datetime')}</span>
                  {!ruleId && <span className="user-text text-body text-default">· {rule?.name || t('A deleted routine')}</span>}
                  <Badge hue={o.hue}>{o.text}</Badge>
                  {run.test && <Badge hue="blue">{t('Test')}</Badge>}
                  <span className="w-full text-meta text-muted">
                    {sourceText(run, rule, me, names)} · {t('{n, plural, one {# write} other {# writes}}', { n: run.writes })} · {duration(run.duration_ms)}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
      {!offline && page?.before && <Button size="sm" variant="ghost" onClick={more}>{t('Show more')}</Button>}
    </div>
  )
}

/** The items a step touched as links, titles from this device ("Deleted task" when gone). */
function Touched({ ids, output, names }: { ids: string[]; output: string; names: RoutineNames }) {
  if (!ids.length) return null
  const project = output === 'project'
  return (
    <ul className="ml-4 list-disc space-y-0.5 text-meta">
      {ids.map((id) => {
        const title = project ? names.projectName(id) : names.title(id)
        return (
          <li key={id}>
            {title
              ? <a className="user-text text-accent underline" href={project ? `/project/${id}` : `/task/${id}`}>{title}</a>
              : <span className="text-muted">{project ? t('Deleted project') : t('Deleted task')}</span>}
          </li>
        )
      })}
    </ul>
  )
}

interface RunDetailProps { rule: Rule | undefined; ruleId?: string; runId: string; initial?: RoutineRun }

/** One run in a dialog: a run of a deleted routine, the Inbox card's quick look. */
export function RunDetail({ onClose, ...props }: RunDetailProps & { onClose: () => void }) {
  return (
    <Dialog title={props.rule ? t('Run of {name}', { name: props.rule.name }) : t('Run')} onClose={onClose} size="lg" testId="run-detail">
      <RunDetailBody {...props} />
    </Dialog>
  )
}

/** One run step by step (D9), with Undo run; inline on the routine's page (routines-editor-page D6). */
export function RunDetailBody({ rule, ruleId: givenRule, runId, initial }: RunDetailProps) {
  const online = useOnline()
  const me = useMe() ?? ''
  const names = useRoutineNames()
  const [run, setRun] = useState<RoutineRun | null>(initial?.steps ? initial : null)
  const [failed, setFailed] = useState(false)
  const [answer, setAnswer] = useState('')
  const [reviewing, setReviewing] = useState(false)
  const ruleId = rule?.id ?? givenRule ?? initial?.rule_id ?? ''
  useEffect(() => {
    if (!online || !ruleId) return
    api.routineRun(ruleId, runId).then(setRun, () => setFailed(true))
  }, [online, ruleId, runId])
  const steps: RoutineStep[] = []
  if (rule) walkSteps(draftOf(rule).steps, (s) => steps.push(s))
  const draft = rule ? draftOf(rule) : null
  const ctx = draft ? { draft, types: draftTypes(draft), outputs: outputNames(draft.steps, valueNamer(names)), names } : null
  const records = new Map((run?.steps ?? []).map((r) => [r.step_id, r]))
  const undo = () => {
    if (!run) return
    api.undoRoutineRun(run.rule_id, run.run_id).then((u) => {
      setAnswer(u.kept
        ? t('{restored} restored, {kept} kept because they changed after the run', { restored: u.restored, kept: u.kept })
        : t('{n, plural, one {# restored} other {# restored}}', { n: u.restored }))
      setRun({ ...run, undone_at: Date.now() })
    }, (e: unknown) => setAnswer(e instanceof Error ? e.message : t('The run could not be undone.')))
  }
  const o = run ? outcomeOf(run) : null
  return (
    <div data-run-detail={runId}>
      {!run && (failed || !online) && <Notice tone="info">{t('The run is on the server: connect to see it.')}</Notice>}
      {!run && online && !failed && <Skeleton shape="line" count={3} label={t('Loading the run')} />}
      {run && o && (
        <div className="space-y-3">
          <p className="flex flex-wrap items-center gap-2 text-body">
            <span>{formatInstant(run.at, 'datetime')}</span>
            <Badge hue={o.hue}>{o.text}</Badge>
            {run.test && <Badge hue="blue">{t('Test')}</Badge>}
            <span className="text-meta text-muted">{sourceText(run, rule, me, names)} · {t('{n, plural, one {# write} other {# writes}}', { n: run.writes })} · {duration(run.duration_ms)}</span>
            {!!run.tokens && <span className="text-meta text-muted" data-run-tokens>{t('{n, plural, one {# AI token} other {# AI tokens}}', { n: run.tokens })}</span>}
            {run.ai_auto && <Badge hue="blue">{t('Applied without asking')}</Badge>}
          </p>
          {run.proposal && (
            <div className="flex flex-wrap items-center gap-2" data-run-proposal={run.proposal.state}>
              <span className="text-meta text-muted">{PROPOSAL[run.proposal.state] ?? run.proposal.state} · {t('{n, plural, one {# item} other {# items}}', { n: run.proposal.items })}</span>
              {run.proposal.state === 'waiting' && <Button variant="primary" disabled={!online} onClick={() => setReviewing(true)}>{t('Review')}</Button>}
            </div>
          )}
          {reviewing && run.proposal && <ProposalReview proposalId={run.proposal.id} ruleName={rule?.name || t('A routine')} onClose={() => setReviewing(false)}
            onDone={() => api.routineRun(run.rule_id, run.run_id).then(setRun, () => undefined)} />}
          {run.reason && <p className="text-meta text-muted">{reasonText(run.reason) !== t('not available here') ? reasonText(run.reason) : run.reason}</p>}
          <ol className="space-y-2" aria-label={t('Steps')}>
            {steps.map((s, i) => {
              const r: RoutineStepRecord | undefined = records.get(s.id)
              return (
                <li key={s.id} className="surface-card space-y-1 p-3" data-run-step={r?.status ?? 'not_run'}>
                  <p className="text-body text-default">{i + 1}. {ctx ? sentenceText(s, ctx) : stepName(s.kind)}</p>
                  <p className="flex flex-wrap items-center gap-2 text-meta text-muted">
                    <Badge hue={!r ? 'slate' : r.status === 'ok' || r.status === 'ended' ? 'green' : r.status === 'skipped' || r.status === 'truncated' ? 'orange' : 'red'}>
                      {r ? (r.status === 'unavailable' ? t('Not available: {reason}', { reason: reasonText(r.error) }) : STATUS[r.status] ?? r.status) : t('Not run')}
                    </Badge>
                    {r && <span>{duration(r.duration_ms)}</span>}
                    {r && r.output !== 'none' && r.output && <span>{t('{n, plural, one {# item} other {# items}}', { n: r.items })}</span>}
                  </p>
                  {r?.error && r.status !== 'unavailable' && <p className="text-meta text-danger">{reasonText(r.error) !== t('not available here') ? reasonText(r.error) : r.error}</p>}
                  {r?.error && settingPath(r.warning?.setting) && <a className="text-meta text-accent underline" href={settingPath(r.warning?.setting)}>{t('Open the setting')}</a>}
                  {r && <Touched ids={r.ids} output={r.output} names={names} />}
                </li>
              )
            })}
          </ol>
          {!run.test && run.writes > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="secondary" disabled={!online || !!run.undone_at} onClick={undo}>{t('Undo run')}</Button>
              {!online && <span className="text-meta text-muted">{t('Needs a connection')}</span>}
              {answer && <span className="text-meta text-muted" role="status">{answer}</span>}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
