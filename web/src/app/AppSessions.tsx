// The signed-in OpenTodo apps, listed with the sessions in Settings → Account
// (OpenSpec change native-app-foundation, account-access "App sessions
// alongside other sessions"). Signing one out refuses the app's next request.
import { useEffect, useState } from 'react'
import { Icon, ListRow, Menu, MenuItem } from '../ui'
import { listAppSessions, revokeAppSession, type AppSession } from '../lib/appSessions'
import { relativeTime } from '../lib/dates'
import { t } from '../lib/i18n'

/** "OpenTodo app · iPhone", or "OpenTodo app" when the app sent no device name. */
export function appSessionLabel(device: string): string {
  return device ? t('OpenTodo app · {device}', { device }) : t('OpenTodo app')
}

/** The rows of the signed-in apps; nothing while there are none. */
export function AppSessions({ load = listAppSessions, revoke = revokeAppSession, now = Date.now() }: {
  load?: () => Promise<AppSession[]>
  revoke?: (id: string) => Promise<void>
  now?: number
}) {
  const [apps, setApps] = useState<AppSession[]>([])
  useEffect(() => {
    let live = true
    load().then((list) => { if (live) setApps(list) }, () => undefined)
    return () => { live = false }
  }, [load])
  const signOut = async (id: string) => {
    try {
      await revoke(id)
      setApps((list) => list.filter((a) => a.id !== id))
    } catch {
      // The row stays: the app is still signed in.
    }
  }
  if (apps.length === 0) return null
  return (
    <div className="-mx-3" data-testid="app-sessions">
      {apps.map((a) => {
        const label = appSessionLabel(a.device)
        return (
          <ListRow key={a.id} leading={<Icon name="key-round" size="md" />} label={label}
            meta={t('Used {relativeTime}', { relativeTime: relativeTime(a.lastUsedAt, now) })}
            menu={(
              <Menu label={t('Actions for {browserName}', { browserName: label })} trigger={<Icon name="ellipsis" />} kind="menu"
                triggerClassName="ui-btn ui-btn--ghost ui-btn--sm ui-btn--icon">
                <MenuItem label={t('Sign out')} icon="log-out" danger onSelect={() => void signOut(a.id)} />
              </Menu>
            )} />
        )
      })}
    </div>
  )
}
