// The Notes page's one filter row (OpenSpec change notes-overview, design D7):
// Source as a compact menu, Project and Label as compact pickers on the Combobox.
// On a phone the three sit behind one Filters button that opens a sheet.
import { useMemo, useRef, useState } from 'react'
import { NO_NOTE_FILTERS, type NoteFilters as Filters, type NoteSource } from '../../lib/noteList'
import { itemKeywords, NONE_KEY, projectSource, type PickerItem } from '../../lib/pickerSources'
import type { Label, Project } from '../../lib/types'
import { ComboboxPanel, Dialog, Icon, Menu, MenuItem, Popover } from '../../ui'
import { t } from '../../lib/i18n'

export const SOURCE_LABELS: Record<'all' | NoteSource, () => string> = {
  all: () => t('All notes'),
  task: () => t('Task notes'),
  project: () => t('Project notes'),
  note: () => t('Standalone only'),
}
const SOURCES = ['all', 'task', 'project', 'note'] as const

const TRIGGER = 'ui-btn ui-btn--ghost ui-btn--sm touch-target max-w-56 gap-1.5 px-2'

/** A compact trigger with a Combobox in a popover: one choice of `items`, the first meaning "any". */
function FilterPicker({ label, placeholder, emptyText, items, value, onPick, testId }: {
  label: string; placeholder: string; emptyText: string; items: PickerItem[]; value: string | null; onPick: (value: string | null) => void; testId: string
}) {
  const [open, setOpen] = useState(false)
  const anchor = useRef<HTMLButtonElement>(null)
  const current = items.find((i) => i.value === value) ?? items[0]
  const active = value !== null
  return (
    <>
      <button ref={anchor} type="button" className={`${TRIGGER} ${active ? 'bg-selected text-default' : 'text-muted'}`} aria-haspopup="dialog" aria-expanded={open}
        aria-label={`${label}: ${current.label}`} data-note-filter={testId} onClick={() => setOpen(true)}>
        {current.color ? <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: current.color }} /> : null}
        <span className="min-w-0 truncate">{current.label}</span>
        <Icon name="chevron-down" size="xs" className="shrink-0 text-faint" />
      </button>
      <Popover open={open} onClose={() => setOpen(false)} anchor={anchor} label={label} align="start" width="sm:w-72" className="p-2">
        <ComboboxPanel<PickerItem>
          label={label} placeholder={placeholder} emptyText={emptyText}
          source={items} getKey={(i) => i.key} getLabel={(i) => i.label} getPath={(i) => i.path} getKeywords={itemKeywords}
          pinned={[NONE_KEY]} selected={[current.key]} rankContext={`notes.${testId}`}
          renderLeading={(i) => <span aria-hidden className="flex h-6 w-6 items-center justify-center">
            {i.color ? <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: i.color }} /> : <Icon name={testId === 'label' ? 'tag' : 'folder'} className="text-faint" />}
          </span>}
          onPick={(i) => { onPick(i.value); setOpen(false) }}
          onClose={() => setOpen(false)} />
      </Popover>
    </>
  )
}

export interface NoteFilterProps {
  filters: Filters
  onChange: (next: Filters) => void
  projects: readonly Project[]
  labels: readonly Label[]
}

/** Source, Project and Label, each a compact control (a row on a computer, stacked in the phone's sheet). */
export function NoteFilterControls({ filters, onChange, projects, labels }: NoteFilterProps) {
  const projectItems = useMemo<PickerItem[]>(() => [
    { key: NONE_KEY, value: null, label: t('All projects'), path: [] },
    ...projectSource(projects.filter((p) => !p.deleted_at && !p.archived), { inbox: false }),
  ], [projects])
  const labelItems = useMemo<PickerItem[]>(() => [
    { key: NONE_KEY, value: null, label: t('All labels'), path: [] },
    ...labels.filter((l) => !l.deleted_at).map((l) => ({ key: l.id, value: l.id, label: l.name, path: [], color: l.color })),
  ], [labels])
  return (
    <>
      <Menu kind="menu" label={t('Source')} title={t('Source')} align="start" width="sm:w-52"
        trigger={<><span className="sr-only">{t('Source')}: </span><span className="min-w-0 truncate">{SOURCE_LABELS[filters.source]()}</span><Icon name="chevron-down" size="xs" className="shrink-0 text-faint" /></>}
        triggerClassName={`${TRIGGER} ${filters.source !== 'all' ? 'bg-selected text-default' : 'text-muted'}`} namedByContent
        triggerProps={{ 'data-note-filter': 'source' }}>
        {SOURCES.map((s) => <MenuItem key={s} label={SOURCE_LABELS[s]()} checked={filters.source === s} onSelect={() => onChange({ ...filters, source: s })} />)}
      </Menu>
      <FilterPicker label={t('Project')} placeholder={t('Find a project…')} emptyText={t('No project matches.')} items={projectItems}
        value={filters.projectId} onPick={(projectId) => onChange({ ...filters, projectId })} testId="project" />
      <FilterPicker label={t('Label')} placeholder={t('Find a label…')} emptyText={t('No label matches.')} items={labelItems}
        value={filters.labelId} onPick={(labelId) => onChange({ ...filters, labelId })} testId="label" />
    </>
  )
}

/** How many filters are set (the phone's Filters button shows it). */
export function activeFilters(f: Filters): number {
  return (f.source !== 'all' ? 1 : 0) + (f.projectId ? 1 : 0) + (f.labelId ? 1 : 0)
}

/** The phone's Filters button and its sheet. */
export function NoteFiltersSheet(props: NoteFilterProps) {
  const [open, setOpen] = useState(false)
  const n = activeFilters(props.filters)
  return (
    <>
      <button type="button" className={`${TRIGGER} shrink-0 ${n ? 'bg-selected text-default' : 'text-muted'}`} aria-haspopup="dialog" aria-expanded={open}
        data-note-filters-button onClick={() => setOpen(true)}>
        <Icon name="sliders-horizontal" />
        {n ? t('Filters ({n})', { n }) : t('Filters')}
      </button>
      {open && (
        <Dialog title={t('Filters')} onClose={() => setOpen(false)} placement="sheet" testId="note-filters-sheet">
          <div className="flex flex-col items-start gap-2" data-note-filters-sheet>
            <NoteFilterControls {...props} />
            {n > 0 && <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm touch-target px-2 text-accent" onClick={() => props.onChange(NO_NOTE_FILTERS)}>{t('Clear filters')}</button>}
          </div>
        </Dialog>
      )}
    </>
  )
}
