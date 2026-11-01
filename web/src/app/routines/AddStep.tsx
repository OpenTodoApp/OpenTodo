// "+ Add step", search first (OpenSpec change routines-editor, design D6): a
// search field over the step catalogue (names, descriptions and synonyms in the
// user's language and in English), then at most six suggestions for the output
// type of the step above, then the catalogue's groups. Unavailable steps are left
// out of the suggestions and the groups and appear in search results dimmed,
// with their hint and a link to the setting.
import { useState } from 'react'
import { t } from '../../lib/i18n'
import { isAvailable, reasonHint, settingPath, type Catalogue } from '../../lib/rules/catalogue'
import { GROUP_NAME, GROUPS, searchKinds, stepDescription, stepName } from '../../lib/rules/sentence'
import { STEPS } from '../../lib/rules/steps'
import type { RoutineStepType } from '../../lib/types'
import { Dialog, Icon, Input } from '../../ui'

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

function KindButton({ kind, onPick, cat, dim }: { kind: string; onPick: (k: string) => void; cat: Catalogue | null; dim?: boolean }) {
  const entry = cat?.[kind]
  const link = dim ? settingPath(entry?.setting) : ''
  return (
    <li className={dim ? 'text-faint' : ''} data-add-kind={kind} data-unavailable={dim ? '' : undefined}>
      <button type="button" disabled={dim} onClick={() => onPick(kind)}
        className="flex min-h-11 w-full items-start gap-2 rounded-control px-2 py-1.5 text-left hover:bg-sunken disabled:cursor-not-allowed dark:hover:bg-raised">
        <Icon name={dim ? 'lock' : 'plus'} className="mt-0.5 text-faint" />
        <span className="min-w-0 flex-1">
          <span className="block text-body text-default">{stepName(kind)}</span>
          <span className="block text-meta text-muted">{dim ? reasonHint(entry?.reason) : stepDescription(kind)}</span>
        </span>
      </button>
      {link && <a className="ml-8 text-meta text-accent underline" href={link}>{t('Open the setting')}</a>}
    </li>
  )
}

export function AddStepSheet({ above, catalogue, onPick, onClose }: {
  above: RoutineStepType | 'start'; catalogue: Catalogue | null; onPick: (kind: string) => void; onClose: () => void
}) {
  const [query, setQuery] = useState('')
  const all = STEPS.map((k) => k.kind)
  const found = query.trim() ? searchKinds(query) : []
  const suggested = suggestions(above, catalogue)
  return (
    <Dialog title={t('Add step')} onClose={onClose} size="md" placement="sheet" testId="add-step">
      <div className="space-y-3">
        <Input autoFocus type="search" aria-label={t('Search steps')} placeholder={t('Search steps')} value={query} onChange={(e) => setQuery(e.target.value)} />
        {query.trim() ? (
          <section aria-label={t('Results')}>
            {found.length === 0 && <p className="text-meta text-muted">{t('No step matches.')}</p>}
            <ul className="space-y-0.5" data-add-results>
              {found.map((k) => <KindButton key={k} kind={k} cat={catalogue} onPick={onPick} dim={!isAvailable(catalogue, k)} />)}
            </ul>
          </section>
        ) : (
          <>
            {suggested.length > 0 && (
              <section aria-labelledby="add-step-suggested">
                <h3 id="add-step-suggested" className="text-meta font-medium text-muted">{t('Suggested')}</h3>
                <ul className="mt-1 space-y-0.5" data-add-suggested>
                  {suggested.map((k) => <KindButton key={k} kind={k} cat={catalogue} onPick={onPick} />)}
                </ul>
              </section>
            )}
            {GROUPS.map((g) => {
              const kinds = all.filter((k) => !SEARCH_ONLY.has(k) && STEPS.find((x) => x.kind === k)!.group === g && isAvailable(catalogue, k))
              if (!kinds.length) return null
              return (
                <details key={g} className="group" data-add-group={g} open={typeof window !== 'undefined' && window.matchMedia?.('(min-width: 40rem)').matches}>
                  <summary className="flex min-h-11 cursor-pointer items-center gap-2 text-body font-medium text-default">
                    <Icon name="chevron-right" className="transition-transform group-open:rotate-90" />{t(GROUP_NAME[g])}
                  </summary>
                  <ul className="space-y-0.5">{kinds.map((k) => <KindButton key={k} kind={k} cat={catalogue} onPick={onPick} />)}</ul>
                </details>
              )
            })}
          </>
        )}
      </div>
    </Dialog>
  )
}
