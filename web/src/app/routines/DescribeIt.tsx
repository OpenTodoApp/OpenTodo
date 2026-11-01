// Describe it (OpenSpec change routines-describe-it, design D1-D5): one sentence
// becomes a routine draft that opens in the editor, unsaved. Offered only when
// the person can make an assistant turn: the server's assistant with consent,
// or for an encrypted account the on-device assistant set up and consented on
// this device (the draft then runs on the device and nothing reaches the
// server). A bottom sheet with one text field, never a centred modal
// (DECISIONS.md "Routines UX"). Never saves, enables, tests or runs.
import { useEffect, useMemo, useRef, useState } from 'react'
import { ApiError, api } from '../../lib/api'
import { getDeviceSetup } from '../../lib/assistantDevice/settings'
import { refreshAssistantStatus, useAssistantStatus, type AssistantStatus } from '../../lib/assistantStatus'
import { messageOf } from '../../lib/errorText'
import { t } from '../../lib/i18n'
import { useOnline } from '../../lib/online'
import type { Catalogue } from '../../lib/rules/catalogue'
import { draftNamesOf, editorDraftOf, MAX_DRAFT_TEXT, type DraftAnswer } from '../../lib/rules/describe'
import { Button, Dialog, Field, Notice, Textarea } from '../../ui'
import { navigate } from '../router'
import { useRoutineNames } from './data'
import { openDescribedDraft } from './routineNav'

/** Where Describe it runs: the server's assistant, this device's, or nowhere (not offered). */
export type DescribeMode = 'server' | 'device' | null

/** The mode from the assistant status and this device's setup (D1). */
export function describeMode(status: AssistantStatus | null, deviceProvider: string | null): DescribeMode {
  if (!status || status.reason === 'demo') return null
  if (status.mode === 'device') return deviceProvider && status.device?.consented_provider === deviceProvider ? 'device' : null
  return status.available && status.consented ? 'server' : null
}

/** Whether Describe it is offered here, and where it runs. */
export function useDescribeMode(): DescribeMode {
  const status = useAssistantStatus()
  const [deviceProvider, setDeviceProvider] = useState<string | null>(null)
  useEffect(() => { if (!status) void refreshAssistantStatus() }, [status])
  const device = status?.mode === 'device'
  useEffect(() => {
    if (!device) return
    let live = true
    void getDeviceSetup().then((s) => { if (live) setDeviceProvider(s?.provider ?? null) }, () => {})
    return () => { live = false }
  }, [device])
  return describeMode(status, deviceProvider)
}

/** The message for a draft that failed. */
function failure(e: unknown): string {
  if (e instanceof ApiError) {
    switch (e.code) {
      case 'assistant_quota': return t('This month’s assistant allowance is used. Describe it works again when it resets.')
      case 'rate_limited': return t('That is a lot of drafts in an hour. Try again later.')
      case 'turn_in_progress': return t('The assistant is still answering something else. Try again in a moment.')
    }
  }
  return messageOf(e)
}

/** The Describe it sheet: a sentence, then Draft. */
export function DescribeSheet({ mode, catalogue, onClose }: { mode: Exclude<DescribeMode, null>; catalogue: Catalogue | null; onClose: () => void }) {
  const online = useOnline()
  const names = useRoutineNames()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [note, setNote] = useState('')
  const abort = useRef<AbortController | null>(null)
  useEffect(() => () => abort.current?.abort(), [])
  const context = useMemo(() => draftNamesOf(names), [names])
  const tooLong = [...text].length > MAX_DRAFT_TEXT
  const submit = async () => {
    const sentence = text.trim()
    if (!sentence || tooLong || busy || !online) return
    setBusy(true)
    setError('')
    setNote('')
    abort.current = new AbortController()
    try {
      let ans: DraftAnswer
      if (mode === 'device') {
        // Encrypted accounts (D5): the device's provider and key, the decrypted names; nothing reaches the server.
        const { draftOnDevice } = await import('../../lib/rules/describeDevice')
        ans = await draftOnDevice(sentence, context, catalogue, abort.current.signal)
      } else {
        ans = await api.draftRoutine(sentence)
      }
      if (!ans.draft) {
        setNote(ans.note || t('The assistant did not draft a routine. Try saying what should happen, and when.'))
        return
      }
      onClose()
      openDescribedDraft(editorDraftOf(ans.draft), { note: ans.note })
    } catch (e) {
      if (!abort.current?.signal.aborted) setError(failure(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Dialog title={t('Describe a routine')} onClose={onClose} size="md" placement="sheet" testId="describe-routine">
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void submit() }} data-describe-form>
        <Field label={t('Describe what should happen, and when')}
          description={t('For example: every Friday at five, make tasks in Errands from my Groceries note.')}
          error={tooLong ? t('At most {n} characters', { n: MAX_DRAFT_TEXT }) : undefined}>
          <Textarea autoFocus value={text} rows={3} onChange={(e) => setText(e.target.value)} data-describe-text
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void submit() } }} />
        </Field>
        <p className="text-meta text-muted">
          {mode === 'device'
            ? t('Your sentence and the names of your projects, sections, labels, views and webhooks go from this device to your assistant provider. Nothing is saved until you save the routine.')
            : t('Your sentence and the names of your projects, sections, labels, views and webhooks go to the assistant’s provider. Nothing is saved until you save the routine.')}
        </p>
        {!online && <Notice tone="warning">{t('Describe it needs a connection to the assistant’s provider.')}</Notice>}
        {note && <div data-describe-note><Notice tone="info"><span className="user-text">{note}</span></Notice></div>}
        {error && <div data-describe-error><Notice tone="danger">{error}</Notice></div>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>{t('Cancel')}</Button>
          <Button type="submit" variant="primary" size="sm" icon="message-circle" busy={busy} disabled={!online || !text.trim() || tooLong} data-describe-submit>{t('Draft')}</Button>
        </div>
      </form>
    </Dialog>
  )
}

/** Where to set the assistant up (the palette's hint when Describe it is not offered). */
export const openAssistantSetup = () => navigate({ view: 'settings', section: 'integrations', page: 'assistant' })
