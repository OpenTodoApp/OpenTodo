// The confirmation before a link opens in another app (OpenSpec change
// app-links, design D4): the full link and its scheme, Open, and "Don't ask
// again for <scheme>: on this device". Rendered once by the shell; nothing
// shows until openAppLink asks.
import { useState } from 'react'
import { launchAppLink, pendingAppLink, trustScheme } from '../lib/appLinks'
import { t } from '../lib/i18n'
import { Button, Dialog, Switch } from '../ui'

export function AppLinkConfirm() {
  const ask = pendingAppLink.use()
  return ask ? <Ask key={ask.url} url={ask.url} scheme={ask.scheme} /> : null
}

function Ask({ url, scheme }: { url: string; scheme: string }) {
  const [remember, setRemember] = useState(false)
  const close = () => pendingAppLink.set(null)
  const open = () => {
    if (remember) trustScheme(scheme)
    close()
    launchAppLink(url)
  }
  return (
    <Dialog title={t('Open in another app?')} onClose={close} testId="app-link-confirm">
      <div className="space-y-4">
        <p className="user-text break-all rounded-control bg-sunken px-3 py-2 font-mono text-meta text-default" data-app-link-url>{url}</p>
        <Switch checked={remember} onChange={setRemember} label={t('Don’t ask again for {scheme}: on this device', { scheme })} />
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={close} data-autofocus>{t('Cancel')}</Button>
          <Button variant="primary" onClick={open} data-app-link-open>{t('Open')}</Button>
        </div>
      </div>
    </Dialog>
  )
}
