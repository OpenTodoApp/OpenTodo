import { type FormEvent, useState } from 'react'
import { ApiError, isNetworkError } from '../lib/api'
import { MIN_PASSPHRASE_LENGTH, RecoveryKeyFormatError, WrongSecretError } from '../lib/crypto'
import {
  changePassphrase, commitEnable, disableEncryption, disableWithoutKey, EncryptionConflictError, lock, prepareEnable, purgeHistory,
  resetPassphrase, UnlockThrottledError, useEncryption, type EncryptionSnapshot, type PreparedEnable,
} from '../lib/e2ee'
import { startMigration } from '../lib/e2eeSync'
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
    <>
      <label className="block text-sm">New passphrase (at least {MIN_PASSPHRASE_LENGTH} characters)
        <input className="input mt-1" type="password" name={`${prefix}-new`} autoComplete="new-password" minLength={MIN_PASSPHRASE_LENGTH} required />
      </label>
      <label className="block text-sm">Repeat it
        <input className="input mt-1" type="password" name={`${prefix}-confirm`} autoComplete="new-password" minLength={MIN_PASSPHRASE_LENGTH} required />
      </label>
    </>
  )
}

const field = (e: FormEvent<HTMLFormElement>, name: string) => (e.currentTarget.elements.namedItem(name) as HTMLInputElement | null)?.value ?? ''

function RecoveryKeyBox(p: { recoveryKey: string; copied: boolean; onCopy: () => void; onDownload: () => void }) {
  return (
    <div className="space-y-2">
      <p className="text-sm">Your recovery key. It is shown once; store it somewhere safe and separate from this device (a password manager or paper):</p>
      <code className="block select-all rounded border border-slate-300 bg-slate-50 p-3 font-mono text-sm break-all dark:border-slate-700 dark:bg-slate-900" data-recovery-key>{p.recoveryKey}</code>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-ghost border border-slate-300 dark:border-slate-700" onClick={p.onCopy}>{p.copied ? 'Copied' : 'Copy recovery key'}</button>
        <button type="button" className="btn-ghost border border-slate-300 dark:border-slate-700" onClick={p.onDownload}>Download as text</button>
      </div>
    </div>
  )
}

export function EncryptionView(p: EncryptionViewProps) {
  const { state, mode } = p
  const progress = state.migration
  return (
    <section className="space-y-3" aria-labelledby="e2ee-heading">
      <h2 id="e2ee-heading" className="font-semibold">End-to-end encryption</h2>
      {p.error && <p role="alert" className="text-sm text-red-600">{p.error}</p>}
      {p.notice && <p role="status" className="text-sm text-emerald-700 dark:text-emerald-400">{p.notice}</p>}
      {progress && (
        <div role="status" className="text-sm">
          {progress.mode === 'encrypt' ? 'Encrypting' : 'Decrypting'} your data: {progress.done} of {progress.total}…
          <progress className="ml-2 align-middle" max={Math.max(progress.total, 1)} value={progress.done} />
        </div>
      )}

      {!state.enabled && mode.kind === 'idle' && (
        <>
          <p className="text-sm text-slate-500">
            Off. With encryption on, {ENCRYPTED_FIELDS} are encrypted on your devices before they are synced, so your server, its backups
            and integrations (CalDAV, MCP, webhooks) only see ciphertext. Still visible to the server: {PLAINTEXT_FIELDS}.
            Shared projects are not encrypted, and new projects cannot be shared while encryption is on.
          </p>
          <button type="button" className="btn-primary" onClick={() => p.onMode({ kind: 'passphrase' })}>Set up encryption…</button>
        </>
      )}

      {mode.kind === 'passphrase' && (
        <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); p.onSubmitPassphrase(field(e, 'enable-new'), field(e, 'enable-confirm')) }}>
          <p className="text-sm text-slate-500">Choose a passphrase you will enter once on each device. Long and memorable beats short and complex.</p>
          <PassphraseFields prefix="enable" />
          <div className="flex gap-2">
            <button className="btn-primary" disabled={p.busy}>{p.busy ? 'Deriving keys…' : 'Next'}</button>
            <button type="button" className="btn-ghost" onClick={() => p.onMode({ kind: 'idle' })}>Cancel</button>
          </div>
        </form>
      )}

      {mode.kind === 'recovery' && (
        <div className="space-y-3">
          <RecoveryKeyBox recoveryKey={mode.recoveryKey} copied={mode.copied} onCopy={p.onCopy} onDownload={p.onDownload} />
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1" checked={mode.acknowledged} onChange={(e) => p.onAcknowledge(e.target.checked)} />
            <span>I saved the recovery key. I understand that if I lose both my passphrase and the recovery key, my encrypted content cannot be recovered by anyone, including the server owner.</span>
          </label>
          <div className="flex gap-2">
            <button type="button" className="btn-primary" disabled={!mode.acknowledged || p.busy} onClick={p.onEnable}>{p.busy ? 'Turning on…' : 'Turn on encryption'}</button>
            <button type="button" className="btn-ghost" onClick={() => p.onMode({ kind: 'idle' })}>Cancel</button>
          </div>
        </div>
      )}

      {state.enabled && mode.kind === 'idle' && (
        <>
          <p className="text-sm text-slate-500">
            On{state.unlocked ? ' and unlocked on this device' : ', but this device is locked'} (key version {state.keyVersion}).
            Encrypted: {ENCRYPTED_FIELDS}. Visible to the server: {PLAINTEXT_FIELDS}.
            Keep your recovery key safe: without it and your passphrase, encrypted content is lost.
          </p>
          <div className="flex flex-wrap gap-2">
            {state.unlocked && <button type="button" className="btn-ghost border border-slate-300 dark:border-slate-700" onClick={() => p.onMode({ kind: 'change' })}>Change passphrase…</button>}
            <button type="button" className="btn-ghost border border-slate-300 dark:border-slate-700" onClick={() => p.onMode({ kind: 'reset' })}>Reset passphrase with recovery key…</button>
            <button type="button" className="btn-ghost border border-slate-300 dark:border-slate-700" onClick={() => p.onMode({ kind: 'confirmPurge' })}>Purge plaintext history…</button>
            {state.unlocked && <button type="button" className="btn-ghost border border-slate-300 dark:border-slate-700" onClick={p.onLock}>Lock this device</button>}
            {state.unlocked
              ? <button type="button" className="btn-danger" onClick={() => p.onMode({ kind: 'confirmDisable' })}>Turn off encryption…</button>
              : <button type="button" className="btn-danger" onClick={() => p.onMode({ kind: 'confirmLost' })}>I lost my passphrase and recovery key…</button>}
          </div>
        </>
      )}

      {mode.kind === 'change' && (
        <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); p.onChange(field(e, 'current'), field(e, 'change-new'), field(e, 'change-confirm')) }}>
          <p className="text-sm text-slate-500">Your content is not re-encrypted; other devices keep working. New devices use the new passphrase.</p>
          <label className="block text-sm">Current passphrase
            <input className="input mt-1" type="password" name="current" autoComplete="current-password" required />
          </label>
          <PassphraseFields prefix="change" />
          <div className="flex gap-2">
            <button className="btn-primary" disabled={p.busy}>{p.busy ? 'Saving…' : 'Change passphrase'}</button>
            <button type="button" className="btn-ghost" onClick={() => p.onMode({ kind: 'idle' })}>Cancel</button>
          </div>
        </form>
      )}

      {mode.kind === 'reset' && (
        <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); p.onReset(field(e, 'recovery'), field(e, 'reset-new'), field(e, 'reset-confirm')) }}>
          <p className="text-sm text-slate-500">Forgot the passphrase? Your recovery key sets a new one and is then replaced by a new recovery key.</p>
          <label className="block text-sm">Recovery key
            <input className="input mt-1 font-mono" name="recovery" autoComplete="off" spellCheck={false} required />
          </label>
          <PassphraseFields prefix="reset" />
          <div className="flex gap-2">
            <button className="btn-primary" disabled={p.busy}>{p.busy ? 'Checking…' : 'Reset passphrase'}</button>
            <button type="button" className="btn-ghost" onClick={() => p.onMode({ kind: 'idle' })}>Cancel</button>
          </div>
        </form>
      )}

      {mode.kind === 'newRecovery' && (
        <div className="space-y-3">
          <p className="text-sm">Passphrase reset. Your old recovery key no longer works.</p>
          <RecoveryKeyBox recoveryKey={mode.recoveryKey} copied={mode.copied} onCopy={p.onCopy} onDownload={p.onDownload} />
          <button type="button" className="btn-primary" onClick={() => p.onMode({ kind: 'idle' })}>I saved it</button>
        </div>
      )}

      {mode.kind === 'confirmPurge' && (
        <div className="space-y-2">
          <p className="text-sm">
            Deletes earlier (superseded) versions of your titles, descriptions and names from the server's history, including any
            plaintext from before encryption was on. Revision history for those fields is gone afterwards. Backups made before now,
            and copies of the database, may still contain plaintext: delete them if that matters to you.
          </p>
          <div className="flex gap-2">
            <button type="button" className="btn-danger" disabled={p.busy} onClick={p.onPurge}>{p.busy ? 'Purging…' : 'Purge history'}</button>
            <button type="button" className="btn-ghost" onClick={() => p.onMode({ kind: 'idle' })}>Cancel</button>
          </div>
        </div>
      )}

      {mode.kind === 'confirmDisable' && (
        <div className="space-y-2">
          <p className="text-sm">Your content is decrypted on this device and synced in plaintext again; the key record is deleted from the server. You will be asked to confirm your password.</p>
          <div className="flex gap-2">
            <button type="button" className="btn-danger" disabled={p.busy} onClick={p.onDisable}>{p.busy ? 'Turning off…' : 'Turn off encryption'}</button>
            <button type="button" className="btn-ghost" onClick={() => p.onMode({ kind: 'idle' })}>Cancel</button>
          </div>
        </div>
      )}

      {mode.kind === 'confirmLost' && <LostKeysConfirm busy={p.busy} onConfirm={p.onLost} onCancel={() => p.onMode({ kind: 'idle' })} />}
    </section>
  )
}

/** The "both lost" path, shared with the unlock screen: states the loss plainly before acting. */
export function LostKeysConfirm({ busy, onConfirm, onCancel }: { busy: boolean; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="space-y-2 rounded border border-red-300 p-3 dark:border-red-900">
      <p className="text-sm">
        Without your passphrase or recovery key, encrypted content cannot be recovered: not by you, not by the server owner. The only way
        forward is to turn encryption off and delete the encrypted content (it moves to the Trash). Plaintext data (due dates, structure)
        is kept.
      </p>
      <div className="flex gap-2">
        <button type="button" className="btn-danger" disabled={busy} onClick={onConfirm}>{busy ? 'Deleting…' : 'Turn off and delete encrypted content'}</button>
        <button type="button" className="btn-ghost" onClick={onCancel}>Cancel</button>
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
