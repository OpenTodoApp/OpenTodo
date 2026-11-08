// Save bar and draft state (OpenSpec change settings-foundation, design D8): a form
// of several fields that belong together keeps a draft of the saved value; while
// the draft differs, a bar at the bottom of the column offers Discard and Save.
// Single controls never use it: they save when they change. Asking before leaving
// with unsaved changes is the screen's job (the router's leave guard lives in app/).
import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { Button } from '../Button'
import { t } from '../../lib/i18n'

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

export interface Draft<T> {
  draft: T
  /** Replace some fields of the draft. */
  set: (patch: Partial<T>) => void
  dirty: boolean
  /** Back to the saved value (Discard, or after the saved value changed). */
  reset: () => void
  /** True while any field reported itself invalid. */
  invalid: boolean
  /** A field reports whether its value is valid (for example a NumberInput out of range). */
  setValid: (field: string, valid: boolean) => void
}

/**
 * A draft of `saved`. When `saved` changes (a save, a sync, another device), a
 * clean draft follows it; a dirty one keeps the person's edits.
 */
export function useDraft<T extends object>(saved: T): Draft<T> {
  const [base, setBase] = useState(saved)
  const [draft, setDraft] = useState(saved)
  const [bad, setBad] = useState<ReadonlySet<string>>(new Set())
  if (!same(base, saved)) {
    // React's "adjust state while rendering" pattern: follow a new saved value.
    setBase(saved)
    if (same(draft, base)) setDraft(saved)
  }
  const set = useCallback((patch: Partial<T>) => setDraft((d) => ({ ...d, ...patch })), [])
  const reset = useCallback(() => { setDraft(saved); setBad(new Set()) }, [saved])
  const setValid = useCallback((field: string, valid: boolean) => setBad((cur) => {
    if (valid === !cur.has(field)) return cur
    const next = new Set(cur)
    if (valid) next.delete(field)
    else next.add(field)
    return next
  }), [])
  const dirty = useMemo(() => !same(draft, saved), [draft, saved])
  return { draft, set, dirty, reset, invalid: bad.size > 0, setValid }
}

export interface SaveBarProps {
  dirty: boolean
  invalid?: boolean
  /** Offline or otherwise unable to save; the reason is shown in the bar. */
  disabledReason?: ReactNode
  busy?: boolean
  /** The last save's failure, shown in the bar until the next attempt. */
  error?: ReactNode
  onSave: () => void
  onDiscard: () => void
}

/** Shown only while there are unsaved changes, sticky at the bottom of the settings column. */
export function SaveBar({ dirty, invalid, disabledReason, busy, error, onSave, onDiscard }: SaveBarProps) {
  if (!dirty) return null
  return (
    <div role="region" aria-label={t('Unsaved changes')} data-save-bar
      className="sticky bottom-3 z-10 mt-4 flex flex-wrap items-center gap-3 rounded-card border border-default bg-raised px-4 py-2.5 shadow-2">
      <p className="min-w-0 flex-1 text-meta" aria-live="polite">
        {error
          ? <span className="text-danger">{error}</span>
          : disabledReason
            ? <span className="text-muted">{disabledReason}</span>
            : <span className="text-default">{invalid ? t('Fix the highlighted fields to save.') : t('Unsaved changes')}</span>}
      </p>
      <Button variant="ghost" size="sm" onClick={onDiscard} disabled={busy}>{t('Discard')}</Button>
      <Button variant="primary" size="sm" onClick={onSave} busy={busy} disabled={invalid || !!disabledReason}>{t('Save')}</Button>
    </div>
  )
}
