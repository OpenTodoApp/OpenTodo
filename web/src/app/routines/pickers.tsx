// The pickers of a routine card's words (OpenSpec change routines-dynamic-data,
// design D13): no centred modal. A choice (a flowing value, a project, a label,
// a mode, a date) opens a compact, searchable list anchored next to the word; a
// text is edited in place, in an auto-growing field with values inserted by "/"
// or "+ value"; the bigger editors (condition rows, the changes of Change tasks)
// expand inside the card from 1024 px and open as a bottom sheet below.
import { createPortal } from 'react-dom'
import { useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { t } from '../../lib/i18n'
import { Button, ComboboxPanel, Dialog, Popover, useMediaQuery } from '../../ui'

/** One entry of a word's list: what it reads and what choosing it does. */
export interface Choice {
  key: string
  label: string
  /** Heading of its group ("From earlier steps", "Projects"); groups keep their first-seen order. */
  group?: string
  secondary?: string
  selected?: boolean
  run: () => void
  /** Keeps the list open after the pick (a toggle in a multiple choice, "A specific task…"). */
  keep?: boolean
}

/**
 * The compact list of a word, anchored next to it (a bottom sheet on phones):
 * typing filters it, arrows move, Enter picks, Escape closes, and focus goes back
 * to the word.
 */
export function ChoicePopover({ open, onClose, anchor, label, choices, placeholder, multiple, footer }: {
  open: boolean; onClose: () => void; anchor: RefObject<HTMLElement | null>; label: string; choices: readonly Choice[]
  placeholder?: string; multiple?: boolean
  /** A small field under the list (a number, a date). */
  footer?: ReactNode
}) {
  return (
    <Popover open={open} onClose={onClose} anchor={anchor} label={label} align="start" width="sm:w-72" className="space-y-1 p-1.5">
      {(choices.length > 0 || !footer) && <div data-word-choices>
        <ComboboxPanel<Choice> label={label} placeholder={placeholder ?? t('Search')} source={choices} getKey={(c) => c.key} getLabel={(c) => c.label}
          getSecondary={(c) => c.secondary} getGroup={(c) => c.group} selected={choices.filter((c) => c.selected).map((c) => c.key)} multiple={multiple}
          emptyText={t('No matches')} onClose={onClose}
          onPick={(c) => { c.run(); if (!c.keep && !multiple) onClose() }} />
      </div>}
      {footer && <div className={`${choices.length ? 'border-t border-default pt-2' : 'pt-1'} px-1.5 pb-1`} data-word-footer>{footer}</div>}
    </Popover>
  )
}

/** Grows a textarea with its text, one line when empty. */
function grow(el: HTMLTextAreaElement | null) {
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${el.scrollHeight}px`
}

/**
 * A text edited where its word was: an auto-growing field, "/" or "+ value"
 * inserts a value of an earlier step as a chip («the count»), Enter or leaving the field
 * keeps the text (Shift+Enter is a new line), Escape puts the word back unchanged.
 */
export function InlineText({ label, value, max, insertable, onCommit, onCancel }: {
  label: string; value: string; max: number
  /** Values that can be inserted, read as «name» in the field. */
  insertable: readonly { ref: string; name: string }[]
  onCommit: (text: string) => void; onCancel: () => void
}) {
  const [text, setText] = useState(value)
  const [inserting, setInserting] = useState(false)
  const area = useRef<HTMLTextAreaElement>(null)
  const plus = useRef<HTMLButtonElement>(null)
  const done = useRef(false)
  useLayoutEffect(() => grow(area.current), [text])
  useLayoutEffect(() => { area.current?.focus(); area.current?.setSelectionRange(text.length, text.length) }, []) // eslint-disable-line react-hooks/exhaustive-deps -- focus once, at the end of the text
  const commit = () => { if (done.current) return; done.current = true; onCommit(text) }
  const insert = (ref: string) => {
    const el = area.current
    const at = el?.selectionStart ?? text.length
    const name = insertable.find((o) => o.ref === ref)?.name ?? ref
    const next = `${text.slice(0, at)}«${name}»${text.slice(el?.selectionEnd ?? at)}`
    setText(next.slice(0, max))
    setInserting(false)
    requestAnimationFrame(() => area.current?.focus())
  }
  return (
    <span className="my-1 flex w-full items-start gap-1" data-inline-text>
      <textarea ref={area} rows={1} aria-label={label} value={text} maxLength={max} spellCheck
        className="ui-input min-h-9 flex-1 resize-none overflow-hidden py-1.5 font-normal"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done.current = true; onCancel() }
          else if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commit() }
          else if (e.key === '/' && insertable.length && (e.currentTarget.selectionStart === 0 || /\s$/.test(text.slice(0, e.currentTarget.selectionStart)))) { e.preventDefault(); setInserting(true) }
        }}
        onBlur={(e) => {
          // Moving into the value list (or onto + value) is not leaving the text.
          const to = e.relatedTarget as HTMLElement | null
          if (!inserting && to !== plus.current && !to?.closest('[data-overlay-root]')) commit()
        }} />
      {insertable.length > 0 && (
        <Button ref={plus} size="sm" variant="ghost" icon="plus" aria-haspopup="listbox" aria-expanded={inserting} onClick={() => setInserting(true)}>{t('value')}</Button>
      )}
      <ChoicePopover open={inserting} anchor={area} label={t('Insert a value')} onClose={() => { setInserting(false); requestAnimationFrame(() => area.current?.focus()) }}
        choices={insertable.map((o) => ({ key: o.ref, label: o.name, run: () => insert(o.ref) }))} />
    </span>
  )
}

/** The page's wide layout, where a card can hold a bigger editor (routines-editor-page). */
export const INSPECTOR_QUERY = '(min-width: 64rem)'

/**
 * A bigger editor of a word (condition rows, the changes of Change tasks): from
 * 1024 px it opens inside its card, under the sentence; below, as a bottom sheet
 * sized to its content. Never a centred modal.
 */
export function Inspector({ open, onClose, stepId, title, children }: { open: boolean; onClose: () => void; stepId: string; title: string; children: ReactNode }) {
  const wide = useMediaQuery(INSPECTOR_QUERY)
  const [slot, setSlot] = useState<HTMLElement | null>(null)
  useLayoutEffect(() => {
    setSlot(open && wide ? document.querySelector<HTMLElement>(`[data-card-inspector="${stepId}"]`) : null)
  }, [open, wide, stepId])
  if (!open) return null
  const done = <div className="flex justify-end pt-2"><Button size="sm" variant="primary" onClick={onClose}>{t('Done')}</Button></div>
  if (!wide) return <Dialog title={title} onClose={onClose} placement="bottom" testId="word-inspector">{children}{done}</Dialog>
  if (!slot) return null
  return createPortal(
    <section className="mt-2 rounded-control border border-default bg-sunken p-3" aria-label={title} data-word-inspector
      onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }}>
      {children}{done}
    </section>,
    slot,
  )
}
