// Publishing a note page from the note's menu (OpenSpec note-public-links,
// "Publishing from a note"): an optional label from the title and an expiry, then the
// link shown once with a copy button. With a page active the same dialog shows its
// status, "Copy a new link" (republish) and "Revoke". Loaded only when opened; the
// menu disables it offline, since pages need a connection.
import { useEffect, useState } from 'react'
import { formatInstant } from '../../lib/dates'
import { t } from '../../lib/i18n'
import { notePageEncrypted, publishNotePage, revokeNotePage } from '../../lib/notePages'
import type { Note, NotePageCreated, NotePageStatus } from '../../lib/types'
import { Button, Dialog, Field, Input, Notice, Select } from '../../ui'
import { act } from '../actionError'
import { copyText } from '../../lib/clipboard'
import { labelFromTitle } from '../../lib/taskPages'

export default function NotePageDialog({ note, status, onClose }: { note: Note; status: NotePageStatus | null; onClose: () => void }) {
  const [encrypted, setEncrypted] = useState<boolean | null>(null)
  const [label, setLabel] = useState(status?.label ?? '')
  const [days, setDays] = useState('0')
  const [created, setCreated] = useState<NotePageCreated | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    void notePageEncrypted(note).then((on) => {
      setEncrypted(on)
      // A label is visible to the server: never suggest one from an encrypted title.
      if (!on && !status) setLabel(labelFromTitle(note.title))
    })
  }, [note, status])

  const publish = async () => {
    setError('')
    try {
      setCreated(await publishNotePage(note, { label: label.trim() || undefined, expiresInDays: Number(days) || undefined }))
    } catch (err) {
      setError(err instanceof Error && err.message === 'locked' ? t('Unlock encryption on this device to publish this note.') : t('Publishing failed. Try again.'))
    }
  }

  const revoke = () => act(revokeNotePage(note.id).then(onClose))

  if (created) {
    return (
      <Dialog title={t('Note page published')} onClose={onClose} size="md" testId="note-page-dialog">
        <div className="space-y-3">
          <Field label={t('Link to share')} description={t('Copy it now: it will not be shown again. Anyone with the link can read the note.')}>
            <Input readOnly value={created.link} onFocus={(e) => e.currentTarget.select()} data-page-link />
          </Field>
          {created.encrypted && <Notice>{t('This note is end-to-end encrypted: the part of the link after # opens it, and the server never receives it. Images and files are not shown on encrypted pages.')}</Notice>}
          <div className="flex flex-wrap justify-end gap-2">
            {copied && <span role="status" className="self-center text-meta text-muted">{t('Link copied')}</span>}
            <Button icon="copy" onClick={() => void copyText(created.link).then(() => setCopied(true), () => {})} data-page-copy>{t('Copy link')}</Button>
            <Button variant="primary" onClick={onClose} data-page-close>{t('Close')}</Button>
          </div>
        </div>
      </Dialog>
    )
  }

  return (
    <Dialog title={status ? t('Note page') : t('Publish note page')} onClose={onClose} size="md" testId="note-page-dialog">
      <div className="space-y-4">
        {status && (
          <div className="space-y-1 rounded-control bg-sunken px-3 py-2 text-meta text-muted" data-page-status>
            <p>{t('Published {time}', { time: formatInstant(status.publishedAt, 'datetime') })}{status.lastOpenedAt ? ` · ${t('last opened {time}', { time: formatInstant(status.lastOpenedAt, 'datetime') })}` : ''}</p>
            {status.expiresAt && <p>{t('Expires {time}', { time: formatInstant(status.expiresAt, 'datetime') })}</p>}
          </div>
        )}
        <Field label={t('Label (optional)')} description={encrypted ? t('Shown after the link’s secret. The server can read it, so keep the note’s content out of it.') : t('Shown after the link’s secret, to say what the page is about. Lowercase letters, digits and hyphens.')}>
          <Input value={label} maxLength={40} pattern="[a-z0-9-]*" onChange={(e) => setLabel(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))} data-page-label />
        </Field>
        <Field label={t('Expires')}>
          <Select value={days} onChange={(e) => setDays(e.target.value)} data-page-expiry>
            <option value="0">{t('Never')}</option>
            <option value="7">{t('In 7 days')}</option>
            <option value="30">{t('In 30 days')}</option>
            <option value="90">{t('In 90 days')}</option>
          </Select>
        </Field>
        <Notice>{t('Anyone with the link can read the note, without an account. It is read-only.')}</Notice>
        {error && <Notice tone="danger">{error}</Notice>}
        <div className="flex flex-wrap justify-end gap-2">
          {status && <Button variant="danger" onClick={revoke} data-page-revoke>{t('Revoke')}</Button>}
          <Button variant="primary" icon="globe" onClick={() => void publish()} disabled={encrypted === null} data-page-publish>{status ? t('Copy a new link') : t('Publish')}</Button>
        </div>
      </div>
    </Dialog>
  )
}
