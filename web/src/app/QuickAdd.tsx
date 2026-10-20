import { type FormEvent, forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { keysOf } from '../lib/shortcuts'
import { useShortcutHints } from './shortcuts/hints'
import type { HueName } from '../ui'
import { Tooltip } from '../ui'
import { Icon } from '../ui'
import { describeDue, formatDate, logicalToday, todayISO } from '../lib/dates'
import { useDateTimeFormat } from './DateTimePrefsProvider'
import { createLabel, LabelExistsError } from '../lib/labels'
import {
  chipAtCaret, type Chip, describeOffset, dismissChip, findLabel, formatMinutes, type LabelRef, loadQuickAddSettings, onQuickAddSettingsChange, parse,
  type ProjectRef, type QuickAddInput, rebaseDismissed, type ReminderPhrase, resolveDayMonthOrder, resolveLanguages, resolveReminder, type Span, toTaskInput,
} from '../lib/nlp'
import type { Due } from '../lib/types'
import { useDictation } from './useDictation'
import { t, msg, translatedMap, preferredLanguages } from '../lib/i18n'

export type { QuickAddInput }

// Chip colours come from palette hues (design-system tokens), so both themes follow.
const CHIP_HUE: Record<Chip['kind'], HueName> = {
  due: 'violet',
  deadline: 'red',
  someday: 'slate',
  evening: 'indigo',
  project: 'slate',
  label: 'cyan',
  priority: 'orange',
  estimate: 'green',
  spent: 'lime',
  recurrence: 'teal',
  reminder: 'yellow',
}

function nowHHMM(d = new Date()): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}


function dueInWords(due: Due): string {
  const words = describeDue(due)?.label ?? due.date
  const full = formatDate(due.date, 'long')
  return words.startsWith(t('Today')) || words.startsWith(t('Tomorrow')) ? `${words} · ${full}` : words
}

/** The picker's helper; a label created meanwhile (another tab, a sync) is reused. */
async function createLabelByName(name: string): Promise<string> {
  try {
    return await createLabel({ name })
  } catch (err) {
    if (err instanceof LabelExistsError) return err.existing.id
    throw err
  }
}

/** Project name with its parent path for nested projects: "Work › Docs". */
function projectPath(id: string, projects: readonly ProjectRef[]): string {
  const byId = new Map(projects.map((p) => [p.id, p]))
  const names: string[] = []
  const seen = new Set<string>()
  for (let p = byId.get(id); p && !seen.has(p.id) && names.length < 4; p = p.parent_id ? byId.get(p.parent_id) : undefined) {
    seen.add(p.id)
    names.unshift(p.name)
  }
  return names.join(' › ') || '?'
}

function chipText(chip: Chip, projects: readonly ProjectRef[], labels: readonly LabelRef[], line?: { due: Due | null; datedByPhrase: boolean }): string {
  switch (chip.kind) {
    case 'recurrence':
      // Without a typed date the series starts on the rule's first occurrence (quick-add-recurrence D4).
      return line?.due && !line.datedByPhrase ? `${String(chip.value)} · ${formatDate(line.due.date, 'long')}` : String(chip.value)
    case 'reminder': {
      const r = chip.value as ReminderPhrase
      // Reminders are instants: the calendar date and clock of now, not the logical day (day-boundary D2).
      const now = new Date()
      const res = resolveReminder(r, line?.due ?? null, todayISO(now), nowHHMM(now))
      if (res.kind === 'absolute') return t('Remind {date}, {time}', { date: formatDate(res.date, 'long'), time: res.time })
      return line?.due ? describeOffset(res.offsetMinutes) : `${describeOffset(res.offsetMinutes)} · ${t('needs a due date')}`
    }
    case 'due':
      return dueInWords(chip.value as Due)
    case 'someday':
      return t('Someday')
    case 'evening':
      return t('This Evening')
    case 'deadline':
      return t('Deadline {date}', { date: dueInWords({ date: chip.value as string }) })
    case 'project':
      return `#${projectPath(chip.value as string, projects)}`
    case 'label':
      return `@${findLabel(String(chip.value), labels)?.name ?? String(chip.value)}`
    case 'priority':
      return `P${String(chip.value)}`
    case 'estimate':
      return formatMinutes(chip.value as number)
    case 'spent':
      return t('Spent {duration}', { duration: (chip.value as number) < 60 ? t('{n} min', { n: chip.value as number }) : formatMinutes(chip.value as number) })
  }
}

const KIND_NAME = translatedMap<Chip['kind']>({ due: msg('Due'), deadline: msg('Deadline'), someday: msg('Someday'), evening: msg('Evening'), project: msg('Project'), label: msg('Label'), priority: msg('Priority'), estimate: msg('Estimate'), spent: msg('Time spent'), recurrence: msg('Repeats'), reminder: msg('Reminder') })

/**
 * Single-line capture. With natural-language parsing on (per-device setting), the
 * line is parsed on every keystroke and each recognised attribute is shown as a
 * dismissible chip; `onAdd` receives the title plus only the attributes the line
 * set, so the view's defaults fill the rest.
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
}>(function QuickAdd({ placeholder, projects = [], labels = [], onAdd, initialValue, formId, hideHint, autoFocus, label, voiceShortcut }, ref) {
  // The `q` badge is printed only while "Show shortcut hints" is on (keyboard-shortcuts).
  const hints = useShortcutHints()
  const [value, setValue] = useState(initialValue ?? '')
  const valueRef = useRef(value)
  const inputRef = useRef<HTMLInputElement>(null)
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
  const chips = parsed?.chips ?? []
  const emptyTitle = parsed !== null && parsed.title === ''

  function change(next: string) {
    // The previous text comes from a ref: dictation calls this from engine events.
    const prev = valueRef.current
    valueRef.current = next
    setDismissed((d) => rebaseDismissed(prev, next, d))
    setValue(next)
    setHighlight(null)
  }

  const voice = useDictation({
    inputRef, getText: () => valueRef.current, setText: change, settings, projects, labels, shortcut: voiceShortcut,
  })

  function dismiss(chip: Chip) {
    setDismissed((d) => dismissChip(d, chip))
    setHighlight(null)
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
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
    await onAdd(input)
  }

  return (
    <form id={formId} onSubmit={(e) => void submit(e)}>
      <div className="flex items-center gap-2">
        <span className="text-h2 leading-none text-accent">+</span>
        <input
          ref={inputRef}
          className="ui-input border-transparent bg-transparent px-1 shadow-none focus:border-transparent focus:ring-0 dark:bg-transparent"
          placeholder={placeholder}
          value={value}
          onChange={(e) => change(e.target.value)}
          onKeyDown={(e) => {
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
      <div id="quick-add-preview" role="status" aria-live="polite" className="empty:hidden">
        {chips.length > 0 && (
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 pl-6 text-meta">
            {chips.map((c, i) => {
              const text = chipText(c, projects, labels, parsed ? { due: parsed.due, datedByPhrase: chips.some((x) => x.kind === 'due') } : undefined)
              const source = c.spans.map((s) => s.text).join(' … ')
              const label = c.kind === 'label' ? findLabel(String(c.value), labels) : undefined
              return (
                <Tooltip key={c.key} label={t('{kind} from “{source}”', { kind: KIND_NAME[c.kind], source })}>
                <span
                  data-chip={c.kind}
                  data-hue={CHIP_HUE[c.kind]}
                  className={`inline-flex items-center gap-1 rounded-full border border-hue-solid/40 bg-hue-soft py-0.5 pl-2 pr-1 text-hue ${highlight === i ? 'ring-2 ring-focus' : ''}`}
                >
                  <span className="sr-only">{KIND_NAME[c.kind]}: </span>
                  {label?.color && <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: label.color }} aria-hidden="true" />}
                  {c.kind === 'deadline' && <Icon name="hourglass" size="xs" />}
                  {c.kind === 'someday' && <Icon name="archive" size="xs" />}
                  {c.kind === 'evening' && <Icon name="moon" size="xs" />}
                  {text}
                  {c.kind === 'label' && !label && <span className="text-muted" data-new-label>{t('new')}</span>}
                  <button
                    type="button"
                    className="-my-1 inline-flex h-6 w-6 items-center justify-center rounded-full leading-none text-muted hover:bg-sunken hover:text-default"
                    aria-label={t('Keep “{source}” as text', { source })}
                    onClick={() => dismiss(c)}
                  >
                    ×
                  </button>
                </span>
                </Tooltip>
              )
            })}
            <span className="text-muted" data-testid="quick-add-title">
              <span className="sr-only">{t('Title:')}{' '}</span>
              {emptyTitle ? <em>{t('Type a title')}</em> : <span className="inline-flex items-center gap-1"><Icon name="arrow-right" size="xs" />{parsed?.title}</span>}
            </span>
          </div>
        )}
      </div>
    </form>
  )
})
