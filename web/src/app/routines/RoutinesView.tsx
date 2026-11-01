// The Routines page (OpenSpec change routines-editor; automation-rules "Rules
// page" before): the user's routines in order, each with its switch, its trigger
// and steps as one line, its last run and 7-day count (from the server while
// online), how many steps are not available, Run now and a menu (Edit,
// Duplicate, Run now, Test, History, Move up, Move down, Delete). A Runs tab lists
// every run. The page and the editor are one lazy chunk; offline they render
// from local data and the run history says it needs a connection.
import { useEffect, useMemo, useState } from 'react'
import { api } from '../../lib/api'
import { formatInstant } from '../../lib/dates'
import { msg, t, translatedMap } from '../../lib/i18n'
import { uuid } from '../../lib/ids'
import { useOnline } from '../../lib/online'
import { isAvailable, useCatalogue, type Catalogue } from '../../lib/rules/catalogue'
import { draftOf, draftTypes } from '../../lib/rules/draft'
import { outputNames } from '../../lib/rules/sentence'
import { walkSteps } from '../../lib/rules/steps'
import { deleteRule, duplicateRule, isKnownRule, reorderRule, setRuleEnabled, useRules } from '../../lib/rules/store'
import { summarizeRule, triggerText } from '../../lib/rules/summary'
import type { Rule, RulesStatus } from '../../lib/types'
import { Button, EmptyState, Notice, PageBody, PageHeader, Switch, Tabs } from '../../ui'
import { act } from '../actionError'
import { showBulkToast } from '../bulk/toastStore'
import { ActionMenu, useConfirm, type ActionGroup } from '../menus/ActionMenu'
import { runRoutineNow } from '../palette/routineCommand'
import { navigate, type Route } from '../router'
import { useRoutineNames, valueNamer, type RoutineNames } from './data'
import { RoutineEditor } from './RoutineEditor'
import { RunDetail, RunsList } from './RunHistory'
import { sentenceText } from './StepCard'

const PAUSE_REASON = translatedMap<string>({ runaway: msg('Paused: it ran too often') })

/** The server's state for the page, refreshed when the routines change; null offline. */
function useRulesStatus(rules: Rule[]): [RulesStatus | null, (s: RulesStatus) => void] {
  const online = useOnline()
  const [status, setStatus] = useState<RulesStatus | null>(null)
  const key = rules.map((r) => `${r.id}:${r.enabled}`).join()
  useEffect(() => {
    if (!online) { setStatus(null); return }
    api.myRules().then(setStatus, () => setStatus(null))
  }, [online, key])
  return [status, setStatus]
}

/** A routine in one line: its trigger, then its steps ("Every Friday at 17:00 → get the note text of Groceries, …"). */
export function routineLine(rule: Rule, names: RoutineNames): string {
  if (!rule.steps) return summarizeRule(rule, names)
  const draft = draftOf(rule)
  const ctx = { draft, types: draftTypes(draft), outputs: outputNames(draft.steps, valueNamer(names)), names }
  const lower = (s: string) => s.charAt(0).toLocaleLowerCase() + s.slice(1)
  const when = triggerText(rule.trigger, names)
  return `${when.charAt(0).toLocaleUpperCase()}${when.slice(1)} → ${draft.steps.map((s) => lower(sentenceText(s, ctx))).join(', ')}`
}

/** How many of a routine's steps are not available now. */
export function unavailableCount(rule: Rule, cat: Catalogue | null): number {
  let n = 0
  walkSteps(draftOf(rule).steps, (s) => { if (!isAvailable(cat, s.kind)) n++ })
  return n
}

function RoutineRow({ rule, index, total, status, catalogue, names, onEdit, onHistory }: {
  rule: Rule; index: number; total: number; status: RulesStatus | null; catalogue: Catalogue | null; names: RoutineNames; onEdit: () => void; onHistory: () => void
}) {
  const confirm = useConfirm()
  const online = useOnline()
  const known = isKnownRule(rule)
  const info = status?.rules[rule.id]
  const name = rule.name || t('Untitled routine')
  const missing = unavailableCount(rule, catalogue)
  const test = () => {
    api.testRoutine(rule.id, { run_id: uuid() }).then(
      (r) => showBulkToast(t('{name}: test would write {n}', { name, n: r.writes }), null, { action: { label: t('View run'), run: () => navigate({ view: 'rules', id: rule.id, run: r.run.run_id }) } }),
      (e: unknown) => showBulkToast(e instanceof Error ? e.message : t('The routine could not run.'), null))
  }
  const groups: ActionGroup[] = [
    { items: [
      { kind: 'action', id: 'edit', label: t('Edit…'), icon: 'pencil', disabled: !known, reason: t('Made with a newer version'), onSelect: onEdit },
      { kind: 'action', id: 'duplicate', label: t('Duplicate'), icon: 'copy', disabled: !known, reason: t('Made with a newer version'), onSelect: () => act(duplicateRule(rule.id)) },
      { kind: 'action', id: 'run', label: t('Run now'), icon: 'zap', disabled: !online, reason: t('Needs a connection'), onSelect: () => void runRoutineNow(rule, undefined) },
      { kind: 'action', id: 'test', label: t('Test'), icon: 'list-checks', disabled: !online, reason: t('Needs a connection'), onSelect: test },
      { kind: 'action', id: 'history', label: t('History'), icon: 'history', onSelect: onHistory },
      { kind: 'action', id: 'up', label: t('Move up'), icon: 'arrow-up', disabled: index === 0, onSelect: () => act(reorderRule(rule.id, -1)) },
      { kind: 'action', id: 'down', label: t('Move down'), icon: 'arrow-down', disabled: index === total - 1, onSelect: () => act(reorderRule(rule.id, 1)) },
    ] },
    { items: [
      { kind: 'confirm', id: 'delete', label: t('Delete routine'), icon: 'trash-2', tone: 'danger', confirm: {
        title: t('Delete “{name}”?', { name }),
        body: t('The routine stops running. Changes it already made stay, and each task’s history keeps them.'),
        confirmLabel: t('Delete routine'), tone: 'danger', onConfirm: () => deleteRule(rule.id),
      } },
    ] },
  ]
  const meta = [
    info?.last_run ? t('last ran {when}', { when: formatInstant(info.last_run, 'datetime') }) : status ? t('not run yet') : t('Needs a connection'),
    info?.runs_7d ? t('{n, plural, one {# run this week} other {# runs this week}}', { n: info.runs_7d }) : '',
  ].filter(Boolean).join(' · ')
  return (
    <li className="flex min-h-11 items-start gap-3 rounded-control px-2 py-2 hover:bg-sunken dark:hover:bg-raised" data-rule-row={rule.id}>
      <Switch label={t('Routine {name} on', { name })} hideLabel checked={rule.enabled} onChange={(on) => act(setRuleEnabled(rule.id, on))} />
      <button type="button" className="min-w-0 flex-1 text-left" onClick={known ? onEdit : undefined} disabled={!known} data-edit-routine>
        <span className="block truncate text-body text-default">{name}</span>
        <span className="block text-meta text-muted" data-rule-line>{known ? routineLine(rule, names) : t('Made with a newer version')}</span>
        {info?.paused_reason && <span className="block text-meta text-warning">{PAUSE_REASON[info.paused_reason] ?? t('Paused')}</span>}
        {missing > 0 && <span className="block text-meta text-warning" data-unavailable-count>{t('{n, plural, one {# step not available} other {# steps not available}}', { n: missing })}</span>}
        {meta && <span className="block text-meta text-faint">{meta}</span>}
      </button>
      <Button size="sm" variant="ghost" icon="zap" disabled={!online} onClick={() => void runRoutineNow(rule, undefined)} aria-label={t('Run now: {name}', { name })}>{t('Run now')}</Button>
      <ActionMenu label={t('Menu for routine {name}', { name })} groups={groups} />
      {confirm.element}
    </li>
  )
}

export function RoutinesView({ route }: { route?: Extract<Route, { view: 'rules' }> }) {
  const rules = useRules()
  const names = useRoutineNames()
  const catalogue = useCatalogue()
  const [status, setStatus] = useRulesStatus(rules)
  const [editing, setEditing] = useState<{ rule?: Rule } | null>(route?.create ? {} : null)
  const [run, setRun] = useState<{ ruleId: string; runId: string } | null>(null)
  const tab = route?.tab === 'runs' ? 'runs' : 'routines'
  const byId = useMemo(() => new Map(rules.map((r) => [r.id, r])), [rules])
  // /routines/<id> opens that routine's editor; /routines/<id>?run=<run> one run's
  // detail (a notification, a channel message or an email links it).
  useEffect(() => {
    if (route?.id && route.run) setRun({ ruleId: route.id, runId: route.run })
    else if (route?.id && byId.has(route.id)) setEditing({ rule: byId.get(route.id) })
  }, [route?.id, route?.run, byId])
  const pause = (paused: boolean) => act(api.pauseRules(paused).then((s) => status && setStatus({ ...status, ...s })))
  const setTab = (id: string) => navigate(id === 'runs' ? { view: 'rules', tab: 'runs' } : { view: 'rules' }, { replace: true })
  const closeEditor = () => {
    setEditing(null)
    if (route?.id || route?.create) navigate({ view: 'rules' }, { replace: true })
  }
  const overflowGroups: ActionGroup[] = status?.enabled && !status.paused
    ? [{ items: [{ kind: 'action', id: 'pause', label: t('Pause all routines'), icon: 'clock', onSelect: () => pause(true) }] }] : []
  return (
    <PageBody width="list" data-rules-page>
      <PageHeader title={t('Routines')} meta={rules.length} help="routines"
        actions={<>
          <Button variant="primary" size="sm" icon="plus" onClick={() => setEditing({})}>{t('New routine')}</Button>
          {overflowGroups.length > 0 && <ActionMenu label={t('More')} groups={overflowGroups} />}
        </>} />
      {status && !status.enabled && <div className="mb-3"><Notice tone="warning">{t('Automations are off on this server.')}</Notice></div>}
      {status?.enabled && status.paused && (
        <div className="mb-3"><Notice tone="info" action={<Button size="sm" variant="ghost" onClick={() => pause(false)}>{t('Resume')}</Button>}>{t('Your routines are paused.')}</Notice></div>
      )}
      <Tabs label={t('Routines')} value={tab} onChange={setTab} tabs={[{ id: 'routines', label: t('Routines'), count: rules.length }, { id: 'runs', label: t('Runs') }]}>
        {tab === 'routines' ? (
          <>
            {!status && <p className="mb-3 text-meta text-muted">{t('Offline: routines are saved here and run on the server after the next sync.')}</p>}
            {rules.length > 0 && (
              <ul className="space-y-0.5" aria-label={t('Routines')}>
                {rules.map((r, i) => <RoutineRow key={r.id} rule={r} index={i} total={rules.length} status={status} catalogue={catalogue} names={names}
                  onEdit={() => setEditing({ rule: r })} onHistory={() => setEditing({ rule: r })} />)}
              </ul>
            )}
            {rules.length === 0 && (
              <EmptyState icon="zap" title={t('No routines yet')}
                body={t('A routine does things for you in a row: every Friday, turn the lines of a note into tasks; when a task gets a label, move it.')}
                control={<Button variant="primary" size="sm" icon="plus" onClick={() => setEditing({})}>{t('New routine')}</Button>} />
            )}
          </>
        ) : (
          <RunsList rules={rules} onOpen={(r) => setRun({ ruleId: r.rule_id, runId: r.run_id })} />
        )}
      </Tabs>
      {editing && <RoutineEditor rule={editing.rule} onClose={closeEditor} />}
      {run && <RunDetail rule={byId.get(run.ruleId)} ruleId={run.ruleId} runId={run.runId} onClose={() => { setRun(null); if (route?.run) navigate({ view: 'rules' }, { replace: true }) }} />}
    </PageBody>
  )
}
