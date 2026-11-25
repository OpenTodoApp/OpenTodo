// Settings → Workspaces → Features (OpenSpec change workspace-feature-switches,
// design D5): one row per switchable feature with its name and a switch. The owner
// and admins switch them for everyone in the workspace, online only; everyone else
// sees them disabled. A switch writes one key through PATCH, merged on the server.
import { useState } from 'react'
import { SettingRow, Switch } from '../ui'
import { FEATURES, featureName, featureOn, type FeatureId } from '../lib/features'
import { t } from '../lib/i18n'
import type { Workspace } from '../lib/types'
import { workspaceApi } from '../lib/workspaceApi'
import { act } from './actionError'
import { manages } from './workspaceRoles'

export default function WorkspaceFeatures({ ws, online }: { ws: Workspace; online: boolean }) {
  // The switch follows the press at once; the server's answer replaces it.
  const [pending, setPending] = useState<Partial<Record<FeatureId, boolean>>>({})
  const canManage = manages(ws.role)
  const flip = (id: FeatureId, on: boolean) => {
    setPending((p) => ({ ...p, [id]: on }))
    act(workspaceApi.update(ws.id, { features: { [id]: on } })
      .finally(() => setPending((p) => { const next = { ...p }; delete next[id]; return next })))
  }
  return (
    // No heading of its own: the tab names it (workspace-feature-switches D5).
    <section id="workspace-features" aria-label={t('Features')} data-testid="workspace-features">
      {!canManage && <p className="pb-3 text-meta text-muted" data-features-read-only>{t('Only the owner and admins can change these.')}</p>}
      <div className="divide-y divide-soft border-y border-soft">
        {FEATURES.map((id) => (
          <SettingRow key={id} label={featureName(id)} htmlFor={`feature-${id}`} control={(
            <span data-feature-switch={id}>
              <Switch id={`feature-${id}`} label={featureName(id)} hideLabel checked={pending[id] ?? featureOn(ws, id)}
                disabled={!canManage || !online} onChange={(on) => flip(id, on)} />
            </span>
          )} />
        ))}
      </div>
    </section>
  )
}
