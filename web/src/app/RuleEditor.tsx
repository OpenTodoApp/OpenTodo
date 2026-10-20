// The on-drop rule editor of a board column (OpenSpec change rule-boards, design
// D7): one control per rule kind, opened from Arrange (the choices first, so the
// dialog's first focus does not open the label list). Saving writes the whole rule
// as one view op (setOnDrop); "No rule" clears it. A label the rule names that was
// deleted since is shown as removed and can be taken out.
import { useMemo, useState } from 'react'
import { activeLabels } from '../lib/labels'
import { describeRule, knownRule } from '../lib/rules'
import { RULE_DUE, RULE_START, RULE_STATE, type Label, type OnDropRule, type Priority, type Project, type Section, type View } from '../lib/types'
import { setOnDrop } from '../lib/views'
import { Button, Combobox, Dialog, LabelChip } from '../ui'
import { ProjectPickerField } from './ProjectPickerField'
import { t, translatedMap, msg } from '../lib/i18n'

const DUE_LABEL = translatedMap({ today: msg('Today'), tomorrow: msg('Tomorrow'), 'next-week': msg('Next week'), clear: msg('No date') })
const START_LABEL = translatedMap({ someday: msg('Someday'), clear: msg('Clear the start') })
const STATE_LABEL = translatedMap({ complete: msg('Complete'), reopen: msg('Reopen') })

export interface RuleEditorProps {
  view: View
  labels: readonly Label[]
  projects: readonly Project[]
  sections: readonly Section[]
  onClose: () => void
}

type LabelKey = 'add_labels' | 'remove_labels'

function LabelsField({ title, ids, labels, onChange }: { title: string; ids: string[]; labels: readonly Label[]; onChange: (ids: string[]) => void }) {
  const live = useMemo(() => activeLabels([...labels]), [labels])
  const byId = new Map(labels.filter((l) => !l.deleted_at).map((l) => [l.id, l]))
  const toggle = (id: string) => onChange(ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id])
  return (
    <fieldset className="space-y-1">
      <legend className="text-meta font-medium text-muted">{title}</legend>
      {ids.length > 0 && (
        <ul className="flex flex-wrap gap-1" aria-label={title}>
          {ids.map((id) => {
            const l = byId.get(id)
            return (
              <li key={id} data-rule-label={l ? 'live' : 'removed'}>
                <LabelChip name={l ? l.name : t('Removed label')} color={l ? l.color : 'var(--color-faint)'} onRemove={() => toggle(id)} />
              </li>
            )
          })}
        </ul>
      )}
      <Combobox label={title} placeholder={t('Find a label…')} source={live} getKey={(l: Label) => l.id} getLabel={(l: Label) => l.name}
        multiple selected={ids} rankContext="label" emptyText={t('No labels yet.')}
        renderLeading={(l: Label) => <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ backgroundColor: l.color }} />}
        onPick={(l: Label) => toggle(l.id)} />
    </fieldset>
  )
}

function Choice<K extends string>({ label, value, options, names, onChange }: { label: string; value: K | undefined; options: readonly K[]; names: Record<K, string>; onChange: (v: K | undefined) => void }) {
  return (
    <label className="flex items-center justify-between gap-3 text-body">
      <span>{label}</span>
      <select className="ui-input w-44" value={value ?? ''} onChange={(e) => onChange((e.target.value || undefined) as K | undefined)}>
        <option value="">{t('Keep')}</option>
        {options.map((o) => <option key={o} value={o}>{names[o]}</option>)}
      </select>
    </label>
  )
}

/** Sets or clears one key of a draft rule. */
function withKey<K extends keyof OnDropRule>(rule: OnDropRule, key: K, value: OnDropRule[K] | undefined): OnDropRule {
  const next = { ...rule }
  if (value === undefined || (Array.isArray(value) && value.length === 0)) delete next[key]
  else next[key] = value
  return next
}

export function RuleEditor({ view, labels, projects, sections, onClose }: RuleEditorProps) {
  const [draft, setDraft] = useState<OnDropRule>(() => knownRule(view.on_drop) ?? {})
  const [error, setError] = useState<string | null>(null)
  const set = <K extends keyof OnDropRule>(key: K, value: OnDropRule[K] | undefined) => setDraft((d) => withKey(d, key, value))
  const save = (rule: OnDropRule | null) => {
    setError(null)
    setOnDrop(view.id, rule).then(onClose, (e: unknown) => setError(e instanceof Error ? e.message : String(e)))
  }
  const projectId = draft.section?.project_id ?? null
  const ownSections = sections.filter((s) => s.project_id === projectId && !s.deleted_at).sort((a, b) => a.position - b.position)
  const summary = describeRule(draft, { labels, projects, sections })
  const labelField = (key: LabelKey, title: string) => (
    <LabelsField title={title} ids={draft[key] ?? []} labels={labels} onChange={(ids) => set(key, ids)} />
  )
  return (
    <Dialog title={t('Rule for {name}', { name: view.name })} onClose={onClose} size="md" testId="rule-editor">
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); save(draft) }}>
        <p className="text-meta text-muted">{t('A card dropped on this column gets these changes.')}</p>
        <label className="flex items-center justify-between gap-3 text-body">
          <span>{t('Priority')}</span>
          <select className="ui-input w-44" value={draft.priority ?? ''} onChange={(e) => set('priority', e.target.value ? (Number(e.target.value) as Priority) : undefined)}>
            <option value="">{t('Keep')}</option>
            {[1, 2, 3, 4].map((p) => <option key={p} value={p}>{t('Priority {p}', { p })}</option>)}
          </select>
        </label>
        <Choice label={t('Date')} value={draft.due} options={RULE_DUE} names={DUE_LABEL} onChange={(v) => set('due', v)} />
        <Choice label={t('Start')} value={draft.start} options={RULE_START} names={START_LABEL} onChange={(v) => set('start', v)} />
        {labelField('add_labels', t('Add labels'))}
        {labelField('remove_labels', t('Remove labels'))}
        <div className="flex items-center justify-between gap-3 text-body">
          <span>{t('Project')}</span>
          <ProjectPickerField label={t('Project')} projects={projects} value={projectId} inbox={false} noneLabel={t('Keep')} rankContext="rule.project" className="w-44"
            onChange={(id) => set('section', id ? { project_id: id, section_id: null } : undefined)} />
        </div>
        {projectId && (
          <label className="flex items-center justify-between gap-3 text-body">
            <span>{t('Section')}</span>
            <select className="ui-input w-44" value={draft.section?.section_id ?? ''} onChange={(e) => set('section', { project_id: projectId, section_id: e.target.value || null })}>
              <option value="">{t('No section')}</option>
              {ownSections.map((s) => <option key={s.id} value={s.id}>{s.name || t('Untitled section')}</option>)}
            </select>
          </label>
        )}
        <Choice label={t('Status')} value={draft.state} options={RULE_STATE} names={STATE_LABEL} onChange={(v) => set('state', v)} />
        <p className="text-meta text-muted" aria-live="polite" data-rule-summary>{summary || t('No changes: this column is not a drop target.')}</p>
        {error && <p role="alert" className="text-meta text-danger">{error}</p>}
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => save(null)}>{t('No rule')}</Button>
          <Button type="button" variant="ghost" onClick={onClose}>{t('Cancel')}</Button>
          <Button type="submit" variant="primary">{t('Save')}</Button>
        </div>
      </form>
    </Dialog>
  )
}
