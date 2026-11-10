// The confirmation of an OpenTodo app sign-in (OpenSpec change
// native-app-foundation, design D5). /app/sign-in sends the signed-in browser
// of the app's sign-in sheet to the consent host (`?oauth_consent=` with the
// app's client id), which shows this; only Confirm asks the server for a code,
// which the app receives at its own address.
import { useState } from 'react'
import { Button, Dialog } from '../ui'
import { answerAppSignIn, appDevice, APP_REDIRECT } from '../lib/appSessions'
import { t } from '../lib/i18n'

export interface AppSignInViewProps {
  device: string
  busy: boolean
  onConfirm: () => void
  onCancel: () => void
}

/** Pure rendering of the confirmation. */
export function AppSignInView({ device, busy, onConfirm, onCancel }: AppSignInViewProps) {
  const title = device ? t('Sign in to the OpenTodo app on {device}?', { device }) : t('Sign in to the OpenTodo app on this device?')
  return (
    <Dialog title={title} onClose={onCancel} dismissable={false} size="sm" testId="app-sign-in">
      <p className="text-body text-muted">{t('Only confirm if you started signing in from the app just now.')}</p>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel} disabled={busy}>{t('Cancel')}</Button>
        <Button variant="primary" onClick={onConfirm} disabled={busy}>{t('Sign in')}</Button>
      </div>
    </Dialog>
  )
}

/** Sends the person's answer and hands the sheet back to the app. */
export function AppSignIn({ query, onDone }: { query: string; onDone: () => void }) {
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const answer = async (allow: boolean) => {
    setBusy(true)
    try {
      const { redirect } = await answerAppSignIn(query, allow)
      if (redirect.startsWith(APP_REDIRECT + '?')) window.location.assign(redirect)
      else onDone()
    } catch {
      setBusy(false)
      setFailed(true)
    }
  }
  if (failed) {
    return (
      <Dialog title={t('This sign-in request can’t be used')} onClose={onDone} size="sm" testId="app-sign-in-failed">
        <p className="text-body text-muted">{t('Start signing in again from the app.')}</p>
        <div className="mt-4 flex justify-end"><Button variant="primary" onClick={onDone}>{t('Close')}</Button></div>
      </Dialog>
    )
  }
  return <AppSignInView device={appDevice(query)} busy={busy} onConfirm={() => void answer(true)} onCancel={() => void answer(false)} />
}
