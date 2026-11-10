import { type FormEvent, forwardRef, useCallback, type KeyboardEvent, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { keysOf } from '../lib/shortcuts'
import { useShortcutHints } from './shortcuts/hints'
import { Icon } from '../ui'
import { logicalToday } from '../lib/dates'
import { useDateTimeFormat } from './DateTimePrefsProvider'
import { dayPartsOn } from '../lib/dayParts'
import { timeSectorsOn } from '../lib/sectorNames'
import { energyLevelsOn } from '../lib/energy'
import { useUserPrefsRow } from '../lib/localData'
import { createLabel, LabelExistsError } from '../lib/labels'
import {
  chipAtCaret, type Chip, dismissChip, type LabelRef, loadQuickAddSettings, onQuickAddSettingsChange, parse,
  type ParseContext, type ProjectRef, type QuickAddInput, type QuickAddSettings, rebaseDismissed, resolveDayMonthOrder, resolveLanguages, type Span, toTaskInput,
} from '../lib/nlp'
import { useDictation } from './useDictation'
import { useTokenSuggest } from './TokenSuggest'
import { ParseChips } from './ParseChips'
import { QuickAddTint } from './QuickAddTint'
import { composingEnter } from '../lib/composeKey'
import { t, preferredLanguages } from '../lib/i18n'
import { chipRange, type FieldKind, fieldRows, type FieldRow, startToken } from './quickadd/fields'
import { FieldRows, QuickAddFooter } from './quickadd/FieldRows'
import { SheetBar } from './quickadd/SheetBar'
import { usePasteOffer } from './quickadd/PasteOffer'
import { NotesLine, useNotesField } from './quickadd/NotesLine'
import { VoiceButton, VoiceNotice } from './quickadd/VoiceParts'

export type { QuickAddInput }

/** Whether the field's caret is outside `span` (an unmatched token is explained only then). */
function caretOutside(el: HTMLTextAreaElement | null, span: Span): boolean {
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
 * Pasted lines as quick-add inputs (paste-to-tasks D3): each line parsed on its own
 * with the field's options and no dismissed chips; a line whose parse leaves no title
 * (only "tomorrow") keeps its text as the title. `context` is null when parsing is off.
 */
export async function pastedInputs(lines: readonly string[], context: Omit<ParseContext, 'dismissed'> | null, labels: readonly LabelRef[] = []): Promise<QuickAddInput[]> {
  const out: QuickAddInput[] = []
  for (const line of lines) {
    const parsed = context ? parse(line, { ...context, dismissed: [] }) : null
    out.push(parsed && parsed.title ? await toTaskInput(parsed, { labels, createLabel: createLabelByName }) : { title: line })
  }
  return out
}

/**
 * The line as parsed. Logging a win (today-closed-list D6), recurrence and reminder
 * phrases are refused: re-read as dismissed, so their words stay in the title.
 */
function parseLine(value: string, ctx: Omit<ParseContext, 'dismissed'> | null, dismissed: Span[], logDone: boolean) {
  if (!ctx || !value.trim()) return { parsed: null, refused: false }
  const first = parse(value, { ...ctx, dismissed })
  const refuse = logDone ? first.chips.filter((c) => c.kind === 'recurrence' || c.kind === 'reminder') : []
  if (!refuse.length) return { parsed: first, refused: false }
  return { parsed: parse(value, { ...ctx, dismissed: refuse.reduce(dismissChip, dismissed) }), refused: true }
}

/** The note under a win whose line asked to repeat or remind. */
function WinRefused() {
  return (
    <p className="flex items-center gap-1.5 px-4 pb-2 text-meta text-muted" data-win-refused>
      <Icon name="repeat" size="xs" className="shrink-0" />{t('A win does not repeat or remind; the words stay in the title.')}
    </p>
  )
}

/** The parse options of a line typed now, or null while parsing is off. */
function useParseContext(settings: QuickAddSettings, projects: readonly ProjectRef[]): () => Omit<ParseContext, 'dismissed'> | null {
  // The user's date format fills the automatic numeric order, and their first day of
  // the week decides "next week" (date-time-preferences D5, D6).
  const { prefs: dtPrefs, resolved } = useDateTimeFormat()
  // Part phrases only while the account uses day parts (day-parts D5).
  const prefs = useUserPrefsRow()
  const dayParts = dayPartsOn(prefs)
  // The `~deep` tokens only while the account offers energy (task-energy D3).
  const energy = energyLevelsOn(prefs)
  // Sector phrases only while the account uses time sectors (time-sectors D8).
  const sectors = timeSectorsOn(prefs)
  return useCallback(() => {
    if (!settings.enabled) return null
    const langs = preferredLanguages()
    return {
      today: logicalToday(),
      now: nowHHMM(),
      languages: resolveLanguages(settings, langs),
      dayMonthOrder: resolveDayMonthOrder(settings, langs, dtPrefs),
      weekStart: resolved.weekStart,
      projects,
      dayParts,
      energy,
      sectors,
    }
  }, [settings, projects, dtPrefs, resolved, dayParts, energy, sectors])
}

/**
 * One-line capture. With natural-language parsing on (per-device setting), the
 * line is parsed on every keystroke and each recognised attribute is shown as a
 * dismissible chip; `onAdd` receives the title plus only the attributes the line
 * set, so the view's defaults fill the rest. A long line wraps in the field and
 * scrolls past five lines; Shift+Enter (or the sheet's Notes tool) opens a notes
 * field under it, saved as the task's notes (quick-add-notes D1, D2).
 *
 * Three presentations of the same field and parse (palette-quick-add D1): `line`
 * (chips under the field), `palette` (the command bar's field rows and footer) and
 * `sheet` (the phone's neutral chips and tool row).
 */
export const QuickAdd = forwardRef<HTMLTextAreaElement, {
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
  /**
   * A pasted list confirmed as one task per line (paste-to-tasks D3): every input at
   * once, so the screen writes them as one batch. Without it, `onAdd` runs per line.
   */
  onAddMany?: (inputs: QuickAddInput[]) => Promise<void> | void
  /** Log a win (today-closed-list D6): recurrence and reminder phrases are refused with a note. */
  logDone?: boolean
  /** Whether Shift+Enter opens the notes field (quick-add-notes D2); off where the screen has its own notes, and in the palette, whose Shift+Enter adds and opens. */
  notes?: boolean
}>(function QuickAdd({ placeholder, projects = [], labels = [], onAdd, initialValue, formId, hideHint, autoFocus, label, voiceShortcut, layout = 'line', onAddAndOpen, escape, onAddMany, logDone, notes: notesOn = true }, ref) {
  // The `q` badge is printed only while "Show shortcut hints" is on (keyboard-shortcuts).
  const hints = useShortcutHints()
  const [value, setValue] = useState(initialValue ?? '')
  const valueRef = useRef(value)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const tints = useRef<HTMLDivElement>(null)
  // The tint layer follows the field's vertical scroll after every change of text or caret.
  // The tints mirror the text, so their scroll follows the field when the text changes (the field's
  // onScroll does the rest). On every render it read the field's scroll, a layout of the whole page,
  // after each write in a 2,000-row list (list-rendering-at-scale).
  useEffect(() => { if (tints.current && inputRef.current) tints.current.scrollTop = inputRef.current.scrollTop }, [value])
  useImperativeHandle(ref, () => inputRef.current as HTMLTextAreaElement, [])
  // The notes field under the line (quick-add-notes D2).
  const notesField = useNotesField(inputRef)
  const { notes } = notesField
  const notesAllowed = notesOn && layout !== 'palette'
  const [dismissed, setDismissed] = useState<Span[]>([])
  const [highlight, setHighlight] = useState<number | null>(null)
  const [settings, setSettings] = useState(loadQuickAddSettings)
  useEffect(() => onQuickAddSettingsChange(() => setSettings(loadQuickAddSettings())), [])
  const context = useParseContext(settings, projects)
  const { parsed, refused } = useMemo(() => parseLine(value, context(), dismissed, !!logDone), [value, dismissed, context, logDone])
  const chips = useMemo(() => parsed?.chips ?? [], [parsed])
  const emptyTitle = parsed !== null && parsed.title === ''
  // The palette's field rows and the one ↑/↓ highlighted (palette-quick-add D3).
  const rows = useMemo(() => fieldRows(chips), [chips])
  const [row, setRow] = useState<number | null>(null)

  function change(raw: string) {
    // A title is one line: a line break pasted or dictated into it becomes a space.
    const next = raw.replace(/\r?\n/g, ' ')
    // The previous text comes from a ref: dictation calls this from engine events.
    const prev = valueRef.current
    valueRef.current = next
    setDismissed((d) => rebaseDismissed(prev, next, d))
    setValue(next)
    setHighlight(null)
    setRow(null)
  }

  // `#` and `@` suggestions (smart-title-tokens D1): a listbox under the field for the token at the caret.
  const energyOn = energyLevelsOn(useUserPrefsRow())
  const suggest = useTokenSuggest({ input: inputRef, value, setValue: change, projects, labels, enabled: settings.enabled, energy: energyOn })
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
    if (r.kind === 'project' || r.kind === 'label' || r.kind === 'energy') suggest.openAt(next.caret)
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
    const description = notes?.trim()
    // Clear first so the next entry can be typed while labels are being created.
    valueRef.current = ''
    setValue('')
    setDismissed([])
    setHighlight(null)
    if (notes !== null) notesField.close()
    // Unknown @names become labels first (one op each), then the task references their ids.
    const parsedInput: QuickAddInput = snapshot ? await toTaskInput(snapshot, { labels, createLabel: createLabelByName }) : { title: line }
    const input = description ? { ...parsedInput, description } : parsedInput
    await (open && onAddAndOpen ? onAddAndOpen(input) : onAdd(input))
  }

  // A pasted list (paste-to-tasks D1): offered as one task per line, or pasted as one line.
  const paste = usePasteOffer({
    field: inputRef,
    kind: 'tasks',
    onConfirm: async (lines) => {
      const inputs = await pastedInputs(lines, context(), labels)
      if (onAddMany) await onAddMany(inputs)
      else for (const input of inputs) await onAdd(input)
      change('')
      setDismissed([])
    },
    onPasteAsLine: (text) => { change(text); caretTo(text.length) },
  })

  const lineInfo = parsed ? { due: parsed.due, datedByPhrase: chips.some((x) => x.kind === 'due') } : undefined
  const palette = layout === 'palette'

  /** The palette's own keys (D3): ↑/↓ over the rows, Tab edits the highlighted one, Shift+Enter adds and opens, Escape clears the highlight. */
  function fieldKeys(e: KeyboardEvent<HTMLTextAreaElement>): boolean {
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

  // The field's text size: the prose step (15 px) in the palette and on the phone's sheet.
  const size = layout === 'line' ? '' : 'text-prose'
  // The marks beside the field stay on its first line when the line wraps (quick-add-notes D1).
  const lead = `quick-add-lead ${size || 'text-body'}`
  return (
    <form id={formId} onSubmit={submit} data-quick-add-layout={layout}>
      <div className={`relative flex items-start ${palette ? 'gap-2.5 border-b border-default px-4 py-2.5 sm:pr-11' : layout === 'sheet' ? 'gap-2 px-3 pb-2' : 'quick-add-surface gap-2'}`}>
        {palette ? <span className={lead}><Icon name="plus" className="text-faint" /></span> : layout === 'line' && <span className={lead}><span className="text-h2 leading-none text-accent">+</span></span>}
        {/* The recognised spans tinted behind the text (moments-and-onboarding D8, QuickAddTint). */}
        {/* The tints are the field's sizer (quick-add-notes D1): in one grid cell with the
            field, they wrap the same text and set the height, up to five lines. */}
        <span className="quick-add-grid min-w-0 flex-1">
        <QuickAddTint ref={tints} value={value} chips={chips} className={size} />
        <textarea
          ref={inputRef}
          rows={1}
          className={`quick-add-field ui-input border-transparent bg-transparent px-1 shadow-none focus:border-transparent focus:ring-0 dark:bg-transparent ${size}`}
          placeholder={placeholder}
          value={value}
          onChange={(e) => change(e.target.value)}
          onScroll={(e) => { if (tints.current) tints.current.scrollTop = e.currentTarget.scrollTop }}
          {...suggest.fieldProps}
          onPaste={paste.onPaste}
          onKeyDown={(e) => {
            if (composingEnter(e)) { e.preventDefault(); return }
            if (suggest.onKeyDown(e)) return
            if (palette && fieldKeys(e)) return
            if (e.key === 'Enter') {
              e.preventDefault()
              // Enter adds, as the one-line field did; Shift+Enter starts the notes.
              if (e.shiftKey && notesAllowed) notesField.open()
              else e.currentTarget.form?.requestSubmit()
              return
            }
            if (e.key === 'Escape') {
              if (highlight !== null) {
                e.stopPropagation()
                setHighlight(null)
              } else e.currentTarget.blur()
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
        {voice.enabled && <span className={lead}><VoiceButton voice={voice} shortcut={voiceShortcut} /></span>}
        {!hideHint && hints && <span className={`${lead} max-sm:hidden`}><span className="ui-kbd" data-quick-add-hint>{keysOf('list.quick-add')}</span></span>}
        {suggest.list}
        {paste.offer}
      </div>
      {notes !== null && (
        <NotesLine ref={notesField.ref} value={notes} onChange={notesField.setNotes} onClose={notesField.close}
          className={layout === 'sheet' ? 'px-3 pb-2' : 'pl-5'} size={size} />
      )}
      {voice.enabled && <VoiceNotice voice={voice} />}
      {palette && <>
        <div id="quick-add-preview" role="status" aria-live="polite">
          <FieldRows rows={rows} highlight={row} chipHighlight={highlight} projects={projects} labels={labels} line={lineInfo} onEdit={edit} onDismiss={(r) => r.chip && dismiss(r.chip)} />
          {misses.length > 0 && <div className="flex flex-wrap gap-1.5 px-4 pb-2 text-meta"><ParseChips chips={[]} misses={misses} projects={projects} labels={labels} onDismiss={dismiss} onMiss={(m) => suggest.openAt(m.span.end)} /></div>}
          {refused && <WinRefused />}
        </div>
        <QuickAddFooter title={parsed ? parsed.title : null} empty={emptyTitle} escape={escape} />
      </>}
      {layout === 'sheet' && (
        <div id="quick-add-preview" role="status" aria-live="polite">
          {misses.length > 0 && <div className="flex flex-wrap gap-1.5 px-3 pb-2 text-meta"><ParseChips chips={[]} misses={misses} projects={projects} labels={labels} onDismiss={dismiss} onMiss={(m) => suggest.openAt(m.span.end)} /></div>}
          <SheetBar chips={chips} projects={projects} labels={labels} line={lineInfo} onDismiss={dismiss} onStart={edit} canSend={!!value.trim() && !emptyTitle} energy={energyOn && settings.enabled}
            notes={notesAllowed ? { open: notes !== null, start: notesField.open } : undefined} />
        </div>
      )}
      {layout === 'line' && <div id="quick-add-preview" role="status" aria-live="polite" className="empty:hidden">
        {(chips.length > 0 || misses.length > 0) && (
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 pl-9 text-meta">
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
