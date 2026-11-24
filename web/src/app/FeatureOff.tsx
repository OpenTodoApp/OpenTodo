// A page of a feature the current workspace has off (OpenSpec change
// workspace-feature-switches, design D4), loaded only when one is opened: one
// sentence and, for the workspace's owner and admins while online, Turn on, which
// switches it back on for everyone in the workspace. Off hides starting, never
// stopping: a Focus session still running gets Stop here. Nothing of the feature's
// data is touched either way.
import { EmptyState, type EmptyStateAction } from '../ui'
import { featureName, useCurrentWorkspaceRow, type FeatureId } from '../lib/features'
import { stopSession } from '../lib/focus/session'
import { useFocusState } from '../lib/focus/state'
import { t } from '../lib/i18n'
import { useOnline } from '../lib/online'
import { workspaceApi } from '../lib/workspaceApi'
import { act } from './actionError'
import { manages } from './workspaceRoles'

export default function FeatureOff({ id }: { id: FeatureId }) {
  const ws = useCurrentWorkspaceRow()
  const online = useOnline()
  const focus = useFocusState()
  const turnOn: EmptyStateAction | undefined = ws && manages(ws.role) && online
    ? { label: t('Turn on'), onClick: () => act(workspaceApi.update(ws.id, { features: { [id]: true } })) }
    : undefined
  const stop: EmptyStateAction | undefined = id === 'focus' && focus?.phase === 'work'
    ? { label: t('Stop'), onClick: () => act(stopSession()) }
    : undefined
  return (
    <div className="px-4 py-6" data-feature-off={id}>
      <EmptyState title={t('{feature} is off in this workspace.', { feature: featureName(id) })}
        action={stop ?? turnOn} secondary={stop && turnOn} />
    </div>
  )
}
