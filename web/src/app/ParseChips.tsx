// The preview of a parsed line (OpenSpec changes nlp-quick-add and smart-title-tokens):
// one dismissible chip per recognised attribute in the words the task will read, and a
// grey chip for a #token that names no project. Shared by quick add and the title
// editors, so a title typed in either place reads the same.
import { describeDue, formatDate, todayISO } from '../lib/dates'
import { type Chip, describeOffset, findLabel, formatMinutes, type LabelRef, type ProjectRef, type ReminderPhrase, resolveReminder } from '../lib/nlp'
import type { Unmatched } from '../lib/nlp/parse'
import type { Due } from '../lib/types'
import { Icon, Tooltip, type HueName } from '../ui'
import { msg, t, translatedMap } from '../lib/i18n'

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

function dueInWords(due: Due): string {
  const words = describeDue(due)?.label ?? due.date
  const full = formatDate(due.date, 'long')
  return words.startsWith(t('Today')) || words.startsWith(t('Tomorrow')) ? `${words} · ${full}` : words
}


function nowHHMM(d = new Date()): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
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

export function chipText(chip: Chip, projects: readonly ProjectRef[], labels: readonly LabelRef[], line?: { due: Due | null; datedByPhrase: boolean }): string {
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


export interface ParseChipsProps {
  chips: readonly Chip[]
  misses?: readonly Unmatched[]
  projects: readonly ProjectRef[]
  labels: readonly LabelRef[]
  /** The chip Backspace highlighted, about to be dismissed. */
  highlight?: number | null
  line?: { due: Due | null; datedByPhrase: boolean }
  onDismiss: (chip: Chip) => void
  /** An unmatched chip was activated (reopen the list for its token). */
  onMiss?: (miss: Unmatched) => void
}

export function ParseChips({ chips, misses = [], projects, labels, highlight = null, line, onDismiss, onMiss }: ParseChipsProps) {
  return (
    <>
      {chips.map((c, i) => {
        const text = chipText(c, projects, labels, line)
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
            {c.kind === 'label' && !label ? <span data-new-label>{t('New label “{name}”', { name: String(c.value) })}</span> : text}
            <button
              type="button"
              className="-my-1 inline-flex h-6 w-6 items-center justify-center rounded-full leading-none text-muted hover:bg-sunken hover:text-default"
              aria-label={t('Keep “{source}” as text', { source })}
              onClick={() => onDismiss(c)}
            >
              <Icon name="x" size="xs" />
            </button>
          </span>
          </Tooltip>
        )
      })}
      {misses.map((m) => (
        // A #token that names no project stays in the title; the chip says why and reopens the list (smart-title-tokens D4).
        <button key={`miss-${m.span.start}`} type="button" data-unmatched={m.reason}
          className="inline-flex items-center gap-1 rounded-full border border-dashed border-input px-2 py-0.5 text-muted hover:bg-sunken dark:hover:bg-raised"
          onClick={() => onMiss?.(m)}>
          <Icon name="folder" size="xs" className="text-faint" />
          {m.reason === 'ambiguous'
            ? t('{count} projects match “{name}”', { count: m.count, name: m.span.text.slice(1) })
            : t('No project “{name}” · stays in the title', { name: m.span.text.slice(1) })}
        </button>
      ))}
    </>
  )
}
