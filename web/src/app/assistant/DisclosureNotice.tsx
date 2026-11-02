// The one-time notice that the assistant's list of what it may send is now
// complete (OpenSpec change assistant-disclosure-notice): for people whose
// consent names an older, shorter list. It never asks for consent again and
// pauses nothing. Review the list shows the full list in place, Turn off the
// assistant withdraws the consent (as Settings does), and Got it records on the
// server that this version was seen, so no device shows it again.
import { useId, useState } from 'react'
import { api } from '../../lib/api'
import { disclosureField } from '../../lib/assistantDisclosure'
import { setAssistantStatus, type AssistantStatus } from '../../lib/assistantStatus'
import { t } from '../../lib/i18n'
import { refreshCapabilities } from '../../lib/relay'
import { Button } from '../../ui'
import { actionErrorMessage } from '../actionError'
import { RoutinesDisclosure } from './RoutinesDisclosure'

export interface DisclosureNoticeViewProps {
  /** The list as `GET /api/v1/me/assistant` sends it (the device's in device mode). */
  fields: string[]
  /** The routines paragraph belongs to the server's assistant. */
  device: boolean
  connected: boolean
  error?: string | null
  /** Start with the list open (stories). */
  open?: boolean
  onSeen: () => unknown
  onTurnOff: () => unknown
}

/** The notice without state (rendered to markup in tests and stories). */
export function DisclosureNoticeView({ fields, device, connected, error, open: initial = false, onSeen, onTurnOff }: DisclosureNoticeViewProps) {
  const [open, setOpen] = useState(initial)
  const listId = useId()
  const titleId = useId()
  return (
    <section className="space-y-2 rounded-card border border-default bg-sunken px-3 py-2 text-body text-default dark:bg-raised" aria-labelledby={titleId} data-disclosure-notice>
      <h3 id={titleId} className="font-medium">{t('The list of what the assistant sends is now complete')}</h3>
      <p>{t('It now names everything the assistant could already read and send to the model provider, such as notes, tracked time, routines, calendar frames and attachment names. Nothing new is sent, and your consent still counts.')}</p>
      {open && (
        <div id={listId} className="space-y-2" data-disclosure-notice-list>
          <ul className="list-disc space-y-0.5 pl-5">
            {fields.map((f) => <li key={f}>{disclosureField(f)}</li>)}
          </ul>
          <p>{t('In shared projects this includes text other members wrote.')}</p>
          {!device && <RoutinesDisclosure />}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" aria-expanded={open} aria-controls={listId} onClick={() => setOpen(!open)} data-disclosure-review>
          {open ? t('Hide the list') : t('Review the list')}
        </Button>
        <Button size="sm" variant="ghost" disabled={!connected} onClick={onTurnOff} data-disclosure-off>{t('Turn off the assistant')}</Button>
        <Button size="sm" variant="primary" disabled={!connected} onClick={onSeen} data-disclosure-seen>{t('Got it')}</Button>
      </div>
      {!connected && <p className="text-meta">{t('Closing this notice needs a connection.')}</p>}
      {error && <p role="alert" className="text-meta text-danger">{error}</p>}
    </section>
  )
}

/**
 * The notice for this status, or nothing. `onStatus` receives the status after
 * Got it or Turn off (the panel keeps its own copy); the shared copy is updated too.
 */
export function DisclosureNotice({ status, connected, onStatus }: { status: AssistantStatus | null; connected: boolean; onStatus?: (s: AssistantStatus) => void }) {
  const [error, setError] = useState<string | null>(null)
  if (!status?.disclosure_notice) return null
  const run = async (call: () => Promise<AssistantStatus>, after?: () => unknown) => {
    setError(null)
    try {
      const next = await call()
      setAssistantStatus(next)
      onStatus?.(next)
      await after?.()
    } catch (err) {
      setError(actionErrorMessage(err))
    }
  }
  return (
    <DisclosureNoticeView fields={status.fields} device={status.mode === 'device'} connected={connected} error={error}
      onSeen={() => run(api.assistantDisclosureSeen)}
      // Withdrawing the consent is the off switch (Settings → Integrations → Assistant); a device announces its capabilities again.
      onTurnOff={() => run(() => api.setMyAssistant({ consent: false }), refreshCapabilities)} />
  )
}
