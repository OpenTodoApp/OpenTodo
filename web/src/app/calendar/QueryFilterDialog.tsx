// Filter… of the Calendar and of Upcoming (OpenSpec change calendar-clarity, design D4):
// a query in the filter language and label checkboxes that write its `@label` clause.
// Every valid edit applies at once (the calendar behind follows); an invalid one shows
// the parser's error here and keeps the last valid filter active. Loaded lazily.
import { useId, useMemo, useState } from 'react'
import type { FilterContext } from '../../lib/filter'
import { splitLabels, withLabels } from '../../lib/filter/labelTerms'
import { t } from '../../lib/i18n'
import { activeLabels } from '../../lib/labels'
import { Button, Dialog, Field, hueFor, Input } from '../../ui'
import { queryError } from './queryFilter'

export default function QueryFilterDialog({ title, query, ctx, onApply, onClose }: {
  title: string
  query: string
  ctx: FilterContext
  onApply: (query: string) => void
  onClose: () => void
}) {
  const [draft, setDraft] = useState(query)
  const error = useMemo(() => queryError(draft, ctx), [draft, ctx])
  const labels = useMemo(() => activeLabels([...ctx.labels]), [ctx.labels])
  const split = useMemo(() => splitLabels(draft), [draft])
  const checked = new Set((split?.names ?? []).map((n) => n.toLocaleLowerCase()))
  const groupId = useId()

  const edit = (next: string) => {
    setDraft(next)
    if (queryError(next, ctx) === null) onApply(next)
  }
  const toggle = (name: string, on: boolean) => {
    const names = (split?.names ?? []).filter((n) => n.toLocaleLowerCase() !== name.toLocaleLowerCase())
    const next = withLabels(draft, on ? [...names, name] : names)
    if (next !== null) edit(next)
  }

  return (
    <Dialog title={title} onClose={onClose} size="md" testId="query-filter">
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (!error) onClose() }}>
        <Field label={t('Query')} description={error ? undefined : t('The filter language of saved views, for example ##Work & p1 or @errand.')} error={error ?? undefined}>
          <Input autoFocus value={draft} onChange={(e) => edit(e.target.value)} spellCheck={false} autoComplete="off" data-query-filter-input
            placeholder="##Work & p1" />
        </Field>
        {labels.length > 0 && (
          <fieldset aria-labelledby={groupId} disabled={!split} className="space-y-1">
            <legend id={groupId} className="text-body font-medium text-default">{t('Labels')}</legend>
            <p className="text-meta text-muted">{t('Tasks with any of the ticked labels.')}</p>
            <ul className="grid max-h-56 grid-cols-1 gap-x-3 overflow-y-auto sm:grid-cols-2">
              {labels.map((l) => (
                <li key={l.id}>
                  <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-control px-1 text-body sm:min-h-8 hover:bg-hover">
                    <input type="checkbox" checked={checked.has(l.name.toLocaleLowerCase())} onChange={(e) => toggle(l.name, e.target.checked)} data-query-filter-label={l.name} />
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-hue-solid" data-hue={hueFor(l.color)} aria-hidden />
                    <span className="min-w-0 truncate">{l.name}</span>
                  </label>
                </li>
              ))}
            </ul>
          </fieldset>
        )}
        <div className="flex items-center justify-end gap-2">
          {query && <Button variant="ghost" onClick={() => { onApply(''); onClose() }} data-query-filter-remove>{t('Clear filter')}</Button>}
          <Button type="submit" variant="primary" disabled={!!error}>{t('Done')}</Button>
        </div>
      </form>
    </Dialog>
  )
}
