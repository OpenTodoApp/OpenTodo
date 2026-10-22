// A saved list view (OpenSpec `custom-views`): its query in an editable input, the
// grouping and sort options in the header, and live results from the view runner.
// A dashboard is rendered by DashboardView instead.
import { blockedMap } from '../lib/dependencies'
import { Button, EmptyState, PageBody, PageHeader, Dialog } from '../ui'
import { type KeyboardEvent as ReactKeyboardEvent, useEffect, useMemo, useRef, useState } from 'react'
import { parse } from '../lib/filter'
import { resolveLabels } from '../lib/labels'
import { hasTimeColumn } from '../lib/rowTime'
import { setTaskCompleted } from '../lib/ops'
import { breadcrumbOf, progressMap } from '../lib/subtasks'
import { GROUP_BY_OPTIONS, SORT_BY_OPTIONS, type GroupBy, type SortBy, type SortDir, type View } from '../lib/types'
import { runView, updateView, viewOptions } from '../lib/views'
import { setFavourite } from '../lib/favourites'
import { DashboardView } from './DashboardView'
import { LabelPicker } from './LabelPicker'
import { setPanelTaskId, usePanelTaskId } from './panel'
import { TaskRow } from './TaskRow'
import { ViewMenu } from './ViewsView'
import { useListKeys } from './useListKeys'
import { useBulkList } from './bulk/useBulkList'
import { placeInDay } from './signals'
import { logicalToday } from '../lib/dates'
import { habitStatsMap } from '../lib/habits'
import { useViewData, type ViewData } from './useViews'
import { t, msg, translatedMap } from '../lib/i18n'
import { keysOf } from '../lib/shortcuts'
import { act } from './actionError'

const GROUP_LABEL = translatedMap<GroupBy>({ project: msg('Project'), due: msg('Due date'), priority: msg('Priority'), label: msg('Label'), none: msg('None') })
const SORT_LABEL = translatedMap<SortBy>({ due: msg('Due date'), priority: msg('Priority'), position: msg('Manual order'), created: msg('Created'), title: msg('Title') })

function parseError(src: string): string | null {
  if (!src.trim()) return t('The query must not be empty')
  try {
    parse(src)
    return null
  } catch (e) {
    return (e as Error).message
  }
}

export function SavedViewRoute({ id }: { id: string }) {
  const data = useViewData()
  const view = data.views.find((v) => v.id === id)
  if (!view) {
    return <p className="px-4 py-10 text-center text-body text-faint">{t('This view does not exist (it may have been deleted on another device).')}</p>
  }
  return view.kind === 'dashboard' ? <DashboardView key={id} dashboard={view} data={data} /> : <SavedViewView key={id} view={view} data={data} />
}

export function SavedViewView({ view, data }: { view: View; data: ViewData }) {
  const { projects, labels, tasks, ctx } = data
  const opts = viewOptions(view)
  const result = useMemo(() => runView(view, ctx), [view, ctx])
  const projectMap = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects])
  const labelMap = useMemo(() => new Map(labels.map((l) => [l.id, l])), [labels])
  const taskMap = useMemo(() => new Map(tasks.map((tk) => [tk.id, tk])), [tasks])
  const progress = useMemo(() => progressMap(tasks), [tasks])
  const blocked = useMemo(() => blockedMap(tasks), [tasks])
  const habits = useMemo(() => habitStatsMap(tasks, ctx.today), [tasks, ctx.today])

  // ---- query editing: the input holds a draft; Enter (or Save) confirms it ----
  const [draft, setDraft] = useState(view.query)
  const [draftError, setDraftError] = useState<string | null>(null)
  const lastSaved = useRef(view.query)
  // A remote edit of the query replaces the draft unless the user is mid-edit.
  useEffect(() => {
    if (draft === lastSaved.current) setDraft(view.query)
    lastSaved.current = view.query
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only a remote query change triggers this; the draft is read, not a trigger
  }, [view.query])
  const dirty = draft.trim() !== view.query
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  async function saveQuery() {
    const err = parseError(draft)
    setDraftError(err)
    if (err) return
    await updateView(view.id, { query: draft })
    listRef.current?.focus()
  }
  function onInputKey(e: ReactKeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (dirty) void saveQuery()
      else listRef.current?.focus()
    } else if (e.key === 'Escape') {
      e.stopPropagation()
      setDraft(view.query)
      setDraftError(null)
    }
  }

  // ---- results and keyboard navigation (a task can appear under several labels) ----
  const groups = useMemo(() => (result.ok ? result.groups : []), [result])
  const rows = useMemo(() => groups.flatMap((g) => g.tasks.map((item) => ({ key: `${g.key}:${item.id}`, task: item }))), [groups])
  // The time column (rows-v2 D2): one fact of the whole view.
  const timeColumn = useMemo(() => hasTimeColumn(rows.map((r) => r.task)), [rows])
  const [selected, setSelected] = useState<string | null>(null)
  const openId = usePanelTaskId()
  const setOpenId = setPanelTaskId
  const [pickerFor, setPickerFor] = useState<string | null>(null)
  const bulkTasks = useMemo(() => rows.map((r) => r.task), [rows])
  const bulk = useBulkList(bulkTasks)

  useListKeys({
    rows, selected, setSelected, openId, setOpenId, pickerFor, setPickerFor, bulk,
    onIdleEscape: () => setSelected(null),
    extra: {
      'list.schedule': () => {
        const row = rows.find((r) => r.key === selected)?.task
        if (!row || row.completed_at) return false
        placeInDay(row, logicalToday())
      },
      'view.edit-query': () => inputRef.current?.focus(),
    },
  })

  useEffect(() => {
    if (!selected) return
    const i = selected.lastIndexOf(':')
    document.querySelector(`[data-group="${CSS.escape(selected.slice(0, i))}"] [data-task-id="${CSS.escape(selected.slice(i + 1))}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [selected])

  const message = draftError ?? (!dirty && !result.ok ? result.error : null)
  const count = result.ok ? result.tasks.length : null

  return (
    <PageBody width="list">
          <PageHeader title={view.name} meta={count !== null ? count : undefined} help="saved-filter"
            leading={<span className="inline-block h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: view.color }} aria-hidden />}
            actions={<Button variant="ghost" size="sm" icon={view.pinned ? 'pin-off' : 'pin'} onClick={() => act(setFavourite('view', view.id, !view.pinned))}>{view.pinned ? t('Unpin') : t('Pin')}</Button>}
            menu={<ViewMenu view={view} />} />

          <div className="mb-3 border-b border-default pb-2">
            <div className="flex gap-2">
              <input ref={inputRef} className="ui-input font-mono" aria-label={t('View query')} aria-invalid={!!message} aria-describedby="view-message"
                autoComplete="off" autoCapitalize="off" autoCorrect="off" spellCheck={false}
                value={draft} onChange={(e) => { setDraft(e.target.value); setDraftError(null) }} onKeyDown={onInputKey} />
              {dirty && <button className="ui-btn ui-btn--primary ui-btn--sm shrink-0 text-meta" onClick={() => void saveQuery()}>{t('Save')}</button>}
            </div>
            <div id="view-message" className="min-h-5 px-1 pt-1 text-meta" aria-live="polite">
              {message ? (
                <p role="alert" className="text-danger">{message}</p>
              ) : dirty ? (
                <p className="text-faint">{t('Enter saves the query for every device · Esc discards the change')}</p>
              ) : result.ok && result.warnings.length > 0 ? (
                <p className="text-warning">{result.warnings.join(' · ')}</p>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-meta text-muted">
              <label className="flex items-center gap-1.5">{t('Group')}
                <select className="ui-input w-auto py-1 text-meta" aria-label={t('Group by')} value={opts.groupBy}
                  onChange={(e) => act(updateView(view.id, { group_by: e.target.value as GroupBy }))}>
                  {GROUP_BY_OPTIONS.map((g) => <option key={g} value={g}>{GROUP_LABEL[g]}</option>)}
                </select>
              </label>
              <label className="flex items-center gap-1.5">{t('Sort')}
                <select className="ui-input w-auto py-1 text-meta" aria-label={t('Sort by')} value={opts.sortBy}
                  onChange={(e) => act(updateView(view.id, { sort_by: e.target.value as SortBy }))}>
                  {SORT_BY_OPTIONS.map((s) => <option key={s} value={s}>{SORT_LABEL[s]}</option>)}
                </select>
              </label>
              <label className="flex items-center gap-1.5">{t('Direction')}
                <select className="ui-input w-auto py-1 text-meta" aria-label={t('Sort direction')} value={opts.sortDir}
                  onChange={(e) => act(updateView(view.id, { sort_dir: e.target.value as SortDir }))}>
                  <option value="asc">{opts.sortBy === 'priority' ? t('Ascending (p4 first)') : t('Ascending')}</option>
                  <option value="desc">{opts.sortBy === 'priority' ? t('Descending (p1 first)') : t('Descending')}</option>
                </select>
              </label>
            </div>
          </div>

          {result.ok && rows.length === 0 && (
            <div data-empty-state="saved-view">
              <EmptyState title={t('No task matches this view.')} action={{ label: t('Edit the view'), onClick: () => inputRef.current?.focus(), shortcut: keysOf('view.edit-query') }} />
            </div>
          )}

          {bulk.render(rows.find((r) => r.key === selected)?.task.id ?? null)}
          <div ref={listRef} tabIndex={-1} className="outline-none" role="region" aria-label={t('View results')}>
            {groups.map((g) => (
              <section key={g.key} data-group={g.key} className="mb-4">
                {g.heading && <h2 className="mb-1 px-2 text-meta font-semibold uppercase tracking-wide text-faint">{g.heading}</h2>}
                <ul>
                  {g.tasks.map((tk) => {
                    const key = `${g.key}:${tk.id}`
                    return (
                        <TaskRow
                          key={key}
                          task={tk}
                          project={tk.project_id ? projectMap.get(tk.project_id) : undefined}
                          labels={resolveLabels(tk.labels, labelMap)}
                          showProject={opts.groupBy !== 'project'}
                          timeColumn={timeColumn}
                          onMore={(from) => { setSelected(key); bulk.openActions(null, from) }}
                          selected={key === selected}
                          progress={progress.get(tk.id)}
                          blockedBy={blocked.get(tk.id)}
                          habit={habits.get(tk.id)}
                          breadcrumb={tk.parent_id ? breadcrumbOf(tk, taskMap) : null}
                          onToggle={() => act(setTaskCompleted(tk.id, !tk.completed_at))}
                          onOpen={() => { setSelected(key); setOpenId(tk.id) }}
                          {...bulk.rowProps(tk.id)}
                        />
                    )
                  })}
                </ul>
              </section>
            ))}
          </div>
      {pickerFor && (
        <Dialog title={t('Labels')} label={t('Labels for task')} onClose={() => setPickerFor(null)}>
          <LabelPicker taskId={pickerFor} onClose={() => setPickerFor(null)} />
        </Dialog>
      )}
    </PageBody>
  )
}
