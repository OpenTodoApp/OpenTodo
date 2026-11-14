// The Completed view's own controls (OpenSpec change completed-view-review, D1): a
// search row where the other lists have their quick add, and the header's display
// button for the projects it is narrowed to and its grouping. The panel's content
// loads with the first open of the button; everything applies at once, on this device.
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import type { CompletedDisplay } from '../../lib/completedDisplay'
import { t } from '../../lib/i18n'
import { Icon, IconButton, Input, Popover } from '../../ui'

const loadBody = () => import('./CompletedOptionsBody')
const CompletedOptionsBody = lazy(loadBody)

/** Search inside the completed tasks shown: title and notes, every word. */
export function CompletedSearch({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <div className="relative mb-3" data-completed-search>
      <span aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint"><Icon name="search" /></span>
      <Input type="search" value={value} onChange={(e) => onChange(e.target.value)} aria-label={t('Search completed tasks')}
        placeholder={t('Search')} className="pl-9" onKeyDown={(e) => { if (e.key === 'Escape' && value) { e.stopPropagation(); onChange('') } }} />
    </div>
  )
}

/** The header's display button: Group by and the projects shown. */
export function CompletedOptions({ value }: { value: CompletedDisplay }) {
  const [open, setOpen] = useState(false)
  const anchor = useRef<HTMLButtonElement>(null)
  useEffect(() => { void loadBody() }, [])
  const narrowed = value.projects.length > 0 || value.groupBy !== 'day'
  return (
    <>
      <IconButton ref={anchor} icon="sliders-horizontal" size="sm" label={t('Display options')} aria-haspopup="dialog" aria-expanded={open}
        data-display-trigger data-narrowed={narrowed ? '' : undefined}
        className={open || narrowed ? 'bg-selected text-default' : ''} onClick={() => setOpen(!open)} />
      <Popover open={open} onClose={() => setOpen(false)} anchor={anchor} label={t('Display options')} width="sm:w-[22rem]" className="p-0">
        <Suspense fallback={null}><CompletedOptionsBody value={value} /></Suspense>
      </Popover>
    </>
  )
}
