// One property of the task panel as a chip (OpenSpec change ux-overhaul, web-app
// "Task panel layout", design D4): the chip reads as its value and opens its
// editor on click or Enter; Escape or a committed edit closes the editor and puts
// focus back on the chip. The editor renders below the chip row (a full-width
// flex item), so pickers stay inside the property's own element.
import { useEffect, useId, useRef, useState, type FocusEvent, type KeyboardEvent, type ReactElement, type ReactNode } from 'react'
import { Icon, Tooltip, type IconName } from '../../ui'
import { t } from '../../lib/i18n'

const FOCUSABLE = 'input:not([disabled]), textarea:not([disabled]), select:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])'

export interface PropertyChipProps {
  /** Test and layout id: `data-property`. */
  id: string
  icon: IconName
  /** The property's name, announced before the value. */
  label: string
  value?: ReactNode
  /** Empty: `placeholder` reads quietly instead. */
  empty?: boolean
  placeholder?: string
  readOnly?: boolean
  /** Edit mode; call `close()` after a committed edit. */
  editor?: (close: () => void) => ReactNode
  editing?: boolean
  onEditingChange?: (editing: boolean) => void
  /** Classes for the chip's text (a tone). */
  tone?: string
  /** A control beside the chip (the due chip's zone control). */
  aside?: ReactNode
  /** Title of the editor when it is wider than the chip (the When control). */
  editorLabel?: string
  /** Helper or error text under the editor. */
  note?: ReactNode
  /** A clear action on the chip (removes the value without opening the editor). */
  onClear?: () => void
  /**
   * An action instead of an editor (the Origin chip opens its source, task-origin
   * D8): click or Enter runs it, also on a read-only task.
   */
  onActivate?: () => void
  /** Tooltip of the chip (the Origin chip's stored page title). */
  tip?: string
}

export function PropertyChip({ id, icon, label, value, empty, placeholder, readOnly, editor, editing: editingProp, onEditingChange, tone = '', aside, editorLabel, note, onClear, onActivate, tip }: PropertyChipProps) {
  const uid = useId()
  const labelId = `${uid}-label`
  const valueId = `${uid}-value`
  const [own, setOwn] = useState(false)
  const editing = !readOnly && !!editor && (editingProp ?? own)
  const setEditing = (v: boolean) => { if (editingProp === undefined) setOwn(v); onEditingChange?.(v) }
  const button = useRef<HTMLButtonElement>(null)
  const box = useRef<HTMLDivElement>(null)
  const returnFocus = useRef(false)

  useEffect(() => {
    if (editing) {
      const el = box.current
      if (el && !el.contains(document.activeElement)) el.querySelector<HTMLElement>(FOCUSABLE)?.focus()
    } else if (returnFocus.current) {
      returnFocus.current = false
      button.current?.focus()
    }
  }, [editing])

  const close = () => {
    returnFocus.current = true
    setEditing(false)
  }
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'Escape' || e.defaultPrevented) return
    e.preventDefault()
    e.stopPropagation()
    close()
  }
  const onBlur = (e: FocusEvent) => {
    const next = e.relatedTarget as HTMLElement | null
    if (!next || box.current?.contains(next) || next.closest('[data-overlay]')) return
    setEditing(false)
  }

  const shown = empty ? <span className="text-faint">{placeholder}</span> : value
  const withTip = (el: ReactElement<Record<string, unknown>>) => (tip ? <Tooltip label={tip}>{el}</Tooltip> : el)
  const action = !editor && onActivate
  const chipClass = `inline-flex max-w-full min-h-8 items-center gap-1.5 rounded-control border px-2.5 py-1 text-meta ${editing ? 'border-focus bg-sunken dark:bg-raised' : empty ? 'border-dashed border-input' : 'border-default bg-surface'} ${(readOnly || !editor) && !action ? '' : 'hover:bg-sunken focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus dark:hover:bg-raised'} ${tone}`

  return (
    <div data-property={id} className="contents">
      <span id={labelId} className="sr-only">{label}</span>
      <span className="inline-flex max-w-full items-center gap-1">
        {action ? withTip(
          <button type="button" id={valueId} aria-labelledby={`${labelId} ${valueId}`} className={chipClass} onClick={onActivate}>
            <Icon name={icon} size="xs" className="shrink-0 text-faint" /><span className="min-w-0 truncate">{shown}</span>
          </button>,
        ) : readOnly || !editor ? withTip(
          <span id={valueId} className={chipClass}>
            <Icon name={icon} size="xs" className="shrink-0 text-faint" /><span className="min-w-0 truncate">{shown}</span>
          </span>,
        ) : (
          <button ref={button} type="button" id={valueId} aria-labelledby={`${labelId} ${valueId}`} aria-expanded={editing} className={chipClass} onClick={() => setEditing(!editing)}>
            <Icon name={icon} size="xs" className="shrink-0 text-faint" /><span className="min-w-0 truncate">{shown}</span>
          </button>
        )}
        {onClear && !empty && !readOnly && (
          <button type="button" className="touch-target flex h-6 w-6 items-center justify-center rounded-full text-faint hover:bg-sunken hover:text-default dark:hover:bg-raised" aria-label={t('Clear {lowerCase}', { lowerCase: label.toLowerCase() })} onClick={onClear}>
            <Icon name="x" size="xs" />
          </button>
        )}
        {aside}
      </span>
      {editing && (
        <div ref={box} onKeyDown={onKeyDown} onBlur={onBlur} data-property-editor={id} className="min-w-0 basis-full rounded-control border border-default bg-surface p-3 shadow-1">
          <p className="mb-2 flex items-center gap-1.5 text-meta font-medium text-muted"><Icon name={icon} size="xs" className="text-faint" />{editorLabel ?? label}</p>
          {editor!(close)}
          {note && <p className="mt-2 text-meta text-faint">{note}</p>}
        </div>
      )}
      {!editing && note && <p className="basis-full text-meta text-faint">{note}</p>}
    </div>
  )
}
