import { useState } from 'react'
import { disableWithoutKey, restoreKeyRecord, turnOffAfterMissingRecord, unlock } from '../lib/e2ee'
import { startMigration } from '../lib/e2eeSync'
import { FileMigrationPaused, runFileMigration } from '../lib/attachments'
import { requestSync } from '../lib/sync'
import { encryptionMessage, LostKeysConfirm } from './EncryptionPanel'
import { t } from '../lib/i18n'

// The unlock screen (OpenSpec `e2ee`, design D5, task 4.2): shown instead of the
// app while the account encrypts and this device holds no key (a new device
// after sign-in, or after "Lock this device"). Sync is paused until unlocked;
// the passphrase stays in component state and never leaves the device.

export interface UnlockViewProps {
  kind: 'passphrase' | 'recovery'
  busy: boolean
  error: string | null
  lost: boolean
  onKind: (k: 'passphrase' | 'recovery') => void
  onSubmit: (secret: string) => void
  onLost: (open: boolean) => void
  onConfirmLost: () => void
  onLogout: () => void
}

export function UnlockView(p: UnlockViewProps) {
  return (
    <div className="flex min-h-full items-center justify-center p-4">
      <div className="w-full max-w-md space-y-4 rounded-control border border-default p-6">
        <h1 className="text-h3 font-semibold">{t('Unlock your tasks')}</h1>
        <p className="text-body text-muted">
          {p.kind === 'passphrase' ? t('Your account uses end-to-end encryption. Enter your encryption passphrase to decrypt your tasks on this device. Sync stays paused until then. You only need to do this once per device.') : t('Your account uses end-to-end encryption. Enter your encryption recovery key to decrypt your tasks on this device. Sync stays paused until then. You only need to do this once per device.')}
        </p>
        <form className="space-y-2" onSubmit={(e) => {
          e.preventDefault()
          p.onSubmit((e.currentTarget.elements.namedItem('secret') as HTMLInputElement).value)
        }}>
          <label className="block text-body">{p.kind === 'passphrase' ? t('Passphrase') : t('Recovery key')}
            <input className={`ui-input mt-1 ${p.kind === 'recovery' ? 'font-mono' : ''}`} name="secret" type={p.kind === 'passphrase' ? 'password' : 'text'}
              autoComplete={p.kind === 'passphrase' ? 'current-password' : 'off'} spellCheck={false} autoFocus required />
          </label>
          {p.error && <p role="alert" className="text-body text-danger">{p.error}</p>}
          <button className="ui-btn ui-btn--primary ui-btn--md w-full" disabled={p.busy}>{p.busy ? t('Unlocking…') : t('Unlock')}</button>
        </form>
        <div className="flex flex-wrap justify-between gap-2 text-body">
          <button type="button" className="ui-btn ui-btn--ghost ui-btn--md" onClick={() => p.onKind(p.kind === 'passphrase' ? 'recovery' : 'passphrase')}>
            {p.kind === 'passphrase' ? t('Use the recovery key instead') : t('Use the passphrase instead')}
          </button>
          <button type="button" className="ui-btn ui-btn--ghost ui-btn--md" onClick={p.onLogout}>{t('Sign out')}</button>
        </div>
        {p.lost
          ? <LostKeysConfirm busy={p.busy} onConfirm={p.onConfirmLost} onCancel={() => p.onLost(false)} />
          : <button type="button" className="text-meta text-muted underline" onClick={() => p.onLost(true)}>{t('I lost both my passphrase and my recovery key')}</button>}
      </div>
    </div>
  )
}

export function UnlockScreen({ onLogout }: { onLogout: () => void }) {
  const [kind, setKind] = useState<'passphrase' | 'recovery'>('passphrase')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lost, setLost] = useState(false)
  const act = async (fn: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
      requestSync(0)
    } catch (err) {
      setError(encryptionMessage(err))
    } finally {
      setBusy(false)
    }
  }
  return (
    <UnlockView
      kind={kind} busy={busy} error={error} lost={lost} onKind={(k) => { setKind(k); setError(null) }} onLost={setLost} onLogout={onLogout}
      onSubmit={(secret) => void act(() => unlock(secret, kind))}
      onConfirmLost={() => void act(() => disableWithoutKey())}
    />
  )
}

// The server answered that it has no key record while this device encrypts
// (OpenSpec encryption-state-integrity): a server restored from an older backup,
// another device that turned encryption off, or a hostile server. A server answer
// never turns encryption off by itself; sync stays paused until the user restores
// the record from this device or turns encryption off here.

export interface RecordMissingViewProps {
  /** This device holds the account key (no passphrase needed to restore). */
  unlocked: boolean
  busy: boolean
  error: string | null
  confirmOff: boolean
  onRestore: (passphrase?: string) => void
  onConfirmOff: (open: boolean) => void
  onTurnOff: () => void
  onLogout: () => void
}

export function RecordMissingView(p: RecordMissingViewProps) {
  return (
    <div className="flex min-h-full items-center justify-center p-4">
      <div className="w-full max-w-md space-y-4 rounded-control border border-default p-6" data-testid="e2ee-record-missing">
        <h1 className="text-h3 font-semibold">{t('Encryption key record missing')}</h1>
        <p className="text-body text-muted">
          {t('This device encrypts your content, but the server says it has no encryption key record. This happens when the server was restored from an older backup or another device turned encryption off. Sync is paused, so nothing is uploaded unencrypted. Choose how to continue.')}
        </p>
        {p.unlocked ? (
          <div className="space-y-2">
            <button type="button" className="ui-btn ui-btn--primary ui-btn--md w-full" disabled={p.busy} onClick={() => p.onRestore()}>
              {p.busy ? t('Restoring…') : t('Restore the key record from this device')}
            </button>
            <p className="text-meta text-muted">{t('Uploads the copy of the key record kept on this device. Your passphrase and recovery key stay the same.')}</p>
          </div>
        ) : (
          <form className="space-y-2" onSubmit={(e) => {
            e.preventDefault()
            p.onRestore((e.currentTarget.elements.namedItem('secret') as HTMLInputElement).value)
          }}>
            <label className="block text-body">{t('Re-enter your passphrase to restore the key record from this device')}
              <input className="ui-input mt-1" name="secret" type="password" autoComplete="current-password" spellCheck={false} autoFocus required />
            </label>
            <button className="ui-btn ui-btn--primary ui-btn--md w-full" disabled={p.busy}>{p.busy ? t('Restoring…') : t('Restore the key record')}</button>
          </form>
        )}
        {p.error && <p role="alert" className="text-body text-danger">{p.error}</p>}
        {p.confirmOff ? (
          <div className="space-y-2 rounded-control border border-danger p-3">
            <p className="text-body">{t('Your content will be uploaded to the server in plaintext again. Only do this if you turned encryption off on purpose.')}</p>
            <div className="flex gap-2">
              <button type="button" className="ui-btn ui-btn--danger ui-btn--md" disabled={p.busy} onClick={p.onTurnOff}>{t('Turn off encryption')}</button>
              <button type="button" className="ui-btn ui-btn--ghost ui-btn--md" onClick={() => p.onConfirmOff(false)}>{t('Cancel')}</button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap justify-between gap-2 text-body">
            <button type="button" className="ui-btn ui-btn--ghost ui-btn--md" onClick={() => p.onConfirmOff(true)}>{t('Turn off encryption on this device…')}</button>
            <button type="button" className="ui-btn ui-btn--ghost ui-btn--md" onClick={p.onLogout}>{t('Sign out')}</button>
          </div>
        )}
      </div>
    </div>
  )
}

export function RecordMissingScreen({ unlocked, onLogout }: { unlocked: boolean; onLogout: () => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmOff, setConfirmOff] = useState(false)
  const act = async (fn: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
      requestSync(0)
    } catch (err) {
      setError(encryptionMessage(err))
    } finally {
      setBusy(false)
    }
  }
  return (
    <RecordMissingView
      unlocked={unlocked} busy={busy} error={error} confirmOff={confirmOff} onConfirmOff={setConfirmOff} onLogout={onLogout}
      onRestore={(passphrase) => void act(() => restoreKeyRecord(passphrase))}
      onTurnOff={() => void act(async () => {
        await turnOffAfterMissingRecord()
        if (!unlocked) return
        // As in Settings → Turn off encryption: content and files go back to plaintext.
        await startMigration('decrypt')
        try {
          await runFileMigration('decrypt')
        } catch (err) {
          if (!(err instanceof FileMigrationPaused)) throw err
        }
      })}
    />
  )
}
