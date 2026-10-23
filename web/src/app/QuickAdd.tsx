import { type FormEvent, forwardRef, type KeyboardEvent, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { keysOf } from '../lib/shortcuts'
import { useShortcutHints } from './shortcuts/hints'
import { Tooltip } from '../ui'
import { Icon } from '../ui'
import { logicalToday } from '../lib/dates'
import { useDateTimeFormat } from './DateTimePrefsProvider'
import { createLabel, LabelExistsError } from '../lib/labels'
import {
  chipAtCaret, type Chip, dismissChip, type LabelRef, loadQuickAddSettings, onQuickAddSettingsChange, parse,
  type ProjectRef, type QuickAddInput, rebaseDismissed, resolveDayMonthOrder, resolveLanguages, type Span, toTaskInput,
} from '../lib/nlp'
import { useDictation } from './useDictation'
import { useTokenSuggest } from './TokenSuggest'
import { ParseChips } from './ParseChips'
import { QuickAddTint } from './QuickAddTint'
import { t, preferredLanguages } from '../lib/i18n'
import { chipRange, type FieldKind, fieldRows, type FieldRow, startToken } from './quickadd/fields'
import { FieldRows, QuickAddFooter } from './quickadd/FieldRows'
import { SheetBar } from './quickadd/SheetBar'

export type { QuickAddInput }

/** Whether the field's caret is outside `span` (an unmatched token is explained only then). */
function caretOutside(el: HTMLInputElement | null, span: Span): boolean {
  const c = el?.selectionStart ?? -1
  return c < span.start || c > span.end
}

export function nowHHMM(d = new Date()): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}


/** The picker's helper; a label created meanwhile (another tab, a sync) is reused. */
export async function createLabelByName(name: string): Promise<string> {
  try {
    return await createLabel({ name })
  } catch (err) {
    if (err instanceof LabelExistsError) return err.existing.id
    throw err
  }
}

/**
 * Single-line capture. With natural-language parsing on (per-device setting), the
 * line is parsed on every keystroke and each recognised attribute is shown as a
 * dismissible chip; `onAdd` receives the title plus only the attributes the line
 * set, so the view's defaults fill the rest.
 *
 * Three presentations of the same field and parse (palette-quick-add D1): `line`
 * (chips under the field), `palette` (the command bar's field rows and footer) and
 * `sheet` (the phone's neutral chips and tool row).
 */
export const QuickAdd = forwardRef<HTMLInputElement, {
  placeholder: string
  projects?: readonly ProjectRef[]
  /** Every label (deleted ones are ignored) for resolving and colouring `@name` chips. */
  labels?: readonly LabelRef[]
  onAdd: (input: QuickAddInput) => Promise<void> | void
  /** Prefilled line (the capture screen proposes the shared page's title); parsed like typed text. */
  initialValue?: string
  /** Form id, so a button elsewhere can submit it with `form=`. */
  formId?: string
  /** Hide the `q` shortcut hint (it does not apply outside the task views). */
  hideHint?: boolean
  autoFocus?: boolean
  /** Accessible name of the input; "Add a task" by default. */
  label?: string
  /** Shift+V outside text fields dictates into this quick add (the view's main one only). */
  voiceShortcut?: boolean
  layout?: 'line' | 'palette' | 'sheet'
  /** Shift+Enter in the palette: add, then open the new task. */
  onAddAndOpen?: (input: QuickAddInput) => Promise<void> | void
  /** The palette footer's Escape: its label (Close or Back) and action. */
  escape?: { label: string; run: () => void }
}>(function QuickAdd({ placeholder, projects = [], labels = [], onAdd, initialValue, formId, hideHint, autoFocus, label, voiceShortcut, layout = 'line', onAddAndOpen, escape }, ref) {
  // The `q` badge is printed only while "Show shortcut hints" is on (keyboard-shortcuts).
  const hints = useShortcutHints()
  const [value, setValue] = useState(initialValue ?? '')
  const valueRef = useRef(value)
  const inputRef = useRef<HTMLInputElement>(null)
  const tints = useRef<HTMLDivElement>(null)
  // The tint layer follows the field's horizontal scroll after every change of text or caret.
  useEffect(() => { if (tints.current && inputRef.current) tints.current.scrollLeft = inputRef.current.scrollLeft })
  useImperativeHandle(ref, () => inputRef.current as HTMLInputElement, [])
  const [dismissed, setDismissed] = useState<Span[]>([])
  const [highlight, setHighlight] = useState<number | null>(null)
  const [settings, setSettings] = useState(loadQuickAddSettings)
  useEffect(() => onQuickAddSettingsChange(() => setSettings(loadQuickAddSettings())), [])
  // The user's date format fills the automatic numeric order, and their first day of
  // the week decides "next week" (date-time-preferences D5, D6).
  const { prefs: dtPrefs, resolved } = useDateTimeFormat()

  const parsed = useMemo(() => {
    if (!settings.enabled || !value.trim()) return null
    const langs = preferredLanguages()
    return parse(value, {
      today: logicalToday(),
      now: nowHHMM(),
      languages: resolveLanguages(settings, langs),
      dayMonthOrder: resolveDayMonthOrder(settings, langs, dtPrefs),
      weekStart: resolved.weekStart,
      projects,
      dismissed,
    })
  }, [value, dismissed, projects, settings, dtPrefs, resolved])
  const chips = useMemo(() => parsed?.chips ?? [], [parsed])
  const emptyTitle = parsed !== null && parsed.title === ''
  // The palette's field rows and the one ↑/↓ highlighted (palette-quick-add D3).
  const rows = useMemo(() => fieldRows(chips), [chips])
  const [row, setRow] = useState<number | null>(null)

  function change(next: string) {
    // The previous text comes from a ref: dictation calls this from engine events.
    const prev = valueRef.current
    valueRef.current = next
    setDismissed((d) => rebaseDismissed(prev, next, d))
    setValue(next)
    setHighlight(null)
    setRow(null)
  }

  // `#` and `@` suggestions (smart-title-tokens D1): a listbox under the field for the token at the caret.
  const suggest = useTokenSuggest({ input: inputRef, value, setValue: change, projects, labels, enabled: settings.enabled })
  // Unmatched #tokens are explained once the caret has left them (natural-language-capture "Unmatched tokens are explained").
  const misses = (parsed?.unmatched ?? []).filter((m) => !suggest.open || caretOutside(inputRef.current, m.span))

  const voice = useDictation({
    inputRef, getText: () => valueRef.current, setText: change, settings, projects, labels, shortcut: voiceShortcut,
  })

  function dismiss(chip: Chip) {
    setDismissed((d) => dismissChip(d, chip))
    setHighlight(null)
  }

  /** Puts the caret at `at` (or selects `at`–`end`) once the field shows the current text. */
  function caretTo(at: number, end = at) {
    requestAnimationFrame(() => {
      const el = inputRef.current
      if (!el) return
      el.focus()
      el.setSelectionRange(at, end)
    })
  }

  /** Edits a field through the line (D2): a set field's words are selected, an unset one's token is started. */
  function edit(target: FieldRow | FieldKind) {
    const r = typeof target === 'string' ? { kind: target } : target
    setRow(null)
    if (r.chip) {
      const { start, end } = chipRange(r.chip)
      caretTo(start, end)
      return
    }
    const next = startToken(valueRef.current, r.kind)
    change(next.value)
    if (r.kind === 'project' || r.kind === 'label') suggest.openAt(next.caret)
    else caretTo(next.caret)
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    void add(false)
  }

  async function add(open: boolean) {
    const line = value.trim()
    if (!line) return
    if (parsed && !parsed.title) return // only attributes typed so far; wait for a title
    const snapshot = parsed
    // Clear first so the next entry can be typed while labels are being created.
    valueRef.current = ''
    setValue('')
    setDismissed([])
    setHighlight(null)
    // Unknown @names become labels first (one op each), then the task references their ids.
    const input: QuickAddInput = snapshot ? await toTaskInput(snapshot, { labels, createLabel: createLabelByName }) : { title: line }
    await (open && onAddAndOpen ? onAddAndOpen(input) : onAdd(input))
  }

  const lineInfo = parsed ? { due: parsed.due, datedByPhrase: chips.some((x) => x.kind === 'due') } : undefined
  const palette = layout === 'palette'

  /** The palette's own keys (D3): ↑/↓ over the rows, Tab edits the highlighted one, Shift+Enter adds and opens, Escape clears the highlight. */
  function fieldKeys(e: KeyboardEvent<HTMLInputElement>): boolean {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      setRow((r) => (e.key === 'ArrowDown' ? (r === null ? 0 : Math.min(r + 1, rows.length - 1)) : r === null || r === 0 ? null : r - 1))
      return true
    }
    if (e.key === 'Tab' && !e.shiftKey && row !== null && rows[row]) {
      e.preventDefault()
      edit(rows[row])
      return true
    }
    if (e.key === 'Enter' && e.shiftKey && onAddAndOpen) {
      e.preventDefault()
      void add(true)
      return true
    }
    if (e.key === 'Escape' && row !== null) {
      e.stopPropagation()
      setRow(null)
      return true
    }
    return false
  }

  // The field's text size: 15 px in the palette, 16 px on the phone's sheet (no zoom on focus).
  const size = palette ? 'text-prose' : layout === 'sheet' ? 'text-[1rem]' : ''
  return (
    <form id={formId} onSubmit={submit} data-quick-add-layout={layout}>
      <div className={`relative flex items-center ${palette ? 'gap-2.5 border-b border-default px-4 py-2.5' : layout === 'sheet' ? 'gap-2 px-3 pb-2' : 'gap-2'}`}>
        {palette ? <Icon name="plus" className="shrink-0 text-faint" /> : layout === 'line' && <span className="text-h2 leading-none text-accent">+</span>}
        {/* The recognised spans tinted behind the text (moments-and-onboarding D8, QuickAddTint). */}
        <span className="relative flex min-w-0 flex-1">
        <QuickAddTint ref={tints} value={value} chips={chips} className={size} />
        <input
          ref={inputRef}
          className={`ui-input relative border-transparent bg-transparent px-1 shadow-none focus:border-transparent focus:ring-0 dark:bg-transparent ${size}`}
          placeholder={placeholder}
          value={value}
          onChange={(e) => change(e.target.value)}
          onScroll={(e) => { if (tints.current) tints.current.scrollLeft = e.currentTarget.scrollLeft }}
          {...suggest.fieldProps}
          onKeyDown={(e) => {
            if (suggest.onKeyDown(e)) return
            if (palette && fieldKeys(e)) return
            if (e.key === 'Escape') {
              if (highlight !== null) {
                e.stopPropagation()
                setHighlight(null)
              } else (e.target as HTMLInputElement).blur()
              return
            }
            if (e.key === 'Backspace' && !e.metaKey && !e.ctrlKey && !e.altKey) {
              const input = e.currentTarget
              if (highlight !== null && chips[highlight]) {
                e.preventDefault()
                dismiss(chips[highlight])
                return
              }
              const idx = chipAtCaret(chips, value, input.selectionStart, input.selectionEnd)
              if (idx >= 0) {
                e.preventDefault()
                setHighlight(idx)
                return
              }
            }
            if (highlight !== null) setHighlight(null)
          }}
          aria-label={label ?? t('Add a task')}
          autoFocus={autoFocus}
          aria-describedby={chips.length ? 'quick-add-preview' : undefined}
        />
        </span>
        {voice.enabled && (
          <Tooltip label={voice.listening ? t('Stop dictation') : t('Dictate a task')} shortcut={voice.listening ? 'Esc' : voiceShortcut ? keysOf('list.dictate') : undefined}>
            <button
              type="button"
              className={`relative shrink-0 rounded-full p-1.5 ${voice.listening ? 'bg-danger-soft text-danger' : 'text-faint hover:bg-sunken hover:text-muted dark:hover:bg-raised'}`}
              aria-pressed={voice.listening}
              aria-label={voice.listening ? t('Stop dictation') : t('Dictate a task')}
              data-voice-button
              // Keep focus and caret in the input: the transcript goes where the caret is.
              onMouseDown={(e) => e.preventDefault()}
              onClick={voice.toggle}
            >
              {voice.listening && <span className="absolute inset-0 animate-ping rounded-full bg-danger/40 motion-reduce:hidden" aria-hidden="true" />}
              <Icon name="mic" className="relative" />
            </button>
          </Tooltip>
        )}
        {!hideHint && hints && <span className="ui-kbd hidden sm:inline" data-quick-add-hint>{keysOf('list.quick-add')}</span>}
        {suggest.list}
      </div>
      {voice.enabled && (
        <>
          <span className="sr-only" role="status" aria-live="polite" data-voice-status>{voice.view.announcement}</span>
          {voice.view.message && (
            <p className="mt-1 flex items-start gap-2 pl-6 text-meta text-on-warning-soft" data-voice-message>
              <span className="flex-1">{voice.view.message}</span>
              <button type="button" className="underline" onClick={voice.dismissMessage}>{t('Dismiss')}</button>
            </p>
          )}
        </>
      )}
      {palette && <>
        <div id="quick-add-preview" role="status" aria-live="polite">
          <FieldRows rows={rows} highlight={row} chipHighlight={highlight} projects={projects} labels={labels} line={lineInfo} onEdit={edit} onDismiss={(r) => r.chip && dismiss(r.chip)} />
          {misses.length > 0 && <div className="flex flex-wrap gap-1.5 px-4 pb-2 text-meta"><ParseChips chips={[]} misses={misses} projects={projects} labels={labels} onDismiss={dismiss} onMiss={(m) => suggest.openAt(m.span.end)} /></div>}
        </div>
        <QuickAddFooter title={parsed ? parsed.title : null} empty={emptyTitle} escape={escape} />
      </>}
      {layout === 'sheet' && (
        <div id="quick-add-preview" role="status" aria-live="polite">
          {misses.length > 0 && <div className="flex flex-wrap gap-1.5 px-3 pb-2 text-meta"><ParseChips chips={[]} misses={misses} projects={projects} labels={labels} onDismiss={dismiss} onMiss={(m) => suggest.openAt(m.span.end)} /></div>}
          <SheetBar chips={chips} projects={projects} labels={labels} line={lineInfo} onDismiss={dismiss} onStart={edit} canSend={!!value.trim() && !emptyTitle} />
        </div>
      )}
      {layout === 'line' && <div id="quick-add-preview" role="status" aria-live="polite" className="empty:hidden">
        {(chips.length > 0 || misses.length > 0) && (
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 pl-6 text-meta">
            <ParseChips chips={chips} misses={misses} projects={projects} labels={labels} highlight={highlight}
              line={lineInfo}
              onDismiss={dismiss} onMiss={(m) => suggest.openAt(m.span.end)} />
            <span className="text-muted" data-testid="quick-add-title">
              <span className="sr-only">{t('Title:')}{' '}</span>
              {emptyTitle ? <em>{t('Type a title')}</em> : <span className="inline-flex items-center gap-1"><Icon name="arrow-right" size="xs" />{parsed?.title}</span>}
            </span>
          </div>
        )}
      </div>}
    </form>
  )
})
