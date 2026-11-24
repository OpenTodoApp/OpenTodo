// A page of a feature the current workspace has off (OpenSpec change
// workspace-feature-switches, design D4): one sentence and, for the workspace's
// owner and admins while online, Turn on, which switches it back on for everyone
// in the workspace. Nothing of the feature's data is touched either way.
import { EmptyState } from '../ui'
import { featureName, useCurrentWorkspaceRow, type FeatureId } from '../lib/features'
import { t } from '../lib/i18n'
import { useOnline } from '../lib/online'
import { workspaceApi } from '../lib/workspaceApi'
import { act } from './actionError'
import { manages } from './workspaceRoles'

export function FeatureOff({ id }: { id: FeatureId }) {
  const ws = useCurrentWorkspaceRow()
  const online = useOnline()
  const canTurnOn = !!ws && manages(ws.role) && online
  return (
    <div className="px-4 py-6" data-feature-off={id}>
      <EmptyState title={t('{feature} is off in this workspace.', { feature: featureName(id) })}
        action={canTurnOn ? { label: t('Turn on'), onClick: () => act(workspaceApi.update(ws.id, { features: { [id]: true } })) } : undefined} />
    </div>
  )
}
