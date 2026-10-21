// A task title that understands what is typed into it (OpenSpec change
// smart-title-tokens, design D6): the panel header and the inline title editor use it.
// While focused it parses only the text typed in this edit (the title as it was when
// the edit began is never re-read), shows the chips quick add shows, and offers the
// `#` and `@` suggestions; on commit it hands the caller the plan to apply. With
// parsing off, or for viewers, it is a plain field.
import { type KeyboardEvent, type Ref, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { logicalToday } from '../lib/dates'
import { dismissChip, type Chip, type LabelRef, loadQuickAddSettings, onQuickAddSettingsChange, type ProjectRef, rebaseDismissed, resolveDayMonthOrder, resolveLanguages, type Span } from '../lib/nlp'
import { editPlan, parseEdit, type EditPlan } from '../lib/nlp/edit'
import { preferredLanguages } from '../lib/i18n'
import { useDateTimeFormat } from './DateTimePrefsProvider'
import { ParseChips } from './ParseChips'
import { useTokenSuggest } from './TokenSuggest'

export interface TitleFieldProps {
  /** The stored title. */
  title: string
  /** The draft shown in the field (the caller keeps it across remote changes). */
  value: string
  onChange: (next: string) => void
  /** The edit is done (Enter or leaving the field): the plan of what it set. */
  onCommit: (plan: EditPlan) => void
  /** Esc: the caller reverts or cancels. */
  onCancel?: () => void
  projects: readonly ProjectRef[]
  labels: readonly LabelRef[]
  readOnly?: boolean
  /** A two-line textarea (the panel header) or a one-line input (the inline editor). */
  multiline?: boolean
  className?: string
  placeholder?: string
  ariaLabel: string
  autoFocus?: boolean
  fieldRef?: Ref<HTMLInputElement | HTMLTextAreaElement | null>
  /** Extra attributes for the field (data-task-title). */
  dataAttrs?: Record<string, string | boolean>
  /** Where the caret starts when the field mounts focused (the inline editor puts it where the click was). */
  initialCaret?: number
  /** Runs first on every key; true when the caller handled it (Shift+Enter in the inline editor). */
  onKeyDownFirst?: (e: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => boolean
}

function nowHHMM(d = new Date()): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export function TitleField({ title, value, onChange, onCommit, onCancel, projects, labels, readOnly = false, multiline = false, className = '', placeholder, ariaLabel, autoFocus, fieldRef, dataAttrs = {}, initialCaret, onKeyDownFirst }: TitleFieldProps) {
  const input = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null)
  useImperativeHandle(fieldRef, () => input.current as HTMLInputElement | HTMLTextAreaElement, [])
  const [focused, setFocused] = useState(false)
  // The title the edit began with: only what differs from it is read.
  const base = useRef(title)
  const [dismissed, setDismissed] = useState<Span[]>([])
  const [settings, setSettings] = useState(loadQuickAddSettings)
  useEffect(() => onQuickAddSettingsChange(() => setSettings(loadQuickAddSettings())), [])
  const { prefs: dtPrefs, resolved } = useDateTimeFormat()
  const parsing = settings.enabled && !readOnly

  const parsed = useMemo(() => {
    if (!parsing || !focused || value === base.current) return null
    const langs = preferredLanguages()
    return parseEdit(base.current, value, {
      today: logicalToday(), now: nowHHMM(), languages: resolveLanguages(settings, langs),
      dayMonthOrder: resolveDayMonthOrder(settings, langs, dtPrefs), weekStart: resolved.weekStart, projects, dismissed,
    })
  }, [parsing, focused, value, settings, dtPrefs, resolved, projects, dismissed])

  const change = (next: string) => {
    const clean = multiline ? next.replace(/\n/g, ' ') : next
    setDismissed((d) => rebaseDismissed(value, clean, d))
    onChange(clean)
  }
  const suggest = useTokenSuggest({ input, value, setValue: change, projects, labels, enabled: parsing && focused })

  const commit = () => {
    const text = value.trim()
    if (!text || (text === title && !parsed)) return onCommit({ patch: {}, labels: [], reminders: [] })
    const plan = parsed ? editPlan({ title, project_id: null }, parsed) : { patch: text !== title ? { title: text } : {}, labels: [], reminders: [] }
    // editPlan compares the project with the stored task's; the caller knows it, so pass every project token through.
    if (parsed?.projectId) plan.patch.project_id = parsed.projectId
    onCommit(plan)
  }

  // A field that mounts focused starts with the caret where the caller asked (the click's place).
  useEffect(() => {
    const el = input.current
    if (!el || initialCaret === undefined || document.activeElement !== el) return
    const at = Math.max(0, Math.min(initialCaret, el.value.length))
    el.setSelectionRange(at, at)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- on mount only
  }, [])

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (suggest.onKeyDown(e)) return
    if (onKeyDownFirst?.(e)) return
    if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLElement).blur() }
    else if (e.key === 'Escape' && onCancel) { e.preventDefault(); e.stopPropagation(); onCancel() }
  }

  const chips: Chip[] = parsed?.chips ?? []
  const misses = parsed?.unmatched ?? []
  const common = {
    ...suggest.fieldProps,
    className,
    value,
    readOnly,
    placeholder,
    autoFocus,
    'aria-label': ariaLabel,
    ...dataAttrs,
    onChange: (e: { target: { value: string } }) => change(e.target.value),
    onFocus: () => { base.current = title; setDismissed([]); setFocused(true); suggest.fieldProps.onFocus() },
    onBlur: () => { suggest.fieldProps.onBlur(); setFocused(false); commit() },
    onKeyDown,
  }
  return (
    <div className="relative min-w-0 flex-1" data-title-field>
      {multiline
        ? <textarea ref={(el) => { input.current = el }} rows={1} {...common} />
        : <input ref={(el) => { input.current = el }} {...common} />}
      {suggest.list}
      {focused && (chips.length > 0 || misses.length > 0) && (
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-meta" role="status" aria-live="polite" data-title-chips>
          <ParseChips chips={chips} misses={misses} projects={projects} labels={labels}
            line={parsed ? { due: parsed.due, datedByPhrase: chips.some((x) => x.kind === 'due') } : undefined}
            onDismiss={(c) => setDismissed((d) => dismissChip(d, c))} onMiss={(m) => suggest.openAt(m.span.end)} />
        </div>
      )}
    </div>
  )
}
