import { useEffect, useState } from 'react'
import { ConfirmDialog, Switch } from '../ui'
import { ApiError } from '../lib/api'
import { getProjectAgentAccess, setProjectAgentAccess, useAgentExclusions, useProjectName } from '../lib/agentAccess'
import { t } from '../lib/i18n'

/**
 * The "AI assistants" row of the share dialog (OpenSpec change
 * agent-planning-fields, design D9): Allowed or Kept away (through a parent),
 * and for the owner or an admin a switch with a confirmation. The state shows
 * from the copy cached on this device; changing it needs a connection.
 */
export function AgentAccessView({ keptAway, through, canChange, offline, busy, error, onChange }: {
  keptAway: boolean
  /** The parent project's name when the state is inherited. */
  through?: string
  canChange: boolean
  offline?: boolean
  busy?: boolean
  error?: string | null
  onChange: (keepAway: boolean) => void
}) {
  const state = keptAway ? (through ? t('Kept away, through {parent}', { parent: through }) : t('Kept away')) : t('Allowed')
  return (
    <section aria-label={t('AI assistants')} className="mb-4 rounded-control border border-default px-3 py-2" data-testid="agent-access">
      <div className="flex items-center justify-between gap-3 text-body">
        <span className="font-medium">{t('AI assistants')}</span>
        <span className="text-meta text-muted user-text">{state}</span>
      </div>
      {canChange && !through && (
        <div className="mt-2">
          <Switch checked={keptAway} disabled={busy || offline} onChange={onChange} label={t('Keep away from AI assistants')}
            description={offline ? t('Changing this needs a connection.') : t('Assistants of every member stop seeing this project, its sub-projects and their tasks.')} />
        </div>
      )}
      {error && <p role="alert" className="mt-2 text-meta text-danger">{error}</p>}
    </section>
  )
}

export function AgentAccessRow({ projectId, projectName, canChange }: {
  projectId: string
  projectName: string
  canChange: boolean
}) {
  const cached = useAgentExclusions()
  const [state, setState] = useState<{ kept_away: boolean; inherited_from: string | null } | null>(null)
  const [asking, setAsking] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const offline = typeof navigator !== 'undefined' && navigator.onLine === false

  useEffect(() => {
    let cancelled = false
    getProjectAgentAccess(projectId).then((s) => { if (!cancelled) setState(s) }, () => undefined)
    return () => { cancelled = true }
  }, [projectId])

  const keptAway = state ? state.kept_away : cached.has(projectId)
  const parent = useProjectName(state?.inherited_from)
  const through = state?.inherited_from ? parent ?? t('a parent project') : undefined

  async function change(keep: boolean) {
    setAsking(null)
    setBusy(true)
    setError(null)
    try {
      setState(await setProjectAgentAccess(projectId, keep))
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('Changing this needs a connection.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <AgentAccessView keptAway={keptAway} through={through} canChange={canChange} offline={offline} busy={busy} error={error} onChange={(keep) => setAsking(keep)} />
      {asking !== null && (
        <ConfirmDialog
          title={asking ? t('Keep “{project}” away from AI assistants?', { project: projectName }) : t('Allow AI assistants in “{project}”?', { project: projectName })}
          confirmLabel={asking ? t('Keep away') : t('Allow')} tone="default"
          consequence={asking
            ? t('No member’s assistant will see this project, its sub-projects or their tasks, and assistants cannot change them. The app, sync and calendar apps are not affected.')
            : t('Every member’s assistants can see and, where allowed, change this project again.')}
          onConfirm={() => change(asking)} onCancel={() => setAsking(null)} />
      )}
    </>
  )
}
