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
import { t } from '../lib/i18n'

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
        <h3 id="restore-heading" className="text-body font-medium text-default">{t('Restore from a backup')}</h3>
        <p className="text-meta text-muted">
          {t.rich('Puts the whole server back to the state in an archive: every account, project, task and the sync log. The server restarts, and everything is checked before anything changes. On a stopped server you can also use the <a>command line</a>.', { a: (chunks) => <a className="underline" href="/help/backups" onClick={(e) => { e.preventDefault(); navigate({ view: 'help', page: 'backups' }) }}>{chunks}</a> })}
        </p>
      </div>
      {p.offline && <Notice tone="warning">{t('Restoring runs on the server and needs a connection.')}</Notice>}

      {last && (
        <div data-testid="restore-last">
          {last.ok ? (
            <Notice tone="success" action={p.state?.undoAvailable ? <Button variant="secondary" icon="undo-2" disabled={disabled} busy={p.preparing === 'undo'} onClick={p.onUndo}>{t('Undo last restore')}</Button> : undefined}>
              {t.rich('Restored from <span>{archive}</span> on {instant}.', { archive: last.archive, instant: dt.formatInstant(last.finishedAt, 'datetime'), span: (chunks) => <span className="user-text font-medium">{chunks}</span> })}
            </Notice>
          ) : (
            <Notice tone="danger">
              {t.rich('The restore of <span>{archive}</span> on {instant} failed, and the server kept its previous data. {error}', { archive: last.archive, instant: dt.formatInstant(last.finishedAt, 'datetime'), error: last.error, span: (chunks) => <span className="user-text font-medium">{chunks}</span> })}
            </Notice>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-4 text-body text-default" role="radiogroup" aria-label={t('Restore from')}>
        {(['destination', 'upload'] as RestoreSourceTab[]).map((item) => (
          <label key={item} className="flex items-center gap-1.5">
            <input type="radio" className="accent-(--ot-accent)" name="restore-source" value={item} checked={p.tab === item} disabled={p.offline} onChange={() => p.onTab(item)} />
            {item === 'destination' ? t('From the backup destination') : t('Upload a file')}
          </label>
        ))}
      </div>

      {p.tab === 'destination' && (
        <div data-testid="restore-archives">
          {p.archivesError && <Notice tone="danger">{t('{archivesError} You can still upload an archive.', { archivesError: p.archivesError })}</Notice>}
          {!p.archivesError && p.archives === null && <p className="text-meta text-faint">{p.offline ? t('Not available offline.') : t('Loading archives…')}</p>}
          {p.archives && p.archives.archives.length === 0 && <p className="text-meta text-faint">{t.rich('No archives in <span>{destination}</span> yet.', { destination: p.archives.destination, span: (chunks) => <span className="user-text">{chunks}</span> })}</p>}
          {p.archives && p.archives.archives.length > 0 && (
            <ul className="-mx-3" aria-label={t('Archives in the destination')}>
              {p.archives.archives.map((a) => (
                <li key={a.name}>
                  <ListRow
                    leading={<Icon name="history" size="md" />}
                    label={dt.formatInstant(a.createdAt, 'datetime')}
                    ariaLabel={(a.encrypted ? t('Archive from {instant}, {size}, encrypted', { instant: dt.formatInstant(a.createdAt, 'datetime'), size: formatBytes(a.size) }) : t('Archive from {instant}, {size}', { instant: dt.formatInstant(a.createdAt, 'datetime'), size: formatBytes(a.size) }))}
                    meta={`${formatBytes(a.size)} · ${a.name}`}
                    badges={<>{a.encrypted && <Badge hue="slate"><Icon name="lock" size="xs" /> {t('encrypted')}</Badge>}
                      <Button variant="secondary" disabled={disabled} busy={p.preparing === a.name} onClick={() => p.onPreview(a.name)}>{t('Preview')}</Button></>}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {p.tab === 'upload' && (
        <div className="space-y-2" data-testid="restore-upload">
          <p className="text-meta text-muted">{t.rich('An archive made by OpenTodo ({name}, optionally {suffix}), for example from another server.', { name: <code className="font-mono">opentodo-….tar.gz</code>, suffix: <code className="font-mono">.enc</code> })}</p>
          <input ref={fileInput} type="file" className="sr-only" accept=".tar,.gz,.enc,application/gzip,application/x-tar,application/octet-stream" aria-label={t('Archive file')} tabIndex={-1}
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) p.onUpload(f) }} />
          <Button variant="secondary" icon="upload" disabled={disabled} onClick={() => fileInput.current?.click()}>{t('Choose an archive…')}</Button>
          {p.uploadProgress !== null && (
            <div role="status" aria-live="polite" className="text-meta text-muted" data-testid="restore-upload-progress">
              <progress className="mr-2 align-middle" max={1} value={p.uploadProgress} aria-label={t('Upload progress')} />{' '}{t('Uploading… {round}%', { round: Math.round(p.uploadProgress * 100) })}
            </div>
          )}
          {p.state && p.state.uploadLimit >= 0 && <p className="text-meta text-faint">{t('Up to {bytes} with the free space on the server.', { bytes: formatBytes(p.state.uploadLimit) })}</p>}
        </div>
      )}

      {p.error && <Notice tone="danger">{p.error}</Notice>}

      {copies.length > 0 && (
        <div data-testid="restore-safety-copies">
          <h4 className="text-meta font-medium text-default">{t('Safety copies ({bytes})', { bytes: formatBytes(copiesSize) })}</h4>
          <p className="text-meta text-faint">{t('Each restore keeps the database it replaced. Delete old ones to free space.')}</p>
          <ul className="-mx-3" aria-label={t('Safety copies')}>
            {copies.map((c) => (
              <li key={c.name}>
                <ListRow leading={<Icon name="history" size="md" />} label={t('Before the restore of {instant}', { instant: dt.formatInstant(c.createdAt, 'datetime') })} meta={`${formatBytes(c.size)} · ${c.name}`}
                  ariaLabel={t('Safety copy from {instant}, {size}', { instant: dt.formatInstant(c.createdAt, 'datetime'), size: formatBytes(c.size) })}
                  badges={<Button variant="ghost" icon="trash-2" disabled={p.offline} aria-label={t('Delete safety copy {name}', { name: c.name })} onClick={() => p.onDeleteCopy(c.name)}>{t('Delete')}</Button>} />
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
    <Dialog title={p.undo ? t('Undo the last restore') : t('Restore from a backup')} onClose={p.onCancel} dismissable={false} size="md" testId="restore-dialog">
      <div className="space-y-4 text-body text-default">
        {!s && p.askPassphrase && (
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); p.onVerify(passphrase) }}>
            <p>{t.rich('<span>{archive}</span> is encrypted with a passphrase this server does not have.', { archive: p.archive, span: (chunks) => <span className="user-text font-medium">{chunks}</span> })}</p>
            <Field label={t('Passphrase')}>
              <Input type="password" name="restore-passphrase" autoComplete="off" autoFocus value={passphrase} onChange={(e) => setPassphrase(e.target.value)} />
            </Field>
            {p.error && <p role="alert" className="text-meta text-danger">{p.error}</p>}
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="secondary" onClick={p.onCancel}>{t('Cancel')}</Button>
              <Button type="submit" variant="primary" disabled={passphrase === '' || p.busy} busy={p.busy}>{t('Verify')}</Button>
            </div>
          </form>
        )}
        {s && (
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (word === 'RESTORE') p.onConfirm() }}>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1" data-testid="restore-preview">
              <dt className="text-muted">{p.undo ? t('Database from') : t('Backup from')}</dt><dd>{created ? dt.formatInstant(created, 'datetime') : t('unknown')}</dd>
              {s.manifest?.appVersion && <><dt className="text-muted">{t('Made by')}</dt><dd>{t('OpenTodo {appVersion}', { appVersion: s.manifest.appVersion })}</dd></>}
              <dt className="text-muted">{t('Schema version')}</dt><dd>{s.manifest?.schemaVersion}</dd>
              <dt className="text-muted">{t('Size')}</dt><dd>{formatBytes(s.size)}{s.encrypted ? ` · ${t('encrypted')}` : ''}</dd>
              {s.counts && <><dt className="text-muted">{t('Contains')}</dt><dd>{t('{accounts, plural, one {# account} other {# accounts}}, {projects, plural, one {# project} other {# projects}}, {tasks, plural, one {# task} other {# tasks}}', { accounts: s.counts.accounts, projects: s.counts.projects, tasks: s.counts.tasks })}</dd></>}
            </dl>
            <div className="rounded-control bg-warning-soft p-3 text-meta text-on-warning-soft" data-testid="restore-consequences">
              <p className="font-medium">{t('What will happen')}</p>
              <ul className="ml-4 list-disc space-y-1">
                <li>{t('The server restarts. Everyone is briefly disconnected.')}</li>
                <li>{t('Accounts, passwords, sessions and tokens go back to the state in the backup. Anyone whose session started after it, possibly you, signs in again.')}</li>
                <li>{t('Devices sync again. A device that changed something after the backup sends those newer changes back, so they are not lost.')}</li>
                <li>{t('The current database is kept as a safety copy, so you can undo this.')}</li>
              </ul>
            </div>
            <Field label={t('Type RESTORE to confirm')}>
              <Input name="restore-confirm" autoComplete="off" autoCapitalize="characters" spellCheck={false} value={word} onChange={(e) => setWord(e.target.value)} />
            </Field>
            {p.error && <p role="alert" className="text-meta text-danger">{p.error}</p>}
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="secondary" onClick={p.onCancel} data-autofocus>{t('Cancel')}</Button>
              <Button type="submit" variant="danger" className="border border-current" disabled={word !== 'RESTORE' || p.busy} busy={p.busy}>{t('Restore and restart')}</Button>
            </div>
          </form>
        )}
      </div>
    </Dialog>
  )
}

/** Full-screen status while the server restarts (spec: restore state across the restart). */
export function RestartScreen({ slow }: { slow: boolean }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-canvas p-6" data-testid="restore-restarting">
      <div className="max-w-sm space-y-3 text-center" role="status" aria-live="assertive">
        <Icon name="loader-circle" size="md" className="mx-auto animate-spin motion-reduce:animate-none" />
        <p className="text-body font-semibold text-default">{t('Restoring and restarting…')}</p>
        <p className="text-meta text-muted">{slow
          ? t('The server is still restarting. If this takes more than a few minutes, check the server log. This page reloads when it is back.')
          : t('This page reloads when the server is back, usually within a few seconds.')}</p>
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
      setDialogError(err instanceof ApiError && err.code === 'reauth_required' ? t('Confirm your identity to restore.') : restoreErrorMessage(err))
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
        <ConfirmDialog title={t('Delete this safety copy?')} confirmLabel={t('Delete safety copy')}
          consequence={<>{t.rich('The database kept before that restore is removed from the server for good: <span>{deleting}</span>.', { deleting, span: (chunks) => <span className="user-text font-medium">{chunks}</span> })}</>}
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
