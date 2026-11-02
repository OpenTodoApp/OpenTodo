// The Routines page (OpenSpec change routines-editor; automation-rules "Rules
// page" before): the user's routines in order, each with its switch, its trigger
// and steps as one line, its last run and 7-day count (from the server while
// online), how many steps are not available, Run now and a menu (Edit,
// Duplicate, Run now, Test, History, Move up, Move down, Delete). A Runs tab lists
// every run. A routine opens as its own page (routines-editor-page), and a run of
// a live routine opens there; offline the list renders from local data and the
// run history says it needs a connection.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
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
import { useMembershipMap, useProjects } from '../../lib/localData'
import { canEditRoutine, routineProjects, sharedCatalogue, sharedProjectOf } from '../../lib/rules/shared'
import { Button, EmptyState, Icon, NeutralChip, Notice, PageBody, PageHeader, Switch, Tabs } from '../../ui'
import { act } from '../actionError'
import { showBulkToast } from '../bulk/toastStore'
import { ActionMenu, useConfirm, type ActionGroup } from '../menus/ActionMenu'
import { runRoutineNow } from '../palette/routineCommand'
import { navigate, type Route } from '../router'
import { useRoutineNames, valueNamer, type RoutineNames } from './data'
import { RunDetail, RunsList } from './RunHistory'
import { clearHandover, openRoutineHistory, returnFocus } from './routineNav'
import { StarterGallery, StartersPage } from './Starters'
import { DescribeSheet, useDescribeMode } from './DescribeIt'
import { pausedText, runsAsText } from './SharedRoutine'
import { sentenceText } from './StepCard'
import { useAssistantStatus } from '../../lib/assistantStatus'
import { DisclosureNotice } from '../assistant/DisclosureNotice'

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
  const types = draftTypes(draft)
  const ctx = { draft, types, outputs: outputNames(draft.steps, valueNamer(names), types), names }
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
  const memberships = useMembershipMap()
  const known = isKnownRule(rule)
  const info = status?.rules[rule.id]
  const name = rule.name || t('Untitled routine')
  // A routine of a shared project (routines-shared D12): its chip, who it runs as, read-only for a viewer.
  const project = sharedProjectOf(rule, memberships)
  const projectName = project ? names.projectName(project) || t('a shared project') : ''
  const editable = canEditRoutine(rule, memberships)
  const missing = unavailableCount(rule, project ? sharedCatalogue(catalogue) : catalogue)
  const test = () => {
    api.testRoutine(rule.id, { run_id: uuid() }).then(
      (r) => showBulkToast(t('{name}: test would write {n}', { name, n: r.writes }), null, { action: { label: t('View run'), run: () => navigate({ view: 'rules', id: rule.id, run: r.run.run_id }) } }),
      (e: unknown) => showBulkToast(e instanceof Error ? e.message : t('The routine could not run.'), null))
  }
  const groups: ActionGroup[] = [
    { items: [
      { kind: 'action', id: 'edit', label: t('Edit…'), icon: 'pencil', disabled: !known, reason: t('Made with a newer version'), onSelect: onEdit },
      { kind: 'action', id: 'duplicate', label: t('Duplicate'), icon: 'copy', disabled: !known, reason: t('Made with a newer version'), onSelect: () => act(duplicateRule(rule.id)) },
      { kind: 'action', id: 'run', label: t('Run now'), icon: 'zap', disabled: !online || !editable, reason: editable ? t('Needs a connection') : t('Only editors can run it'), onSelect: () => void runRoutineNow(rule, undefined) },
      { kind: 'action', id: 'test', label: t('Test'), icon: 'list-checks', disabled: !online || !editable, reason: editable ? t('Needs a connection') : t('Only editors can run it'), onSelect: test },
      { kind: 'action', id: 'history', label: t('History'), icon: 'history', onSelect: onHistory },
      { kind: 'action', id: 'up', label: t('Move up'), icon: 'arrow-up', disabled: index === 0 || !editable, onSelect: () => act(reorderRule(rule.id, -1)) },
      { kind: 'action', id: 'down', label: t('Move down'), icon: 'arrow-down', disabled: index === total - 1 || !editable, onSelect: () => act(reorderRule(rule.id, 1)) },
    ] },
    { items: editable ? [
      { kind: 'confirm', id: 'delete', label: t('Delete routine'), icon: 'trash-2', tone: 'danger', confirm: {
        title: t('Delete “{name}”?', { name }),
        body: t('The routine stops running. Changes it already made stay, and each task’s history keeps them.'),
        confirmLabel: t('Delete routine'), tone: 'danger', onConfirm: () => deleteRule(rule.id),
      } },
    ] : [] },
  ]
  const meta = [
    info?.last_run ? t('last ran {when}', { when: formatInstant(info.last_run, 'datetime') }) : status ? t('not run yet') : t('Needs a connection'),
    info?.runs_7d ? t('{n, plural, one {# run this week} other {# runs this week}}', { n: info.runs_7d }) : '',
  ].filter(Boolean).join(' · ')
  return (
    <li className="flex min-h-11 items-start gap-3 rounded-control px-2 py-2 hover:bg-sunken dark:hover:bg-raised" data-rule-row={rule.id}>
      <Switch label={t('Routine {name} on', { name })} hideLabel checked={rule.enabled} disabled={!editable} onChange={(on) => act(setRuleEnabled(rule.id, on))} />
      <button type="button" className="min-w-0 flex-1 text-left" onClick={known ? onEdit : undefined} disabled={!known} data-edit-routine>
        <span className="block truncate text-body text-default">{name}</span>
        <span className="block text-meta text-muted" data-rule-line>{known ? routineLine(rule, names) : t('Made with a newer version')}</span>
        {project && (
          <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-meta text-muted" data-rule-project={project}>
            <NeutralChip icon="users">{projectName}</NeutralChip>
            {info && <span data-runs-as>{runsAsText(info)}</span>}
          </span>
        )}
        {info?.paused_reason && <span className="block text-meta text-warning">{project ? pausedText(info, projectName) : PAUSE_REASON[info.paused_reason] ?? t('Paused')}</span>}
        {missing > 0 && <span className="block text-meta text-warning" data-unavailable-count>{t('{n, plural, one {# step not available} other {# steps not available}}', { n: missing })}</span>}
        {meta && <span className="block text-meta text-faint">{meta}</span>}
      </button>
      <Button size="sm" variant="ghost" icon="zap" disabled={!online || !editable} onClick={() => void runRoutineNow(rule, undefined)} aria-label={t('Run now: {name}', { name })}>{t('Run now')}</Button>
      <ActionMenu label={t('Menu for routine {name}', { name })} groups={groups} />
      {confirm.element}
    </li>
  )
}

/** The Routines page, or the starters (/routines/starters[/<slug>], routines-starters D5). */
export function RoutinesView({ route }: { route?: Extract<Route, { view: 'rules' }> }) {
  if (route?.starters) return <StartersPage slug={route.starter} />
  return <RoutinesList route={route} />
}

const openStarters = () => navigate({ view: 'rules', starters: true })

/** New routine: straight to the editor, or first Where (Just me or a shared project) in an anchored menu (routines-shared D12). */
function NewRoutineButton({ names, variant = 'primary', project }: { names: RoutineNames; variant?: 'primary' | 'secondary'; project?: string }) {
  const memberships = useMembershipMap()
  const projects = useProjects()
  const shared = routineProjects(memberships).filter((id) => projects.some((p) => p.id === id && !p.deleted_at))
  const open = (pid?: string) => navigate(pid ? { view: 'rules', create: true, project: pid } : { view: 'rules', create: true })
  if (project || shared.length === 0) {
    return <Button variant={variant} size="sm" icon="plus" onClick={() => open(project)} data-new-routine>{t('New routine')}</Button>
  }
  const groups: ActionGroup[] = [
    { items: [{ kind: 'action', id: 'me', label: t('Just me'), icon: 'user-round', onSelect: () => open() }] },
    { label: t('A shared project'), items: shared.map((id) => ({ kind: 'action', id: `p:${id}`, label: names.projectName(id) || t('a shared project'), icon: 'users', onSelect: () => open(id) })) },
  ]
  return (
    <ActionMenu label={t('New routine')} groups={groups} align="end"
      trigger={<><Icon name="plus" size="sm" />{t('New routine')}</>}
      triggerClassName={`ui-btn ui-btn--${variant} ui-btn--sm`} triggerProps={{ 'data-new-routine': true }} />
  )
}

function RoutinesList({ route }: { route?: Extract<Route, { view: 'rules' }> }) {
  const allRules = useRules()
  const names = useRoutineNames()
  // ?project=<id>: the routines of one project (the project menu's Routines, routines-shared D12).
  const project = route?.project && names.projects.some((p) => p.id === route.project) ? route.project : undefined
  const rules = useMemo(() => (project ? allRules.filter((r) => r.project_id === project) : allRules), [allRules, project])
  const catalogue = useCatalogue()
  const [status, setStatus] = useRulesStatus(rules)
  // The notice that the assistant's list is now complete, for a consent that covers AI steps (assistant-disclosure-notice D4).
  const assistant = useAssistantStatus()
  const online = useOnline()
  // A run of a deleted routine: its detail in a dialog (a live routine's run opens on its page).
  const [run, setRun] = useState<{ ruleId: string; runId: string } | null>(null)
  const tab = route?.tab === 'runs' ? 'runs' : 'routines'
  const byId = useMemo(() => new Map(rules.map((r) => [r.id, r])), [rules])
  const edit = (id: string) => navigate({ view: 'rules', id })
  const openRun = (ruleId: string, runId: string) => (byId.has(ruleId) ? navigate({ view: 'rules', id: ruleId, run: runId }) : setRun({ ruleId, runId }))
  // Back from a routine's page: focus returns to its row (routines-editor-page D5).
  const returnTo = useRef(returnFocus())
  useEffect(() => clearHandover(), [])
  useLayoutEffect(() => {
    const id = returnTo.current
    const row = id && tab === 'routines' ? document.querySelector<HTMLElement>(`[data-rule-row="${CSS.escape(id)}"] [data-edit-routine]`) : null
    if (!row) return
    returnTo.current = null
    row.focus()
  }, [tab, rules])
  // Describe it (routines-describe-it D1): only when the person can make an assistant turn; /routines/describe opens it.
  const describeMode = useDescribeMode()
  const [describing, setDescribing] = useState(!!route?.describe)
  const closeDescribe = () => {
    setDescribing(false)
    if (route?.describe) navigate({ view: 'rules' }, { replace: true })
  }
  const describeButton = describeMode && (
    <Button variant="secondary" size="sm" icon="message-circle" onClick={() => setDescribing(true)} data-describe-routine>{t('Describe it')}</Button>
  )
  const pause = (paused: boolean) => act(api.pauseRules(paused).then((s) => status && setStatus({ ...status, ...s })))
  const setTab = (id: string) => navigate(id === 'runs' ? { view: 'rules', tab: 'runs' } : { view: 'rules' }, { replace: true })
  const overflowGroups: ActionGroup[] = status?.enabled && !status.paused
    ? [{ items: [{ kind: 'action', id: 'pause', label: t('Pause all routines'), icon: 'clock', onSelect: () => pause(true) }] }] : []
  return (
    <PageBody width="list" data-rules-page>
      <PageHeader title={t('Routines')} meta={rules.length} help="routines"
        actions={<>
          {describeButton}
          <Button variant="secondary" size="sm" icon="sparkles" onClick={openStarters} data-open-starters>{t('Start from a starter')}</Button>
          <NewRoutineButton names={names} project={project} />
          {overflowGroups.length > 0 && <ActionMenu label={t('More')} groups={overflowGroups} />}
        </>} />
      {assistant?.routines_consented && assistant.disclosure_notice && <div className="mb-3"><DisclosureNotice status={assistant} connected={online} /></div>}
      {status && !status.enabled && <div className="mb-3"><Notice tone="warning">{t('Automations are off on this server.')}</Notice></div>}
      {status?.enabled && status.paused && (
        <div className="mb-3"><Notice tone="info" action={<Button size="sm" variant="ghost" onClick={() => pause(false)}>{t('Resume')}</Button>}>{t('Your routines are paused.')}</Notice></div>
      )}
      {project && (
        <div className="mb-3 flex items-center gap-2" data-routines-filter={project}>
          <NeutralChip icon="users">{t('Routines of {project}', { project: names.projectName(project) })}</NeutralChip>
          <Button size="sm" variant="ghost" icon="x" onClick={() => navigate({ view: 'rules' }, { replace: true })}>{t('Show all routines')}</Button>
        </div>
      )}
      <Tabs label={t('Routines')} value={tab} onChange={setTab} tabs={[{ id: 'routines', label: t('Routines'), count: rules.length }, { id: 'runs', label: t('Runs') }]}>
        {tab === 'routines' ? (
          <>
            {!status && <p className="mb-3 text-meta text-muted">{t('Offline: routines are saved here and run on the server after the next sync.')}</p>}
            {rules.length > 0 && (
              <ul className="space-y-0.5" aria-label={t('Routines')}>
                {rules.map((r, i) => <RoutineRow key={r.id} rule={r} index={i} total={rules.length} status={status} catalogue={catalogue} names={names}
                  onEdit={() => edit(r.id)} onHistory={() => openRoutineHistory(r.id)} />)}
              </ul>
            )}
            {rules.length === 0 && (
              <>
                <EmptyState icon="zap" title={t('No routines yet')}
                  body={t('A routine does things for you in a row: every Friday, turn the lines of a note into tasks; when a task gets a label, move it.')}
                  control={<div className="flex flex-wrap justify-center gap-2">
                    <NewRoutineButton names={names} project={project} />
                    <Button variant="secondary" size="sm" icon="sparkles" onClick={openStarters}>{t('Start from a starter')}</Button>
                    {describeButton}
                  </div>} />
                <StarterGallery />
              </>
            )}
          </>
        ) : (
          <RunsList rules={rules} onOpen={(r) => openRun(r.rule_id, r.run_id)} />
        )}
      </Tabs>
      {describing && describeMode && <DescribeSheet mode={describeMode} catalogue={catalogue} onClose={closeDescribe} />}
      {run && <RunDetail rule={byId.get(run.ruleId)} ruleId={run.ruleId} runId={run.runId} onClose={() => setRun(null)} />}
    </PageBody>
  )
}
