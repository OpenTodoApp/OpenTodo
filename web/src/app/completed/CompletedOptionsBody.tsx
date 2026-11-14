// The Completed view's display panel (OpenSpec change completed-view-review, D1): Group
// by Day or Project, then the projects it is narrowed to, chosen with the Combobox
// (the Inbox included); none chosen shows every completion. Loaded with the first open.
import { useMemo } from 'react'
import { setCompletedDisplay, type CompletedDisplay, type CompletedGroupBy } from '../../lib/completedDisplay'
import { t } from '../../lib/i18n'
import { useProjects } from '../../lib/localData'
import { INBOX_KEY, itemKeywords, projectSource, type PickerItem } from '../../lib/pickerSources'
import { Button, ComboboxPanel, Icon } from '../../ui'

export default function CompletedOptionsBody({ value }: { value: CompletedDisplay }) {
  const projects = useProjects()
  const items = useMemo(() => projectSource(projects.filter((p) => !p.deleted_at), { inbox: true }), [projects])
  // A project id, or '' for the Inbox, as the picker's keys.
  const keyOf = (i: PickerItem) => (i.key === INBOX_KEY ? '' : i.value ?? '')
  const selected = items.filter((i) => value.projects.includes(keyOf(i))).map((i) => i.key)
  const toggle = (i: PickerItem) => {
    const k = keyOf(i)
    setCompletedDisplay({ projects: value.projects.includes(k) ? value.projects.filter((p) => p !== k) : [...value.projects, k] })
  }
  return (
    <div data-display-panel data-completed-options className="text-meta">
      <div className="space-y-2 p-3">
        <div className="grid grid-cols-[1fr_10rem] items-center gap-3">
          <span className="text-muted" aria-hidden>{t('Group by')}</span>
          <select className="ui-input w-full py-1 text-meta" aria-label={t('Group by')} value={value.groupBy} data-completed-group
            onChange={(e) => setCompletedDisplay({ groupBy: e.target.value as CompletedGroupBy })}>
            <option value="day">{t('Day')}</option>
            <option value="project">{t('Project')}</option>
          </select>
        </div>
      </div>
      <div className="border-t border-default p-2" data-completed-projects>
        <ComboboxPanel<PickerItem>
          label={t('Projects')}
          placeholder={t('Find a project…')}
          emptyText={t('No project matches.')}
          source={items}
          getKey={(i) => i.key}
          getLabel={(i) => i.label}
          getPath={(i) => i.path}
          getKeywords={itemKeywords}
          multiple
          selected={selected}
          pinned={[INBOX_KEY]}
          renderLeading={(i) => (i.color
            ? <span aria-hidden className="flex h-6 w-6 items-center justify-center"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: i.color }} /></span>
            : <span aria-hidden className="flex h-6 w-6 items-center justify-center text-faint"><Icon name={i.key === INBOX_KEY ? 'inbox' : 'circle'} /></span>)}
          onPick={toggle}
        />
        {value.projects.length > 0 && (
          <div className="flex justify-end pt-2">
            <Button variant="ghost" size="sm" onClick={() => setCompletedDisplay({ projects: [] })} data-completed-all>{t('All projects')}</Button>
          </div>
        )}
      </div>
    </div>
  )
}
