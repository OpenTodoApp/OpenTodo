// Restore from a backup in the web app (OpenSpec backup-restore-web, design D9):
// pick an archive from the destination or upload one, see a verified preview,
// type RESTORE, and the server restarts into the restored data. Undo puts the
// safety copy of the last restore back through the same flow.
import { useCallback, useEffect, useRef, useState } from 'react'
import { api, ApiError, isNetworkError } from '../lib/api'
import { formatBytes } from '../lib/backups'
import { markRestoring, needsPassphrase, restoreErrorMessage, waitForRestart } from '../lib/restore'
import type { RestoreArchive, RestoreSource, RestoreState, StagedRestore } from '../lib/types'
import { Button } from '../ui'
import { Badge } from '../ui'
import { Field, Input } from '../ui'
import { Icon } from '../ui'
import { ConfirmDialog } from '../ui'
import { ListRow } from '../ui'
import { Notice } from '../ui'
import { useDateTimeFormat } from './DateTimePrefsProvider'
import { Dialog } from './overlay/Dialog'
import { navigate } from './router'

export type RestoreSourceTab = 'destination' | 'upload'

export interface RestoreSectionViewProps {
  offline: boolean
  state: RestoreState | null
  archives: { destination: string; archives: RestoreArchive[] } | null
  archivesError: string | null
  tab: RestoreSourceTab
  /** 0..1 while an upload runs. */
  uploadProgress: number | null
  /** The archive (or "upload", "undo") being prepared. */
  preparing: string | null
  error: string | null
  onTab: (tab: RestoreSourceTab) => void
  onPreview: (archive: string) => void
  onUpload: (file: File) => void
  onUndo: () => void
  onDeleteCopy: (name: string) => void
}

/** The restore part of Settings → Server. */
export function RestoreSectionView(p: RestoreSectionViewProps) {
  const dt = useDateTimeFormat()
  const fileInput = useRef<HTMLInputElement>(null)
  const busy = p.preparing !== null || p.uploadProgress !== null
  const disabled = p.offline || busy
  const last = p.state?.last ?? null
  const copies = p.state?.safetyCopies ?? []
  const copiesSize = copies.reduce((n, c) => n + c.size, 0)
  return (
    <section className="space-y-3 py-3" aria-labelledby="restore-heading" data-testid="restore-section">
      <div>
        <h3 id="restore-heading" className="text-sm font-medium text-default">Restore from a backup</h3>
        <p className="text-meta text-muted">
          Puts the whole server back to the state in an archive: every account, project, task and the sync log. The server restarts, and everything is checked before anything changes. On a stopped server you can also use the <a className="underline" href="/help/backups" onClick={(e) => { e.preventDefault(); navigate({ view: 'help', page: 'backups' }) }}>command line</a>.
        </p>
      </div>
      {p.offline && <Notice tone="warning">Restoring runs on the server and needs a connection.</Notice>}

      {last && (
        <div data-testid="restore-last">
          {last.ok ? (
            <Notice tone="success" action={p.state?.undoAvailable ? <Button variant="secondary" icon="undo-2" disabled={disabled} busy={p.preparing === 'undo'} onClick={p.onUndo}>Undo last restore</Button> : undefined}>
              Restored from <span className="user-text font-medium">{last.archive}</span> on {dt.formatInstant(last.finishedAt, 'datetime')}.
            </Notice>
          ) : (
            <Notice tone="danger">
              The restore of <span className="user-text font-medium">{last.archive}</span> on {dt.formatInstant(last.finishedAt, 'datetime')} failed, and the server kept its previous data. {last.error}
            </Notice>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-4 text-sm text-default" role="radiogroup" aria-label="Restore from">
        {(['destination', 'upload'] as RestoreSourceTab[]).map((t) => (
          <label key={t} className="flex items-center gap-1.5">
            <input type="radio" className="accent-(--ot-accent)" name="restore-source" value={t} checked={p.tab === t} disabled={p.offline} onChange={() => p.onTab(t)} />
            {t === 'destination' ? 'From the backup destination' : 'Upload a file'}
          </label>
        ))}
      </div>

      {p.tab === 'destination' && (
        <div data-testid="restore-archives">
          {p.archivesError && <Notice tone="danger">{p.archivesError} You can still upload an archive.</Notice>}
          {!p.archivesError && p.archives === null && <p className="text-meta text-faint">{p.offline ? 'Not available offline.' : 'Loading archives…'}</p>}
          {p.archives && p.archives.archives.length === 0 && <p className="text-meta text-faint">No archives in <span className="user-text">{p.archives.destination}</span> yet.</p>}
          {p.archives && p.archives.archives.length > 0 && (
            <ul className="-mx-3" aria-label="Archives in the destination">
              {p.archives.archives.map((a) => (
                <li key={a.name}>
                  <ListRow
                    leading={<Icon name="history" size="md" />}
                    label={dt.formatInstant(a.createdAt, 'datetime')}
                    ariaLabel={`Archive from ${dt.formatInstant(a.createdAt, 'datetime')}, ${formatBytes(a.size)}${a.encrypted ? ', encrypted' : ''}`}
                    meta={`${formatBytes(a.size)} · ${a.name}`}
                    badges={<>{a.encrypted && <Badge hue="slate"><Icon name="lock" size="xs" /> encrypted</Badge>}
                      <Button variant="secondary" disabled={disabled} busy={p.preparing === a.name} onClick={() => p.onPreview(a.name)}>Preview</Button></>}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {p.tab === 'upload' && (
        <div className="space-y-2" data-testid="restore-upload">
          <p className="text-meta text-muted">An archive made by OpenTodo (<code className="font-mono">opentodo-….tar.gz</code>, optionally <code className="font-mono">.enc</code>), for example from another server.</p>
          <input ref={fileInput} type="file" className="sr-only" accept=".tar,.gz,.enc,application/gzip,application/x-tar,application/octet-stream" aria-label="Archive file" tabIndex={-1}
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) p.onUpload(f) }} />
          <Button variant="secondary" icon="upload" disabled={disabled} onClick={() => fileInput.current?.click()}>Choose an archive…</Button>
          {p.uploadProgress !== null && (
            <div role="status" aria-live="polite" className="text-meta text-muted" data-testid="restore-upload-progress">
              <progress className="mr-2 align-middle" max={1} value={p.uploadProgress} aria-label="Upload progress" /> Uploading… {Math.round(p.uploadProgress * 100)}%
            </div>
          )}
          {p.state && p.state.uploadLimit >= 0 && <p className="text-meta text-faint">Up to {formatBytes(p.state.uploadLimit)} with the free space on the server.</p>}
        </div>
      )}

      {p.error && <Notice tone="danger">{p.error}</Notice>}

      {copies.length > 0 && (
        <div data-testid="restore-safety-copies">
          <h4 className="text-meta font-medium text-default">Safety copies ({formatBytes(copiesSize)})</h4>
          <p className="text-meta text-faint">Each restore keeps the database it replaced. Delete old ones to free space.</p>
          <ul className="-mx-3" aria-label="Safety copies">
            {copies.map((c) => (
              <li key={c.name}>
                <ListRow leading={<Icon name="history" size="md" />} label={`Before the restore of ${dt.formatInstant(c.createdAt, 'datetime')}`} meta={`${formatBytes(c.size)} · ${c.name}`}
                  ariaLabel={`Safety copy from ${dt.formatInstant(c.createdAt, 'datetime')}, ${formatBytes(c.size)}`}
                  badges={<Button variant="ghost" icon="trash-2" disabled={p.offline} aria-label={`Delete safety copy ${c.name}`} onClick={() => p.onDeleteCopy(c.name)}>Delete</Button>} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

export interface RestoreDialogProps {
  /** The verified restore, or null while a passphrase is needed. */
  staged: StagedRestore | null
  /** Archive name shown while asking for the passphrase. */
  archive: string
  undo?: boolean
  askPassphrase: boolean
  error: string | null
  busy: boolean
  onVerify: (passphrase: string) => void
  onConfirm: () => void
  onCancel: () => void
}

/** Preview and confirmation (spec: verify and preview before restoring; explicit confirmation). */
export function RestoreDialog(p: RestoreDialogProps) {
  const dt = useDateTimeFormat()
  const [passphrase, setPassphrase] = useState('')
  const [word, setWord] = useState('')
  const s = p.staged
  const created = s?.manifest?.createdAt ? Date.parse(s.manifest.createdAt) : null
  return (
    <Dialog title={p.undo ? 'Undo the last restore' : 'Restore from a backup'} onClose={p.onCancel} dismissable={false} size="md" testId="restore-dialog">
      <div className="space-y-4 text-sm text-default">
        {!s && p.askPassphrase && (
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); p.onVerify(passphrase) }}>
            <p><span className="user-text font-medium">{p.archive}</span> is encrypted with a passphrase this server does not have.</p>
            <Field label="Passphrase">
              <Input type="password" name="restore-passphrase" autoComplete="off" autoFocus value={passphrase} onChange={(e) => setPassphrase(e.target.value)} />
            </Field>
            {p.error && <p role="alert" className="text-meta text-danger">{p.error}</p>}
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="secondary" onClick={p.onCancel}>Cancel</Button>
              <Button type="submit" variant="primary" disabled={passphrase === '' || p.busy} busy={p.busy}>Verify</Button>
            </div>
          </form>
        )}
        {s && (
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (word === 'RESTORE') p.onConfirm() }}>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1" data-testid="restore-preview">
              <dt className="text-muted">{p.undo ? 'Database from' : 'Backup from'}</dt><dd>{created ? dt.formatInstant(created, 'datetime') : 'unknown'}</dd>
              {s.manifest?.appVersion && <><dt className="text-muted">Made by</dt><dd>OpenTodo {s.manifest.appVersion}</dd></>}
              <dt className="text-muted">Schema version</dt><dd>{s.manifest?.schemaVersion}</dd>
              <dt className="text-muted">Size</dt><dd>{formatBytes(s.size)}{s.encrypted ? ' · encrypted' : ''}</dd>
              {s.counts && <><dt className="text-muted">Contains</dt><dd>{plural(s.counts.accounts, 'account')}, {plural(s.counts.projects, 'project')}, {plural(s.counts.tasks, 'task')}</dd></>}
            </dl>
            <div className="rounded-control bg-warning-soft p-3 text-meta text-on-warning-soft" data-testid="restore-consequences">
              <p className="font-medium">What will happen</p>
              <ul className="ml-4 list-disc space-y-1">
                <li>The server restarts. Everyone is briefly disconnected.</li>
                <li>Accounts, passwords, sessions and tokens go back to the state in the backup. Anyone whose session started after it, possibly you, signs in again.</li>
                <li>Devices sync again. A device that changed something after the backup sends those newer changes back, so they are not lost.</li>
                <li>The current database is kept as a safety copy, so you can undo this.</li>
              </ul>
            </div>
            <Field label="Type RESTORE to confirm">
              <Input name="restore-confirm" autoComplete="off" autoCapitalize="characters" spellCheck={false} value={word} onChange={(e) => setWord(e.target.value)} />
            </Field>
            {p.error && <p role="alert" className="text-meta text-danger">{p.error}</p>}
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="secondary" onClick={p.onCancel} data-autofocus>Cancel</Button>
              <Button type="submit" variant="danger" className="border border-current" disabled={word !== 'RESTORE' || p.busy} busy={p.busy}>Restore and restart</Button>
            </div>
          </form>
        )}
      </div>
    </Dialog>
  )
}

function plural(n: number, word: string): string {
  return `${new Intl.NumberFormat().format(n)} ${word}${n === 1 ? '' : 's'}`
}

/** Full-screen status while the server restarts (spec: restore state across the restart). */
export function RestartScreen({ slow }: { slow: boolean }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-canvas p-6" data-testid="restore-restarting">
      <div className="max-w-sm space-y-3 text-center" role="status" aria-live="assertive">
        <Icon name="loader-circle" size="md" className="mx-auto animate-spin motion-reduce:animate-none" />
        <p className="text-base font-semibold text-default">Restoring and restarting…</p>
        <p className="text-meta text-muted">{slow
          ? 'The server is still restarting. If this takes more than a few minutes, check the server log. This page reloads when it is back.'
          : 'This page reloads when the server is back, usually within a few seconds.'}</p>
      </div>
    </div>
  )
}

interface DialogState {
  source: RestoreSource
  archive: string
  undo: boolean
  staged: StagedRestore | null
  askPassphrase: boolean
}

/** Data and flow of the restore section. Only rendered for the owner. */
export function RestoreSection({ offline }: { offline: boolean }) {
  const [state, setState] = useState<RestoreState | null>(null)
  const [archives, setArchives] = useState<{ destination: string; archives: RestoreArchive[] } | null>(null)
  const [archivesError, setArchivesError] = useState<string | null>(null)
  const [tab, setTab] = useState<RestoreSourceTab>('destination')
  const [uploadProgress, setUploadProgress] = useState<number | null>(null)
  const [preparing, setPreparing] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dialog, setDialog] = useState<DialogState | null>(null)
  const [dialogError, setDialogError] = useState<string | null>(null)
  const [dialogBusy, setDialogBusy] = useState(false)
  const [restarting, setRestarting] = useState<null | 'waiting' | 'slow'>(null)
  const [deleting, setDeleting] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setState(await api.restoreState())
    } catch (err) {
      if (!isNetworkError(err)) setError(restoreErrorMessage(err))
    }
    try {
      setArchives(await api.backupArchives())
      setArchivesError(null)
    } catch (err) {
      if (!isNetworkError(err)) setArchivesError(restoreErrorMessage(err))
    }
  }, [])
  useEffect(() => {
    if (!offline) void load()
  }, [offline, load])

  async function prepare(source: RestoreSource, archive: string, undo: boolean, passphrase?: string) {
    setError(null)
    setDialogError(null)
    try {
      const staged = await api.prepareRestore(source, passphrase)
      setDialog({ source, archive, undo, staged, askPassphrase: false })
    } catch (err) {
      if (needsPassphrase(err)) {
        setDialog({ source, archive, undo, staged: null, askPassphrase: true })
        if (passphrase) setDialogError(restoreErrorMessage(err))
      } else if (dialog || passphrase) {
        setDialogError(restoreErrorMessage(err))
      } else {
        setError(restoreErrorMessage(err))
      }
    }
  }

  async function preview(archive: string) {
    setPreparing(archive)
    await prepare({ archive }, archive, false)
    setPreparing(null)
  }

  async function upload(file: File) {
    setError(null)
    setUploadProgress(0)
    try {
      const staged = await api.uploadRestoreArchive(file, setUploadProgress)
      setUploadProgress(null)
      setPreparing('upload')
      await prepare({ upload: staged.id }, file.name, false)
    } catch (err) {
      setError(restoreErrorMessage(err))
    } finally {
      setUploadProgress(null)
      setPreparing(null)
    }
  }

  async function undo() {
    const copy = state?.last?.safetyCopy
    if (!copy) return
    setPreparing('undo')
    await prepare({ safetyCopy: copy }, copy, true)
    setPreparing(null)
  }

  async function verify(passphrase: string) {
    if (!dialog) return
    setDialogBusy(true)
    await prepare(dialog.source, dialog.archive, dialog.undo, passphrase)
    setDialogBusy(false)
  }

  async function confirm() {
    if (!dialog?.staged) return
    setDialogBusy(true)
    setDialogError(null)
    try {
      await api.confirmRestore(dialog.staged.id)
    } catch (err) {
      setDialogBusy(false)
      // A refused re-authentication leaves the dialog open with the reason.
      setDialogError(err instanceof ApiError && err.code === 'reauth_required' ? 'Confirm your identity to restore.' : restoreErrorMessage(err))
      if (err instanceof ApiError && err.code === 'not_found') setDialog(null)
      return
    }
    markRestoring()
    setDialog(null)
    setRestarting('waiting')
    const back = await waitForRestart()
    if (back) window.location.reload()
    else setRestarting('slow')
  }

  function cancel() {
    const id = dialog?.staged?.id ?? (dialog && 'upload' in dialog.source ? dialog.source.upload : undefined)
    setDialog(null)
    setDialogError(null)
    if (id) void api.cancelRestore(id).catch(() => undefined)
  }

  return (
    <>
      <RestoreSectionView offline={offline} state={state} archives={archives} archivesError={archivesError} tab={tab}
        uploadProgress={uploadProgress} preparing={preparing} error={error}
        onTab={setTab} onPreview={(a) => void preview(a)} onUpload={(f) => void upload(f)} onUndo={() => void undo()} onDeleteCopy={setDeleting} />
      {dialog && (
        <RestoreDialog staged={dialog.staged} archive={dialog.archive} undo={dialog.undo} askPassphrase={dialog.askPassphrase}
          error={dialogError} busy={dialogBusy} onVerify={(pw) => void verify(pw)} onConfirm={() => void confirm()} onCancel={cancel} />
      )}
      {deleting && (
        <ConfirmDialog title="Delete this safety copy?" confirmLabel="Delete safety copy"
          consequence={<>The database kept before that restore is removed from the server for good: <span className="user-text font-medium">{deleting}</span>.</>}
          onConfirm={async () => {
            try {
              await api.deleteSafetyCopy(deleting)
            } catch (err) {
              throw new Error(restoreErrorMessage(err))
            }
            await load()
          }}
          onCancel={() => setDeleting(null)} />
      )}
      {restarting && <RestartScreen slow={restarting === 'slow'} />}
    </>
  )
}
