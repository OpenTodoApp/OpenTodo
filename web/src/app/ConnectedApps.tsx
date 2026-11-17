// The AI apps connected to the account over OAuth (Gemini, ChatGPT, Claude),
// listed with the sessions in Settings → Account next to the signed-in
// OpenTodo apps (OpenSpec change connected-apps-list). Disconnect ends the
// app's access: its refresh token and access token stop working.
import { useEffect, useState } from 'react'
import { ConfirmDialog, Icon, ListRow, Menu, MenuItem } from '../ui'
import { disconnectApp, listConnectedApps, type ConnectedApp } from '../lib/connectedApps'
import { t } from '../lib/i18n'
import { useWorkspaceChoices } from './WorkspaceChoice'
import { tokenMeta, workspaceNames } from './TokensSection'

/** "Created 3 Oct · Last used today · Read only · Only Work". */
function appMeta(a: ConnectedApp, all: { id: string; name: string }[], now: number): string {
  const parts = [tokenMeta({ id: a.id, name: a.clientName, createdAt: a.createdAt, lastUsedAt: a.lastUsedAt }, now)]
  parts.push(a.scope === 'agent' ? t('Can make changes') : t('Read only'))
  if (a.workspaces.length > 0) parts.push(workspaceNames(a.workspaces, all))
  return parts.join(' · ')
}

/** The rows of the connected apps; nothing while there are none. */
export function ConnectedApps({ load = listConnectedApps, disconnect = disconnectApp, now = Date.now() }: {
  load?: () => Promise<ConnectedApp[]>
  disconnect?: (id: string) => Promise<void>
  now?: number
}) {
  const [apps, setApps] = useState<ConnectedApp[]>([])
  const [confirming, setConfirming] = useState<ConnectedApp | null>(null)
  const workspaces = useWorkspaceChoices()
  useEffect(() => {
    let live = true
    load().then((list) => { if (live) setApps(list) }, () => undefined)
    return () => { live = false }
  }, [load])
  if (apps.length === 0) return null
  return (
    <div className="-mx-3" data-testid="connected-apps">
      {apps.map((a) => (
        <ListRow key={a.id} leading={<Icon name="bot" size="md" />} label={a.clientName}
          meta={appMeta(a, workspaces, now)}
          menu={(
            <Menu label={t('Actions for {name}', { name: a.clientName })} trigger={<Icon name="ellipsis" />} kind="menu"
              triggerClassName="ui-btn ui-btn--ghost ui-btn--sm ui-btn--icon">
              <MenuItem label={t('Disconnect')} icon="log-out" danger onSelect={() => setConfirming(a)} />
            </Menu>
          )} />
      ))}
      {confirming && (
        <ConfirmDialog title={t('Disconnect {name}?', { name: confirming.clientName })} confirmLabel={t('Disconnect')}
          consequence={t('It can no longer reach your tasks. Connect it again to use it.')}
          onConfirm={async () => {
            await disconnect(confirming.id)
            setApps((list) => list.filter((x) => x.id !== confirming.id))
          }}
          onCancel={() => setConfirming(null)} />
      )}
    </div>
  )
}
