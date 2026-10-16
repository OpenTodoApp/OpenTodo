import { type FormEvent, type ReactNode, useEffect, useRef, useState } from 'react'
import { Button } from '../ui'
import { Badge } from '../ui'
import { Field, Input } from '../ui'
import { Checkbox } from '../ui'
import { ConfirmDialog } from '../ui'
import { Notice } from '../ui'
import { SettingRow, SettingsSection } from '../ui'
import { Dialog } from './overlay/Dialog'
import { ApiError, isNetworkError } from '../lib/api'
import { MIN_PASSPHRASE_LENGTH, RecoveryKeyFormatError, WrongSecretError } from '../lib/crypto'
import {
  changePassphrase, commitEnable, disableEncryption, disableWithoutKey, EncryptionConflictError, lock, prepareEnable, purgeHistory,
  resetPassphrase, UnlockThrottledError, useEncryption, type EncryptionSnapshot, type PreparedEnable,
} from '../lib/e2ee'
import { startMigration } from '../lib/e2eeSync'
import { FileMigrationPaused, runFileMigration, waitForUploads } from '../lib/attachments'
import { requestSync } from '../lib/sync'

// Settings → End-to-end encryption (OpenSpec `e2ee`, task 4.1). The pure
// EncryptionView renders every state from props (tested with static markup);
// EncryptionPanel holds the flow. Passphrases and recovery keys live in
// component state only, never in storage, and never reach the server.

/** What the server and integrations still see, shown before enabling (design D2). */
export const PLAINTEXT_FIELDS = 'due dates, priority, completion and deletion times, ordering, project and parent links, project colours, archived state, label assignments and counts'
export const ENCRYPTED_FIELDS = 'task titles, descriptions and calendar extras, project, label, section and saved-view names, saved-view queries and your comments'

export function encryptionMessage(err: unknown): string {
  if (err instanceof WrongSecretError || err instanceof RecoveryKeyFormatError || err instanceof UnlockThrottledError || err instanceof EncryptionConflictError) return err.message
  if (err instanceof ApiError) return err.message
  // fetch() rejects with TypeError when the server is unreachable.
  if (err instanceof TypeError && isNetworkError(err)) return 'You are offline. This needs a connection to your server.'
  return err instanceof Error ? err.message : String(err)
}

export type Mode =
  | { kind: 'idle' }
  | { kind: 'passphrase' }
  | { kind: 'recovery'; recoveryKey: string; copied: boolean; acknowledged: boolean }
  | { kind: 'change' }
  | { kind: 'reset' }
  | { kind: 'newRecovery'; recoveryKey: string; copied: boolean }
  | { kind: 'confirmPurge' }
  | { kind: 'confirmDisable' }
  | { kind: 'confirmLost' }

export interface EncryptionViewProps {
  state: EncryptionSnapshot
  mode: Mode
  busy: boolean
  error: string | null
  notice: string | null
  onMode: (m: Mode) => void
  onSubmitPassphrase: (passphrase: string, confirm: string) => void
  onCopy: () => void
  onDownload: () => void
  onAcknowledge: (v: boolean) => void
  onEnable: () => void
  onChange: (current: string, next: string, confirm: string) => void
  onReset: (recoveryKey: string, next: string, confirm: string) => void
  onPurge: () => void
  onLock: () => void
  onDisable: () => void
  onLost: () => void
}

function PassphraseFields({ prefix }: { prefix: string }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="New passphrase" description={`At least ${MIN_PASSPHRASE_LENGTH} characters.`}>
        <Input type="password" name={`${prefix}-new`} autoComplete="new-password" minLength={MIN_PASSPHRASE_LENGTH} required />
      </Field>
      <Field label="Repeat it">
        <Input type="password" name={`${prefix}-confirm`} autoComplete="new-password" minLength={MIN_PASSPHRASE_LENGTH} required />
      </Field>
    </div>
  )
}

const field = (e: FormEvent<HTMLFormElement>, name: string) => (e.currentTarget.elements.namedItem(name) as HTMLInputElement | null)?.value ?? ''

function RecoveryKeyBox(p: { recoveryKey: string; copied: boolean; onCopy: () => void; onDownload: () => void }) {
  return (
    <div className="space-y-2">
      <p className="text-body text-default">Your recovery key. It is shown once; store it somewhere safe and separate from this device (a password manager or paper):</p>
      <code className="block select-all rounded-control border border-input bg-sunken p-3 font-mono text-body break-all text-default" data-recovery-key>{p.recoveryKey}</code>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" icon={p.copied ? 'check' : 'copy'} onClick={p.onCopy}>{p.copied ? 'Copied' : 'Copy recovery key'}</Button>
        <Button variant="secondary" icon="download" onClick={p.onDownload}>Download as text</Button>
      </div>
    </div>
  )
}

/** Closes an inline form on Escape and moves focus into its first field when it opens. */
function InlineForm({ onCancel, onSubmit, children }: { onCancel: () => void; onSubmit: (e: FormEvent<HTMLFormElement>) => void; children: ReactNode }) {
  const ref = useRef<HTMLFormElement>(null)
  useEffect(() => { ref.current?.querySelector<HTMLInputElement>('input:not([type="hidden"])')?.focus() }, [])
  return (
    <form ref={ref} className="space-y-3 py-3" onSubmit={(e) => { e.preventDefault(); onSubmit(e) }}
      onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onCancel() } }}>
      {children}
    </form>
  )
}

export function EncryptionView(p: EncryptionViewProps) {
  const { state, mode } = p
  const progress = state.migration
  const idle = () => p.onMode({ kind: 'idle' })
  const status = state.enabled ? (state.unlocked ? 'on' : 'locked') : 'off'
  return (
    <SettingsSection title="End-to-end encryption" headingId="e2ee-heading"
      description={`Encrypts ${ENCRYPTED_FIELDS} on your devices before they are synced, so your server, its backups and integrations only see ciphertext.`}>
      {p.error && <Notice tone="danger">{p.error}</Notice>}
      {p.notice && <Notice tone="success">{p.notice}</Notice>}
      {progress && (
        <Notice>
          {progress.mode === 'encrypt' ? 'Encrypting' : 'Decrypting'} your {progress.files ? 'files' : 'data'}: {progress.done} of {progress.total}{progress.files ? ' files' : ''}…
          <progress className="ml-2 align-middle" max={Math.max(progress.total, 1)} value={progress.done} />
        </Notice>
      )}

      <SettingRow label="Status" status={
        <span className="flex flex-wrap items-center gap-2" data-testid="e2ee-status">
          <Badge hue={status === 'on' ? 'green' : status === 'locked' ? 'orange' : 'slate'}>
            {status === 'on' ? 'On' : status === 'locked' ? 'Locked on this device' : 'Off'}
          </Badge>
          {state.enabled && <span className="text-muted">{state.unlocked ? 'Unlocked on this device' : 'This device is locked'} · key version {state.keyVersion}</span>}
        </span>
      } control={!state.enabled && mode.kind === 'idle' && (
        <Button variant="primary" onClick={() => p.onMode({ kind: 'passphrase' })}>Set up encryption…</Button>
      )} />

      {!state.enabled && mode.kind === 'idle' && (
        <p className="py-3 text-meta text-muted">
          Still visible to the server: {PLAINTEXT_FIELDS}. Shared projects are not encrypted, and new projects cannot be shared while
          encryption is on.
        </p>
      )}

      {mode.kind === 'passphrase' && (
        <InlineForm onCancel={idle} onSubmit={(e) => p.onSubmitPassphrase(field(e, 'enable-new'), field(e, 'enable-confirm'))}>
          <p className="text-meta text-muted">Choose a passphrase you will enter once on each device. Long and memorable beats short and complex.</p>
          <PassphraseFields prefix="enable" />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={idle}>Cancel</Button>
            <Button variant="primary" type="submit" busy={p.busy}>{p.busy ? 'Deriving keys…' : 'Next'}</Button>
          </div>
        </InlineForm>
      )}

      {mode.kind === 'recovery' && (
        <div className="space-y-3 py-3">
          <RecoveryKeyBox recoveryKey={mode.recoveryKey} copied={mode.copied} onCopy={p.onCopy} onDownload={p.onDownload} />
          <Checkbox checked={mode.acknowledged} onChange={(e) => p.onAcknowledge(e.target.checked)}
            label="I saved the recovery key. I understand that if I lose both my passphrase and the recovery key, my encrypted content cannot be recovered by anyone, including the server owner." />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={idle}>Cancel</Button>
            <Button variant="primary" disabled={!mode.acknowledged || p.busy} onClick={p.onEnable}>{p.busy ? 'Turning on…' : 'Turn on encryption'}</Button>
          </div>
        </div>
      )}

      {state.enabled && (mode.kind === 'idle' || mode.kind === 'confirmPurge' || mode.kind === 'confirmDisable' || mode.kind === 'confirmLost') && (
        <>
          <p className="py-3 text-meta text-muted">
            Encrypted: {ENCRYPTED_FIELDS}. Visible to the server: {PLAINTEXT_FIELDS}. Keep your recovery key safe: without it and your
            passphrase, encrypted content is lost.
          </p>
          {state.unlocked && (
            <SettingRow label="Passphrase" description="Your content is not re-encrypted; other devices keep working."
              control={<Button variant="secondary" onClick={() => p.onMode({ kind: 'change' })}>Change passphrase…</Button>} />
          )}
          <SettingRow label="Forgot your passphrase?" description="Your recovery key sets a new one and is then replaced."
            control={<Button variant="secondary" onClick={() => p.onMode({ kind: 'reset' })}>Reset passphrase with recovery key…</Button>} />
          <SettingRow label="Plaintext history" description="Removes earlier versions of encrypted fields from the server's history."
            control={<Button variant="secondary" onClick={() => p.onMode({ kind: 'confirmPurge' })}>Purge plaintext history…</Button>} />
          {state.unlocked && (
            <SettingRow label="This device" description="Asks for your passphrase again before showing your tasks."
              control={<Button variant="secondary" icon="lock" onClick={p.onLock}>Lock this device</Button>} />
          )}
          {state.unlocked ? (
            <SettingRow label="Turn off encryption" description="Your content is synced in plaintext again."
              control={<Button variant="danger" onClick={() => p.onMode({ kind: 'confirmDisable' })}>Turn off encryption…</Button>} />
          ) : (
            <SettingRow label="Lost both keys?" description="Without your passphrase or recovery key, encrypted content cannot be recovered."
              control={<Button variant="danger" onClick={() => p.onMode({ kind: 'confirmLost' })}>I lost my passphrase and recovery key…</Button>} />
          )}
        </>
      )}

      {mode.kind === 'change' && (
        <InlineForm onCancel={idle} onSubmit={(e) => p.onChange(field(e, 'current'), field(e, 'change-new'), field(e, 'change-confirm'))}>
          <p className="text-meta text-muted">Your content is not re-encrypted; other devices keep working. New devices use the new passphrase.</p>
          <Field label="Current passphrase"><Input type="password" name="current" autoComplete="current-password" required /></Field>
          <PassphraseFields prefix="change" />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={idle}>Cancel</Button>
            <Button variant="primary" type="submit" busy={p.busy}>{p.busy ? 'Saving…' : 'Change passphrase'}</Button>
          </div>
        </InlineForm>
      )}

      {mode.kind === 'reset' && (
        <InlineForm onCancel={idle} onSubmit={(e) => p.onReset(field(e, 'recovery'), field(e, 'reset-new'), field(e, 'reset-confirm'))}>
          <p className="text-meta text-muted">Forgot the passphrase? Your recovery key sets a new one and is then replaced by a new recovery key.</p>
          <Field label="Recovery key"><Input className="font-mono" name="recovery" autoComplete="off" spellCheck={false} required /></Field>
          <PassphraseFields prefix="reset" />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={idle}>Cancel</Button>
            <Button variant="primary" type="submit" busy={p.busy}>{p.busy ? 'Checking…' : 'Reset passphrase'}</Button>
          </div>
        </InlineForm>
      )}

      {mode.kind === 'newRecovery' && (
        <div className="space-y-3 py-3">
          <Notice tone="success">Passphrase reset. Your old recovery key no longer works.</Notice>
          <RecoveryKeyBox recoveryKey={mode.recoveryKey} copied={mode.copied} onCopy={p.onCopy} onDownload={p.onDownload} />
          <div className="flex justify-end"><Button variant="primary" onClick={idle}>I saved it</Button></div>
        </div>
      )}

      {mode.kind === 'confirmPurge' && (
        <ConfirmDialog title="Purge plaintext history?" confirmLabel={p.busy ? 'Purging…' : 'Purge history'} onCancel={idle} onConfirm={p.onPurge}
          consequence="Deletes earlier (superseded) versions of your titles, descriptions and names from the server's history, including any plaintext from before encryption was on. Revision history for those fields is gone afterwards. Backups made before now, and copies of the database, may still contain plaintext: delete them if that matters to you." />
      )}

      {mode.kind === 'confirmDisable' && (
        <ConfirmDialog title="Turn off encryption?" confirmLabel={p.busy ? 'Turning off…' : 'Turn off encryption'} onCancel={idle} onConfirm={p.onDisable}
          consequence="Your content is decrypted on this device and synced in plaintext again; the key record is deleted from the server. You will be asked to confirm your password." />
      )}

      {mode.kind === 'confirmLost' && (
        <Dialog title="Lost both keys" onClose={idle} dismissable={false} role="alertdialog">
          <LostKeysConfirm busy={p.busy} onConfirm={p.onLost} onCancel={idle} />
        </Dialog>
      )}
    </SettingsSection>
  )
}

/** The "both lost" path, shared with the unlock screen: states the loss plainly before acting. */
export function LostKeysConfirm({ busy, onConfirm, onCancel }: { busy: boolean; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="space-y-2 rounded-control border border-danger p-3">
      <p className="text-body">
        Without your passphrase or recovery key, encrypted content cannot be recovered: not by you, not by the server owner. The only way
        forward is to turn encryption off and delete the encrypted content (it moves to the Trash). Plaintext data (due dates, structure)
        is kept.
      </p>
      <div className="flex gap-2">
        <button type="button" className="ui-btn ui-btn--danger ui-btn--md" disabled={busy} onClick={onConfirm}>{busy ? 'Deleting…' : 'Turn off and delete encrypted content'}</button>
        <button type="button" className="ui-btn ui-btn--ghost ui-btn--md" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}

function download(text: string) {
  const blob = new Blob([`OpenTodo recovery key\n\n${text}\n\nKeep it secret. With it, anyone who can sign in to your account can read your encrypted tasks.\n`], { type: 'text/plain' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = 'opentodo-recovery-key.txt'
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

export function EncryptionPanel() {
  const state = useEncryption()
  const [mode, setMode] = useState<Mode>({ kind: 'idle' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [prepared, setPrepared] = useState<PreparedEnable | null>(null)

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      await fn()
    } catch (err) {
      setError(encryptionMessage(err))
    } finally {
      setBusy(false)
    }
  }
  const checkNew = (next: string, confirm: string) => {
    if (next.length < MIN_PASSPHRASE_LENGTH) throw new Error(`The passphrase needs at least ${MIN_PASSPHRASE_LENGTH} characters.`)
    if (next !== confirm) throw new Error('The two passphrases do not match.')
  }
  const recoveryText = mode.kind === 'recovery' || mode.kind === 'newRecovery' ? mode.recoveryKey : ''

  return (
    <EncryptionView
      state={state} mode={mode} busy={busy} error={error} notice={notice}
      onMode={(m) => { setError(null); setMode(m) }}
      onSubmitPassphrase={(next, confirm) => void run(async () => {
        checkNew(next, confirm)
        const prep = await prepareEnable(next)
        setPrepared(prep)
        setMode({ kind: 'recovery', recoveryKey: prep.recoveryKey, copied: false, acknowledged: false })
      })}
      onCopy={() => {
        void navigator.clipboard?.writeText(recoveryText)
        if (mode.kind === 'recovery' || mode.kind === 'newRecovery') setMode({ ...mode, copied: true })
      }}
      onDownload={() => download(recoveryText)}
      onAcknowledge={(v) => mode.kind === 'recovery' && setMode({ ...mode, acknowledged: v })}
      onEnable={() => void run(async () => {
        if (!prepared) throw new Error('Start again: choose a passphrase.')
        await commitEnable(prepared)
        setPrepared(null)
        setMode({ kind: 'idle' })
        await startMigration('encrypt')
        requestSync(0)
        // Then the files (OpenSpec attachments D8): each is re-uploaded encrypted.
        try {
          await runFileMigration('encrypt')
        } catch (err) {
          if (!(err instanceof FileMigrationPaused)) throw err
          setNotice('Encryption is on. Your content was re-written as ciphertext; your files continue encrypting when you are online.')
          return
        }
        setNotice('Encryption is on. Your content was re-written as ciphertext and is being uploaded.')
      })}
      onChange={(current, next, confirm) => void run(async () => {
        checkNew(next, confirm)
        await changePassphrase(current, next)
        setMode({ kind: 'idle' })
        setNotice('Passphrase changed. Use the new one on new devices.')
      })}
      onReset={(recovery, next, confirm) => void run(async () => {
        checkNew(next, confirm)
        const { recoveryKey } = await resetPassphrase(recovery, next)
        setMode({ kind: 'newRecovery', recoveryKey, copied: false })
        requestSync(0)
      })}
      onPurge={() => void run(async () => {
        const res = await purgeHistory()
        setMode({ kind: 'idle' })
        setNotice(`${res.purged} earlier version(s) deleted. ${res.notice}`)
      })}
      onLock={() => void run(async () => {
        await lock()
      })}
      onDisable={() => void run(async () => {
        // Files first, while the key record still exists: each is re-uploaded
        // decrypted, and the record goes only once the last one is stored (D8).
        try {
          await runFileMigration('decrypt')
        } catch (err) {
          if (err instanceof FileMigrationPaused) throw new Error('Your files need a connection to be decrypted. Encryption stays on; try again when you are online.')
          throw err
        }
        if (!(await waitForUploads())) throw new Error('Some decrypted files have not finished uploading. Encryption stays on until they have; try again in a moment.')
        await disableEncryption()
        setMode({ kind: 'idle' })
        await startMigration('decrypt')
        requestSync(0)
        setNotice('Encryption is off. Your content is being uploaded in plaintext again.')
      })}
      onLost={() => void run(async () => {
        await disableWithoutKey()
        setMode({ kind: 'idle' })
        requestSync(0)
        setNotice('Encryption is off. Encrypted content that cannot be decrypted is moved to the Trash as it syncs.')
      })}
    />
  )
}
