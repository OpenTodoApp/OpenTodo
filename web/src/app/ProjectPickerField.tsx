// A project field outside the task panel (OpenSpec task-detail-redesign, D2;
// entity-pickers): a button that shows the chosen project and opens the smart
// picker over `projectSource`, ranked by this device's recent picks for its context.
import { useMemo, useRef, useState } from 'react'
import { INBOX_KEY, itemKeywords, NONE_KEY, projectSource, type PickerItem } from '../lib/pickerSources'
import type { Project } from '../lib/types'
import { ComboboxPanel, Popover } from '../ui'
import { Icon } from '../ui'
import { t } from '../lib/i18n'

export interface ProjectPickerFieldProps {
  /** Accessible name of the field and the picker. */
  label: string
  projects: readonly Project[]
  /** The chosen project id; null is the Inbox (or "none" when the Inbox is not offered). */
  value: string | null
  onChange: (id: string | null) => void
  /** Pick-history context on this device ("project.parent", "capture.project", "import.target"). */
  rankContext: string
  /** Offer the Inbox (default). Without it the first option is `noneLabel`. */
  inbox?: boolean
  /** Label of the "no project" option when the Inbox is not offered. */
  noneLabel?: string
  disabled?: boolean
  className?: string
}

export function ProjectPickerField({ label, projects, value, onChange, rankContext, inbox = true, noneLabel = t('None'), disabled, className = '' }: ProjectPickerFieldProps) {
  const [open, setOpen] = useState(false)
  const anchor = useRef<HTMLButtonElement>(null)
  const items = useMemo<PickerItem[]>(() => {
    const live = projects.filter((p) => !p.archived && !p.deleted_at)
    const list = projectSource(live, { inbox })
    return inbox ? list : [{ key: NONE_KEY, value: null, label: noneLabel, path: [] }, ...list]
  }, [projects, inbox, noneLabel])
  const firstKey = inbox ? INBOX_KEY : NONE_KEY
  const current = items.find((i) => i.value === value) ?? items[0]
  const shown = current.path.length ? `${current.path.join(' › ')} › ${current.label}` : current.label

  return (
    <>
      <button ref={anchor} type="button" className={`ui-input flex items-center gap-2 text-left ${className}`} disabled={disabled}
        aria-label={`${label}: ${shown}`} aria-haspopup="dialog" aria-expanded={open}
        onClick={() => setOpen(true)}
        onKeyDown={(e) => { if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); setOpen(true) } }}>
        {current.color ? <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: current.color }} />
          : <Icon name={current.key === INBOX_KEY ? 'inbox' : 'circle'} className="shrink-0 text-faint" />}
        <span className="min-w-0 flex-1 truncate">{shown}</span>
        <Icon name="chevron-down" className="shrink-0 text-faint" />
      </button>
      <Popover open={open} onClose={() => setOpen(false)} anchor={anchor} label={label} align="start" width="sm:w-80" className="p-2">
        <ComboboxPanel<PickerItem>
          label={label}
          placeholder={t('Find a project…')}
          emptyText={t('No project matches.')}
          source={items}
          getKey={(i) => i.key}
          getLabel={(i) => i.label}
          getPath={(i) => i.path}
          getKeywords={itemKeywords}
          getSecondary={(i) => i.meta}
          pinned={[firstKey]}
          selected={[current.key]}
          rankContext={rankContext}
          renderLeading={(i) => (i.color
            ? <span aria-hidden className="flex h-6 w-6 items-center justify-center"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: i.color }} /></span>
            : <span aria-hidden className="flex h-6 w-6 items-center justify-center text-faint"><Icon name={i.key === INBOX_KEY ? 'inbox' : 'circle'} /></span>)}
          onPick={(i) => { if (i.value !== value) onChange(i.value) }}
          onClose={() => setOpen(false)}
        />
      </Popover>
    </>
  )
}
