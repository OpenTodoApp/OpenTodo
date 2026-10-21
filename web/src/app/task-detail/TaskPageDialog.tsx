// Publishing a task page from the task panel (OpenSpec task-pages, "Publishing from
// the task panel"): what guests may do, an optional label, an expiry and the map,
// then the link shown once with a copy button. With a page active the same dialog
// shows its status, "Copy a new link" (republish) and "Revoke". Pages need a
// connection; the panel disables the menu item offline.
import { useEffect, useId, useState } from 'react'
import { api } from '../../lib/api'
import { formatInstant } from '../../lib/dates'
import { t } from '../../lib/i18n'
import { locationOf } from '../../lib/locations'
import { publishTaskPage, taskPageEncrypted } from '../../lib/taskPages'
import type { Task, TaskPageCreated, TaskPageRights, TaskPageStatus } from '../../lib/types'
import { Button, Dialog, Field, Input, Select, Switch } from '../../ui'
import { Notice } from '../../ui'
import { act } from '../actionError'
import { setTaskPageStatus } from './taskPageStatus'

const RIGHTS: { value: TaskPageRights; label: () => string; hint: () => string }[] = [
  { value: 'view', label: () => t('Read'), hint: () => t('Guests can read the task.') },
  { value: 'reply', label: () => t('Reply'), hint: () => t('Guests can read and reply.') },
  { value: 'tick', label: () => t('Reply and tick'), hint: () => t('Guests can reply, tick subtasks and mark the task done.') },
]

/** A label from the title: lowercase letters, digits and hyphens, at most 40. */
export function labelFromTitle(title: string): string {
  return title.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '')
}

export function TaskPageDialog({ task, status, onClose }: { task: Task; status: TaskPageStatus | null; onClose: () => void }) {
  const [encrypted, setEncrypted] = useState<boolean | null>(null)
  const [rights, setRights] = useState<TaskPageRights>(status?.rights ?? 'reply')
  const [label, setLabel] = useState(status?.label ?? '')
  const [days, setDays] = useState('0')
  const [includeMap, setIncludeMap] = useState(status?.includeMap ?? true)
  const [created, setCreated] = useState<TaskPageCreated | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')
  const linkId = useId()
  const hasLocation = locationOf(task) !== null

  useEffect(() => {
    void taskPageEncrypted(task).then((on) => {
      setEncrypted(on)
      // A label is visible to the server: never suggest one from an encrypted title.
      if (!on && !status) setLabel(labelFromTitle(task.title))
    })
  }, [task, status])

  const publish = async () => {
    setError('')
    try {
      const me = await api.me()
      const res = await publishTaskPage(task, { rights, label: label.trim() || undefined, expiresInDays: Number(days) || undefined, includeMap: hasLocation ? includeMap : false }, me.user.name)
      setCreated(res)
      setTaskPageStatus(task.id, await api.taskPageStatus(task.id).catch(() => null))
    } catch (err) {
      setError(err instanceof Error && err.message === 'locked' ? t('Unlock encryption on this device to publish this task.') : err instanceof Error ? err.message : t('Publishing failed. Try again.'))
    }
  }

  const revoke = () => act(api.revokeTaskPage(task.id).then(() => {
    setTaskPageStatus(task.id, null)
    onClose()
  }))

  const copy = () => {
    if (!created) return
    void navigator.clipboard?.writeText(created.link).then(() => setCopied(true), () => {})
  }

  if (created) {
    return (
      <Dialog title={t('Task page published')} onClose={onClose} size="md" testId="task-page-dialog">
        <div className="space-y-3">
          <Field label={t('Link to share')} description={t('Copy it now: it will not be shown again. Anyone with the link can open the page.')}>
            <Input id={linkId} readOnly value={created.link} onFocus={(e) => e.currentTarget.select()} data-page-link />
          </Field>
          {created.encrypted && <Notice>{t('This task is end-to-end encrypted: the part of the link after # opens it, and the server never receives it.')}</Notice>}
          <div className="flex flex-wrap justify-end gap-2">
            {copied && <span role="status" className="self-center text-meta text-muted">{t('Link copied')}</span>}
            <Button icon="copy" onClick={copy} data-page-copy>{t('Copy link')}</Button>
            <Button variant="primary" onClick={onClose}>{t('Done')}</Button>
          </div>
        </div>
      </Dialog>
    )
  }

  return (
    <Dialog title={status ? t('Task page') : t('Publish task page')} onClose={onClose} size="md" testId="task-page-dialog">
      <div className="space-y-4">
        {status && (
          <div className="space-y-1 rounded-control bg-sunken px-3 py-2 text-meta text-muted" data-page-status>
            <p>{t('Published {time}', { time: formatInstant(status.publishedAt, 'datetime') })} · {RIGHTS.find((r) => r.value === status.rights)?.label()}</p>
            <p>{t('{n, plural, one {# reply} other {# replies}} from guests', { n: status.replies })}{status.lastOpenedAt ? ` · ${t('last opened {time}', { time: formatInstant(status.lastOpenedAt, 'datetime') })}` : ''}</p>
            {status.expiresAt && <p>{t('Expires {time}', { time: formatInstant(status.expiresAt, 'datetime') })}</p>}
          </div>
        )}
        <fieldset className="space-y-1">
          <legend className="mb-1 text-meta font-medium text-default">{t('Guests can')}</legend>
          {RIGHTS.map((r) => (
            <label key={r.value} className="flex min-h-11 cursor-pointer items-start gap-2 py-1">
              <input type="radio" name="page-rights" className="mt-1" checked={rights === r.value} onChange={() => setRights(r.value)} data-page-rights={r.value} />
              <span><span className="block text-body text-default">{r.label()}</span><span className="block text-meta text-muted">{r.hint()}</span></span>
            </label>
          ))}
        </fieldset>
        <Field label={t('Label (optional)')} description={encrypted ? t('Shown after the link’s secret. The server can read it, so keep the task’s content out of it.') : t('Shown after the link’s secret, to say what the page is about. Lowercase letters, digits and hyphens.')}>
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
        {hasLocation && <Switch checked={includeMap} onChange={setIncludeMap} label={t('Show the map')} description={t('Guests see where the task happens.')} />}
        <Notice>{t('Anyone with the link can open the page, without an account.')}</Notice>
        {error && <Notice tone="danger">{error}</Notice>}
        <div className="flex flex-wrap justify-end gap-2">
          {status && <Button variant="danger" onClick={revoke} data-page-revoke>{t('Revoke')}</Button>}
          <Button variant="primary" icon="globe" onClick={publish} disabled={encrypted === null} data-page-publish>{status ? t('Copy a new link') : t('Publish')}</Button>
        </div>
      </div>
    </Dialog>
  )
}
