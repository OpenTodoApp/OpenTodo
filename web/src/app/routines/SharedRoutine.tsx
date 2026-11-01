// Routines of a shared project in the editor and on the Routines page (OpenSpec
// change routines-shared, D12): the project, the person the routine runs as, why
// the server paused it, read-only for a viewer, and the notice before an edit
// that pauses it. The server's state (run-as person, pause) comes from
// GET /api/v1/me/rules while online.
import { useEffect, useState } from 'react'
import { api } from '../../lib/api'
import { msg, t } from '../../lib/i18n'
import { useMembershipMap, useProjects } from '../../lib/localData'
import { useOnline } from '../../lib/online'
import { canEditRoutine, sharedProjectOf } from '../../lib/rules/shared'
import type { RoutineDraft } from '../../lib/rules/draft'
import type { RulesStatus } from '../../lib/types'
import { Badge, Notice } from '../../ui'

type RuleStatus = RulesStatus['rules'][string]

/** A shared routine as the editor shows it; null for a personal routine. */
export interface SharedRoutine {
  projectId: string
  projectName: string
  /** The user may change it (editor or above). */
  canEdit: boolean
  /** The server's state while online (who it runs as, its pause). */
  status: RuleStatus | null
}

/** The shared routine a rule (or a new routine of `projectId`) is, read from local data and the server. */
export function useSharedRoutine(ruleId: string | undefined, projectId: string | null | undefined): SharedRoutine | null {
  const memberships = useMembershipMap()
  const projects = useProjects()
  const online = useOnline()
  const pid = sharedProjectOf({ project_id: projectId ?? null }, memberships)
  const [status, setStatus] = useState<RuleStatus | null>(null)
  useEffect(() => {
    if (!pid || !ruleId || !online) { setStatus(null); return }
    let live = true
    api.myRules().then((s) => { if (live) setStatus(s.rules[ruleId] ?? {}) }, () => undefined)
    return () => { live = false }
  }, [pid, ruleId, online])
  if (!pid) return null
  return {
    projectId: pid,
    projectName: projects.find((p) => p.id === pid)?.name ?? t('a shared project'),
    canEdit: canEditRoutine({ project_id: pid }, memberships),
    status,
  }
}

const PAUSED: Record<string, string> = {
  edited_by_other: msg('Paused: edited by {who}. Turn it on again to run it as you.'),
  run_as_left: msg('Paused: {who} no longer edits {project}. Turn it on to run it as you.'),
  run_as_viewer: msg('Paused: {who} can no longer edit {project}. Turn it on to run it as you.'),
  runaway: msg('Paused: it ran too often'),
}

/** Why the server paused a routine, as one line ("Paused: edited by Bob…"). */
export function pausedText(status: RuleStatus | null | undefined, project: string): string {
  const reason = status?.paused_reason
  if (!reason) return ''
  const who = reason === 'edited_by_other' ? status?.paused_by?.name : status?.run_as?.name
  return PAUSED[reason] ? t(PAUSED[reason], { who: who || t('someone'), project }) : t('Paused')
}

/** "Runs as Alice", or "Not turned on yet". */
export function runsAsText(status: RuleStatus | null | undefined): string {
  if (!status) return ''
  return status.run_as ? t('Runs as {name}', { name: status.run_as.name }) : t('Not turned on yet')
}

/** Fields whose change by someone other than the run-as person pauses the routine (D5). */
function definitionChanged(a: RoutineDraft, b: RoutineDraft): boolean {
  return JSON.stringify([a.trigger, a.condition, a.steps, a.aiBudget]) !== JSON.stringify([b.trigger, b.condition, b.steps, b.aiBudget])
}

/** The editor's line for a shared routine: project, run-as person, pause, read-only, and the D5 notice. */
export function SharedRoutineLine({ shared, me, baseline, draft, saved }: { shared: SharedRoutine; me: string; baseline: RoutineDraft; draft: RoutineDraft; saved: boolean }) {
  const runAs = shared.status?.run_as
  const paused = pausedText(shared.status, shared.projectName)
  const pauses = saved && shared.canEdit && !!runAs && runAs.id !== me && !shared.status?.paused_reason && definitionChanged(baseline, draft)
  return (
    <div className="space-y-2" data-shared-routine={shared.projectId}>
      <p className="flex flex-wrap items-center gap-2 text-meta text-muted">
        <Badge hue="blue">{shared.projectName}</Badge>
        {saved && <span data-runs-as>{runsAsText(shared.status)}</span>}
        {!saved && <span>{t('Everyone in {project} sees this routine; it runs as whoever turns it on.', { project: shared.projectName })}</span>}
      </p>
      {paused && <p className="text-meta text-warning" data-shared-paused>{paused}</p>}
      {!shared.canEdit && <Notice tone="info">{t('Only editors of {project} can change this routine.', { project: shared.projectName })}</Notice>}
      {pauses && runAs && (
        <Notice tone="warning"><span data-pause-notice>{t('Saving pauses this routine: it runs as {name}. Turn it on again afterwards to run it as you.', { name: runAs.name })}</span></Notice>
      )}
    </div>
  )
}
