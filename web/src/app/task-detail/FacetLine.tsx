// One facet line of the task panel (OpenSpec change task-panel-facets, design D2):
// a leading icon, then the parts separated by a middle dot. Each part is a button
// that opens its editor (a span for viewers); labels render as chips. Activating
// the part whose editor is open closes it (task-panel-polish "Popover triggers
// toggle"); the popover itself treats the part as its trigger, not as outside.
import { Fragment, type ReactElement } from 'react'
import type { FacetId, FacetPart } from '../../lib/facets'
import { Icon, type IconName, Tooltip } from '../../ui'
import { LabelChip } from '../LabelPicker'

const TONE: Record<string, string> = {
  overdue: 'text-danger',
  today: 'text-accent',
  soon: 'text-default',
  later: 'text-default',
  warning: 'text-(--ot-hue-orange-text)',
}

export interface FacetLineProps {
  facet: FacetId
  icon: IconName
  /** The facet's name: the line's accessible name and the start of each part's. */
  name: string
  parts: FacetPart[]
  readOnly?: boolean
  /** The part whose editor is open. */
  open?: string | null
  onPart?: (part: FacetPart, el: HTMLButtonElement) => void
  /** Collects each part's button, so a popover can anchor to it. */
  partRef?: (id: string, el: HTMLButtonElement | null) => void
}

const withTip = (tip: string | undefined, el: ReactElement<Record<string, unknown>>) => (tip ? <Tooltip label={tip}>{el}</Tooltip> : el)

export function FacetLine({ facet, icon, name, parts, readOnly = false, open = null, onPart, partRef }: FacetLineProps) {
  return (
    <div role="group" aria-label={name} data-facet={facet} className="facet-line flex min-w-0 items-start gap-2">
      <Tooltip label={name}>
        <span className="flex h-7 w-5 shrink-0 items-center justify-center text-faint" aria-hidden="true"><Icon name={icon} size="sm" /></span>
      </Tooltip>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-1 gap-y-0.5 text-body">
        {parts.map((p, i) => {
          const tone = p.empty ? 'text-faint' : TONE[p.tone ?? ''] ?? 'text-default'
          const content = p.labels?.length
            ? <span className="flex flex-wrap items-center gap-1">{p.labels.map((l) => <LabelChip key={l.id} label={l} />)}</span>
            : <span className="truncate">{p.text}</span>
          return (
            <Fragment key={p.id}>
              {i > 0 && <span aria-hidden="true" className="text-faint">{p.sep ?? '·'}</span>}
              {readOnly || p.fixed ? (
                <span className={`inline-flex min-h-7 max-w-full items-center px-1 ${tone}`} data-part={p.id}>{content}</span>
              ) : withTip(p.tip, (
                <button type="button" ref={(el) => partRef?.(p.id, el)} data-part={p.id}
                  aria-expanded={p.id === 'origin' ? undefined : open === p.id} aria-haspopup={p.id === 'origin' ? undefined : 'dialog'}
                  aria-label={`${name} · ${p.text}`}
                  className={`inline-flex min-h-7 max-w-full items-center rounded-control px-1 text-left hover:bg-sunken focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus dark:hover:bg-raised ${open === p.id ? 'bg-sunken dark:bg-raised' : ''} ${tone}`}
                  onClick={(e) => onPart?.(p, e.currentTarget)}>
                  {content}
                </button>
              ))}
            </Fragment>
          )
        })}
      </div>
    </div>
  )
}
