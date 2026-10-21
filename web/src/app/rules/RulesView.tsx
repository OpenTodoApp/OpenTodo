// The Rules page (OpenSpec change automation-rules, "Rules page"): the user's
// automation rules in order, each with its switch, its one-line summary, its last
// run and its runs in the last 7 days (from the server while online), and a menu with
// Edit, Duplicate, History, Move up, Move down and Delete. A rule made with a newer
// version offers only its switch and deletion. The page says when automations are
// off on the server or paused for the user, and "Pause all" pauses them.
import { useEffect, useState } from 'react'
import { api } from '../../lib/api'
import { formatInstant } from '../../lib/dates'
import { t, msg, translatedMap } from '../../lib/i18n'
import { useLabels, useLiveSections, useProjects } from '../../lib/localData'
import { useOnline } from '../../lib/online'
import { deleteRule, duplicateRule, isKnownRule, reorderRule, setRuleEnabled, useRules } from '../../lib/rules/store'
import { summarizeRule } from '../../lib/rules/summary'
import { useMe } from '../../lib/timeEntries'
import type { Rule, RulesStatus } from '../../lib/types'
import { Button, EmptyState, Notice, PageBody, PageHeader, Switch } from '../../ui'
import { act } from '../actionError'
import { ActionMenu, useConfirm, type ActionGroup } from '../menus/ActionMenu'
import { RuleDialog, type RuleDraft } from './RuleDialog'
import { RuleHistory } from './RuleHistory'

const PAUSE_REASON = translatedMap<string>({ runaway: msg('Paused: it ran too often') })

/** The server's state for the Rules page, refreshed when the rules change; null offline. */
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

function RuleRow({ rule, index, total, status, onEdit, onHistory }: {
  rule: Rule; index: number; total: number; status: RulesStatus | null; onEdit: () => void; onHistory: () => void
}) {
  const labels = useLabels()
  const projects = useProjects()
  const sections = useLiveSections()
  const confirm = useConfirm()
  const known = isKnownRule(rule)
  const info = status?.rules[rule.id]
  const name = rule.name || t('Untitled rule')
  const groups: ActionGroup[] = [
    { items: [
      { kind: 'action', id: 'edit', label: t('Edit…'), icon: 'pencil', disabled: !known, reason: t('Made with a newer version'), onSelect: onEdit },
      { kind: 'action', id: 'duplicate', label: t('Duplicate'), icon: 'copy', disabled: !known, reason: t('Made with a newer version'), onSelect: () => act(duplicateRule(rule.id)) },
      { kind: 'action', id: 'history', label: t('History'), icon: 'history', onSelect: onHistory },
      { kind: 'action', id: 'up', label: t('Move up'), icon: 'arrow-up', disabled: index === 0, onSelect: () => act(reorderRule(rule.id, -1)) },
      { kind: 'action', id: 'down', label: t('Move down'), icon: 'arrow-down', disabled: index === total - 1, onSelect: () => act(reorderRule(rule.id, 1)) },
    ] },
    { items: [
      { kind: 'confirm', id: 'delete', label: t('Delete rule'), icon: 'trash-2', tone: 'danger', confirm: {
        title: t('Delete “{name}”?', { name }),
        body: t('The rule stops running. Changes it already made stay, and each task’s history keeps them.'),
        confirmLabel: t('Delete rule'), tone: 'danger', onConfirm: () => deleteRule(rule.id),
      } },
    ] },
  ]
  const meta = [
    info?.last_run ? t('Last run {when}', { when: formatInstant(info.last_run, 'datetime') }) : status ? t('Not run yet') : '',
    info?.runs_7d ? t('{n, plural, one {# run in 7 days} other {# runs in 7 days}}', { n: info.runs_7d }) : '',
  ].filter(Boolean).join(' · ')
  return (
    <li className="flex min-h-11 items-start gap-3 rounded-control px-2 py-2 hover:bg-sunken dark:hover:bg-raised" data-rule-row={rule.id}>
      <Switch label={t('Rule {name} on', { name })} hideLabel checked={rule.enabled} onChange={(on) => act(setRuleEnabled(rule.id, on))} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-body text-default">{name}</span>
        <span className="block text-meta text-muted" data-rule-line>
          {known ? summarizeRule(rule, { labels, projects, sections }) : t('Made with a newer version')}
        </span>
        {info?.paused_reason && <span className="block text-meta text-warning">{PAUSE_REASON[info.paused_reason] ?? t('Paused')}</span>}
        {meta && <span className="block text-meta text-faint">{meta}</span>}
      </span>
      <ActionMenu label={t('Menu for rule {name}', { name })} groups={groups} />
      {confirm.element}
    </li>
  )
}

export function RulesView({ create }: { create?: boolean }) {
  const rules = useRules()
  const me = useMe() ?? ''
  const [status, setStatus] = useRulesStatus(rules)
  const [editing, setEditing] = useState<{ rule?: Rule; draft?: RuleDraft } | null>(create ? {} : null)
  const [history, setHistory] = useState<Rule | null>(null)
  const pause = (paused: boolean) => act(api.pauseRules(paused).then((s) => status && setStatus({ ...status, ...s })))
  return (
    <PageBody width="list" data-rules-page>
      <PageHeader title={t('Rules')} meta={rules.length} help="rules"
        actions={<Button variant="primary" size="sm" icon="plus" onClick={() => setEditing({})}>{t('New rule')}</Button>} />
      {status && !status.enabled && <div className="mb-3"><Notice tone="warning">{t('Automations are off on this server.')}</Notice></div>}
      {status?.enabled && status.paused && (
        <div className="mb-3"><Notice tone="info" action={<Button size="sm" variant="ghost" onClick={() => pause(false)}>{t('Resume')}</Button>}>{t('Your rules are paused.')}</Notice></div>
      )}
      {!status && <p className="mb-3 text-meta text-muted">{t('Offline: rules are saved here and run on the server after the next sync.')}</p>}
      {rules.length > 0 && (
        <>
          <ul className="space-y-0.5" aria-label={t('Rules')}>
            {rules.map((r, i) => <RuleRow key={r.id} rule={r} index={i} total={rules.length} status={status}
              onEdit={() => setEditing({ rule: r })} onHistory={() => setHistory(r)} />)}
          </ul>
          {status?.enabled && !status.paused && (
            <div className="mt-4"><Button size="sm" variant="ghost" onClick={() => pause(true)}>{t('Pause all rules')}</Button></div>
          )}
        </>
      )}
      {rules.length === 0 && (
        <EmptyState icon="zap" title={t('No rules yet')}
          body={t('A rule changes tasks for you when something happens: a label is added, a task becomes overdue, or every Sunday evening.')}
          control={<Button variant="primary" size="sm" icon="plus" onClick={() => setEditing({})}>{t('New rule')}</Button>} />
      )}
      {editing && <RuleDialog rule={editing.rule} draft={editing.draft} me={me} onClose={() => setEditing(null)} />}
      {history && <RuleHistory rule={history} onClose={() => setHistory(null)} />}
    </PageBody>
  )
}
