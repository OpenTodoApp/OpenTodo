// A pasted list in a single-line field (OpenSpec change paste-to-tasks, design D1,
// D6, D7): the paste is held back and an offer anchored to the field asks whether to
// add one task (or subtask) per line or paste the lines as one line. Shared by quick
// add (all three layouts) and the Add subtask field.
import { type ClipboardEvent, type RefObject, useState } from 'react'
import { t } from '../../lib/i18n'
import { messageOf } from '../../lib/errorText'
import { joinPastedLines, MAX_PASTED_LINES, splitPastedLines } from '../../lib/pasteLines'
import { Button, Popover } from '../../ui'
import { navigate } from '../router'

/** How many cleaned lines the offer shows before "and N more". */
export const PREVIEW_LINES = 5

interface Pending {
  lines: string[]
  /** The raw text, for "Paste as one line". */
  text: string
}

/**
 * The field's paste handler and the offer. A paste is held back only when the field
 * is empty or wholly selected and the text holds at least two lines after cleanup;
 * any other paste goes in as the browser does.
 */
export function usePasteOffer({ field, kind, onConfirm, onPasteAsLine }: {
  field: RefObject<HTMLInputElement | null>
  kind: 'tasks' | 'subtasks'
  /** Adds the cleaned lines; a rejection is shown in the offer and nothing is closed. */
  onConfirm: (lines: string[]) => Promise<void>
  /** Puts the lines, joined by spaces, into the empty field. */
  onPasteAsLine: (text: string) => void
}) {
  const [pending, setPending] = useState<Pending | null>(null)

  function onPaste(e: ClipboardEvent<HTMLInputElement>) {
    const text = e.clipboardData?.getData('text/plain') ?? ''
    const el = e.currentTarget
    const whole = el.value === '' || (el.selectionStart === 0 && el.selectionEnd === el.value.length)
    if (!whole) return
    const lines = splitPastedLines(text)
    if (lines.length < 2) return
    e.preventDefault()
    setPending({ lines, text })
  }

  const offer = pending ? (
    <PasteOfferPanel anchor={field} kind={kind} lines={pending.lines}
      onClose={() => setPending(null)}
      onConfirm={async () => { await onConfirm(pending.lines); setPending(null) }}
      onPasteAsLine={() => { setPending(null); onPasteAsLine(joinPastedLines(pending.text)) }} />
  ) : null
  return { onPaste, offer, open: pending !== null }
}

/** The offer itself: the count, five previews and "and N more", or the over-100 note with Import. */
export function PasteOfferPanel({ anchor, kind, lines, onClose, onConfirm, onPasteAsLine }: {
  anchor: RefObject<HTMLElement | null>
  kind: 'tasks' | 'subtasks'
  lines: readonly string[]
  onClose: () => void
  onConfirm: () => Promise<void>
  onPasteAsLine: () => void
}) {
  const [error, setError] = useState<string | null>(null)
  const n = lines.length
  const tooMany = n > MAX_PASTED_LINES
  const question = kind === 'subtasks'
    ? t('{n, plural, one {Add # subtask, one per line?} other {Add # subtasks, one per line?}}', { n })
    : t('{n, plural, one {Add # task, one per line?} other {Add # tasks, one per line?}}', { n })
  const confirm = async () => {
    setError(null)
    try {
      await onConfirm()
    } catch (err) {
      setError(messageOf(err))
    }
  }
  return (
    <Popover open onClose={onClose} anchor={anchor} label={tooMany ? t('Too many lines') : question} align="start" width="sm:w-80" className="p-3">
      <div data-paste-offer={tooMany ? 'too-many' : 'add'} className="space-y-3">
        {tooMany ? (
          <p className="text-body text-default">{t('That is more than {max} lines. Use Import for long lists.', { max: MAX_PASTED_LINES })}</p>
        ) : (
          <>
            {/* On a phone the sheet's title already asks the question. */}
            <p className="text-body font-semibold text-default max-sm:sr-only">{question}</p>
            <ul className="space-y-1 text-body text-muted" data-paste-preview>
              {lines.slice(0, PREVIEW_LINES).map((line, i) => <li key={i} className="truncate">{line}</li>)}
              {n > PREVIEW_LINES && <li className="text-faint" data-paste-more>{t('{n, plural, one {and # more} other {and # more}}', { n: n - PREVIEW_LINES })}</li>}
            </ul>
          </>
        )}
        {error && <p role="alert" className="text-meta text-danger" data-paste-error>{error}</p>}
        <div className="flex flex-wrap justify-end gap-2">
          {tooMany ? (
            <>
              <Button variant="secondary" size="sm" onClick={onPasteAsLine} data-paste-one-line>{t('Paste as one line')}</Button>
              <Button variant="primary" size="sm" autoFocus onClick={() => { onClose(); navigate({ view: 'import' }) }} data-paste-import>{t('Import')}</Button>
            </>
          ) : (
            <>
              <Button variant="secondary" size="sm" onClick={onPasteAsLine} data-paste-one-line>{t('Paste as one line')}</Button>
              <Button variant="primary" size="sm" autoFocus onClick={confirm} data-paste-add>
                {kind === 'subtasks'
                  ? t('{n, plural, one {Add # subtask} other {Add # subtasks}}', { n })
                  : t('{n, plural, one {Add # task} other {Add # tasks}}', { n })}
              </Button>
            </>
          )}
        </div>
      </div>
    </Popover>
  )
}
