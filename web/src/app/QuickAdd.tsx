import { type FormEvent, forwardRef, useEffect, useMemo, useState } from 'react'
import { describeDue, todayISO } from '../lib/dates'
import { createLabel, LabelExistsError } from '../lib/labels'
import {
  chipAtCaret, type Chip, dismissChip, findLabel, formatMinutes, type LabelRef, loadQuickAddSettings, onQuickAddSettingsChange, parse,
  type ProjectRef, type QuickAddInput, rebaseDismissed, resolveDayMonthOrder, resolveLanguages, type Span, toTaskInput,
} from '../lib/nlp'
import type { Due } from '../lib/types'

export type { QuickAddInput }

const CHIP_TONE: Record<Chip['kind'], string> = {
  due: 'border-violet-300 bg-violet-50 text-violet-800 dark:border-violet-800 dark:bg-violet-950/50 dark:text-violet-300',
  project: 'border-slate-300 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200',
  label: 'border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-800 dark:bg-sky-950/50 dark:text-sky-300',
  priority: 'border-orange-300 bg-orange-50 text-orange-800 dark:border-orange-800 dark:bg-orange-950/50 dark:text-orange-300',
  estimate: 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300',
}

function nowHHMM(d = new Date()): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function browserLanguages(): readonly string[] {
  if (typeof navigator === 'undefined') return ['en']
  return navigator.languages?.length ? navigator.languages : [navigator.language || 'en']
}

function dueInWords(due: Due): string {
  const words = describeDue(due)?.label ?? due.date
  const [y, m, d] = due.date.split('-').map(Number)
  const full = new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
  return words.startsWith('Today') || words.startsWith('Tomorrow') ? `${words} · ${full}` : words
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

function chipText(chip: Chip, projects: readonly ProjectRef[], labels: readonly LabelRef[]): string {
  switch (chip.kind) {
    case 'due':
      return dueInWords(chip.value as Due)
    case 'project':
      return `#${projectPath(chip.value as string, projects)}`
    case 'label':
      return `@${findLabel(String(chip.value), labels)?.name ?? String(chip.value)}`
    case 'priority':
      return `P${String(chip.value)}`
    case 'estimate':
      return formatMinutes(chip.value as number)
  }
}

const KIND_NAME: Record<Chip['kind'], string> = { due: 'Due', project: 'Project', label: 'Label', priority: 'Priority', estimate: 'Estimate' }

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
}>(function QuickAdd({ placeholder, projects = [], labels = [], onAdd }, ref) {
  const [value, setValue] = useState('')
  const [dismissed, setDismissed] = useState<Span[]>([])
  const [highlight, setHighlight] = useState<number | null>(null)
  const [settings, setSettings] = useState(loadQuickAddSettings)
  useEffect(() => onQuickAddSettingsChange(() => setSettings(loadQuickAddSettings())), [])

  const parsed = useMemo(() => {
    if (!settings.enabled || !value.trim()) return null
    const langs = browserLanguages()
    return parse(value, {
      today: todayISO(),
      now: nowHHMM(),
      languages: resolveLanguages(settings, langs),
      dayMonthOrder: resolveDayMonthOrder(settings, langs),
      projects,
      dismissed,
    })
  }, [value, dismissed, projects, settings])
  const chips = parsed?.chips ?? []
  const emptyTitle = parsed !== null && parsed.title === ''

  function change(next: string) {
    setDismissed((d) => rebaseDismissed(value, next, d))
    setValue(next)
    setHighlight(null)
  }

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
    setValue('')
    setDismissed([])
    setHighlight(null)
    // Unknown @names become labels first (one op each), then the task references their ids.
    const input: QuickAddInput = snapshot ? await toTaskInput(snapshot, { labels, createLabel: createLabelByName }) : { title: line }
    await onAdd(input)
  }

  return (
    <form onSubmit={(e) => void submit(e)}>
      <div className="flex items-center gap-2">
        <span className="text-xl leading-none text-emerald-600">+</span>
        <input
          ref={ref}
          className="input border-transparent bg-transparent px-1 shadow-none focus:border-transparent focus:ring-0 dark:bg-transparent"
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
          aria-label="Add a task"
          aria-describedby={chips.length ? 'quick-add-preview' : undefined}
        />
        <span className="kbd hidden sm:inline">q</span>
      </div>
      <div id="quick-add-preview" role="status" aria-live="polite" className="empty:hidden">
        {chips.length > 0 && (
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 pl-6 text-xs">
            {chips.map((c, i) => {
              const text = chipText(c, projects, labels)
              const source = c.spans.map((s) => s.text).join(' … ')
              const label = c.kind === 'label' ? findLabel(String(c.value), labels) : undefined
              return (
                <span
                  key={c.key}
                  data-chip={c.kind}
                  title={`${KIND_NAME[c.kind]} from “${source}”`}
                  className={`inline-flex items-center gap-1 rounded-full border py-0.5 pl-2 pr-1 ${CHIP_TONE[c.kind]} ${highlight === i ? 'ring-2 ring-emerald-500' : ''}`}
                >
                  <span className="sr-only">{KIND_NAME[c.kind]}: </span>
                  {label?.color && <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: label.color }} aria-hidden="true" />}
                  {text}
                  {c.kind === 'label' && !label && <span className="opacity-60" data-new-label>new</span>}
                  <button
                    type="button"
                    className="rounded-full px-1 leading-none opacity-60 hover:bg-black/10 hover:opacity-100 dark:hover:bg-white/10"
                    aria-label={`Keep “${source}” as text`}
                    onClick={() => dismiss(c)}
                  >
                    ×
                  </button>
                </span>
              )
            })}
            <span className="text-slate-500 dark:text-slate-400" data-testid="quick-add-title">
              <span className="sr-only">Title: </span>
              {emptyTitle ? <em>Type a title</em> : <>→ {parsed?.title}</>}
            </span>
          </div>
        )}
      </div>
    </form>
  )
})
