// "+ Add step", search first (OpenSpec change routines-editor, design D6; inline
// since routines-editor-no-modals): the step catalogue expands in place, where
// "+ Add step" was pressed, never as a dialog. A search field (focused) over the
// catalogue (names, descriptions and synonyms in the user's language and in
// English), then at most six suggestions for the output type of the step above,
// then the catalogue's groups, in the same list the word pickers use (arrow
// keys, Enter, Escape collapses it and focus goes back). Unavailable steps are
// left out of the suggestions and the groups and appear under the search
// results dimmed, with their hint and a link to the setting.
import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { t } from '../../lib/i18n'
import { isAvailable, reasonHint, settingPath, type Catalogue } from '../../lib/rules/catalogue'
import { GROUP_NAME, GROUPS, searchKinds, stepDescription, stepName } from '../../lib/rules/sentence'
import { STEPS } from '../../lib/rules/steps'
import type { RoutineStepType } from '../../lib/types'
import { ComboboxField, ComboboxList, Icon, IconButton, useCombobox } from '../../ui'

/** Suggestions per output type of the step above, best first (D6). */
// A list flows into every task step, so Add a comment follows Tasks; Pick
// (take) chooses which items; Get a specific task is never suggested
// (routines-dynamic-data D2, D4).
const SUGGEST: Record<RoutineStepType | 'start', string[]> = {
  lines: ['create_tasks', 'take', 'count', 'join', 'sort', 'append_to_note'],
  tasks: ['change_tasks', 'add_comment', 'take', 'sort', 'count', 'repeat'],
  text: ['split_lines', 'notify', 'create_tasks', 'replace', 'email_me', 'append_to_note'],
  number: ['if', 'notify', 'format'],
  task: ['change_tasks', 'add_comment', 'note_text', 'start_timer', 'project_of'],
  project: ['create_tasks', 'note_text', 'update_project', 'create_sections'],
  date: ['create_tasks', 'find_tasks', 'format'],
  none: ['find_tasks', 'create_tasks', 'note_text', 'notify', 'format', 'if'],
  start: ['find_tasks', 'create_tasks', 'note_text', 'notify', 'format', 'split_lines'],
}

/**
 * Kinds found by search only: Get a specific task (the rare fixed target) and
 * Filter (Pick's "the ones where" mode), routines-dynamic-data D2, D4.
 */
const SEARCH_ONLY = new Set(['get_task', 'filter'])

/** The suggested kinds after a step with this output, available only, at most six. */
export function suggestions(above: RoutineStepType | 'start', cat: Catalogue | null): string[] {
  return SUGGEST[above].filter((k) => isAvailable(cat, k)).slice(0, 6)
}

/** One row of the catalogue: a kind under a heading (a kind can be both suggested and in its group). */
interface Entry { key: string; kind: string; group: string }

/** The catalogue without a query: the suggestions, then each group's available kinds. */
function browseEntries(above: RoutineStepType | 'start', cat: Catalogue | null): Entry[] {
  const out: Entry[] = suggestions(above, cat).map((kind) => ({ key: `s:${kind}`, kind, group: t('Suggested') }))
  for (const g of GROUPS) {
    for (const k of STEPS) {
      if (k.group === g && !SEARCH_ONLY.has(k.kind) && isAvailable(cat, k.kind)) out.push({ key: k.kind, kind: k.kind, group: t(GROUP_NAME[g]) })
    }
  }
  return out
}

const NONE: Entry[] = []

/**
 * The step catalogue, expanded in place under "+ Add step" (or between two
 * cards for "Add step below"). Picking a kind inserts it there; Escape or the
 * close button collapses the catalogue and `onClose` puts focus back.
 */
export function AddStepPanel({ id, above, catalogue, onPick, onClose }: {
  /** The element id, for the opener's aria-controls. */
  id?: string
  above: RoutineStepType | 'start'; catalogue: Catalogue | null; onPick: (kind: string) => void; onClose: () => void
}) {
  const panel = useRef<HTMLElement>(null)
  const picked = useRef(false)
  const browse = useMemo(() => browseEntries(above, catalogue), [above, catalogue])
  // Search keeps the catalogue's own matching (every word anywhere in the name, description or
  // synonyms, in the user's language and in English): its results are the list's entries.
  const [query, setQuery] = useState('')
  const found = useMemo(() => (query ? searchKinds(query) : []), [query])
  const results = useMemo(() => found.filter((k) => isAvailable(catalogue, k)).map((kind): Entry => ({ key: kind, kind, group: t('Results') })), [found, catalogue])
  const dimmed = found.filter((k) => !isAvailable(catalogue, k))
  const state = useCombobox<Entry>({
    source: NONE, emptySource: browse, prefix: results,
    getKey: (e) => e.key, getLabel: (e) => stepName(e.kind), getSecondary: (e) => stepDescription(e.kind), getGroup: (e) => e.group,
    onPick: (e) => { picked.current = true; onPick(e.kind) },
    onClose: () => { if (!picked.current) onClose() },
  })
  // The field's text reaches the results before the frame is painted.
  useLayoutEffect(() => setQuery(state.query.trim()), [state.query])
  // The catalogue comes into view with its search field.
  useLayoutEffect(() => { panel.current?.scrollIntoView?.({ block: 'nearest' }) }, [])
  return (
    <section ref={panel} id={id} className="surface-card space-y-2 p-3" aria-label={t('Add step')} data-add-step-panel data-overlay="inline">
      <div className="flex items-center gap-2">
        <h3 className="min-w-0 flex-1 text-meta font-medium text-muted">{t('Add step')}</h3>
        <IconButton size="sm" icon="x" label={t('Close')} onClick={onClose} data-add-step-close />
      </div>
      <ComboboxField state={state} label={t('Search steps')} placeholder={t('Search steps')} expanded autoFocus />
      <div data-add-results={query ? '' : undefined} data-add-browse={query ? undefined : ''}>
        <ComboboxList state={state} label={t('Steps')} emptyText={dimmed.length ? undefined : t('No step matches.')}
          renderLeading={(e) => <span data-add-kind={e.kind} data-add-suggested={e.key.startsWith('s:') || undefined} className="flex"><Icon name="plus" className="text-faint" /></span>} />
      </div>
      {dimmed.length > 0 && (
        <ul className="space-y-0.5 border-t border-default pt-2" aria-label={t('Not available here')} data-add-unavailable>
          {dimmed.map((k) => {
            const entry = catalogue?.[k]
            const link = settingPath(entry?.setting)
            return (
              <li key={k} className="flex items-start gap-2.5 px-2.5 py-1.5 text-faint" data-add-kind={k} data-unavailable>
                <Icon name="lock" className="mt-0.5" />
                <span className="min-w-0 flex-1">
                  <span className="block text-body">{stepName(k)}</span>
                  <span className="block text-meta">{reasonHint(entry?.reason)}</span>
                  {link && <a className="text-meta text-accent underline" href={link}>{t('Open the setting')}</a>}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
