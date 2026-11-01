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
 * to the word. It lines up with the word's start edge, below it when there is
 * room, and the chosen entry is a row with a check, as in every picker
 * (routines-editor-polish).
 */
export function ChoicePopover({ open, onClose, anchor, label, choices, placeholder, multiple, footer, align = 'start', context }: {
  open: boolean; onClose: () => void; anchor: RefObject<HTMLElement | null>; label: string; choices: readonly Choice[]
  placeholder?: string; multiple?: boolean
  /** A small field under the list (a number, a date). */
  footer?: ReactNode
  /** Which edge of the anchor the list lines up with: the start, or the end for a button at a field's end. */
  align?: 'start' | 'end'
  /** Shown at the top of the bottom sheet on phones, where the sheet covers the page (the text being edited). */
  context?: ReactNode
}) {
  return (
    // In the sheet the search field, the rows and the title share one left edge.
    <Popover open={open} onClose={onClose} anchor={anchor} label={label} align={align} width="sm:w-72"
      className="space-y-1 px-3 py-2 sm:p-1.5 [&_[data-combobox]>div:first-child]:mx-1">
      {context && <div className="mx-1 rounded-control bg-sunken px-2.5 py-1.5 text-meta text-muted sm:hidden" data-choice-context>{context}</div>}
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

const MIRRORED = ['boxSizing', 'width', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'borderTopWidth', 'borderRightWidth', 'borderBottomWidth',
  'borderLeftWidth', 'borderStyle', 'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'letterSpacing', 'lineHeight', 'textTransform', 'wordSpacing', 'textIndent'] as const

/** Where a textarea's caret is, relative to its border box: a hidden copy of its text up to the caret. */
function caretAt(el: HTMLTextAreaElement, pos: number): { top: number; left: number; height: number } {
  const cs = getComputedStyle(el)
  const mirror = document.createElement('div')
  for (const k of MIRRORED) mirror.style[k] = cs[k]
  Object.assign(mirror.style, { position: 'absolute', visibility: 'hidden', top: '0', left: '-9999px', whiteSpace: 'pre-wrap', overflowWrap: 'break-word' })
  mirror.textContent = el.value.slice(0, pos)
  const mark = document.createElement('span')
  mark.textContent = el.value.slice(pos) || '.'
  mirror.appendChild(mark)
  document.body.appendChild(mirror)
  const out = { top: mark.offsetTop - el.scrollTop, left: mark.offsetLeft - el.scrollLeft, height: parseFloat(cs.lineHeight) || mark.offsetHeight || 20 }
  mirror.remove()
  return out
}

/** Moves a field up before a list opens for it: so the list fits below it, or the field stays above the sheet on phones. */
function makeRoom(el: HTMLElement | null) {
  if (!el?.scrollIntoView) return
  const wide = typeof matchMedia !== 'undefined' && matchMedia('(min-width: 40rem)').matches
  if (!wide) el.scrollIntoView({ block: 'start' })
  else if (window.innerHeight - el.getBoundingClientRect().bottom < 280) el.scrollIntoView({ block: 'center' })
}

/**
 * A text edited where its word was: an auto-growing field; "/" (a list at the
 * caret) or "+ value" (a list at the button) inserts a value of an earlier step,
 * read as «its name» in the field. Enter, leaving the field and Escape keep the
 * text (Shift+Enter is a new line): Escape never throws typed text away
 * (routines-editor-polish).
 */
export function InlineText({ label, value, max, insertable, onCommit }: {
  label: string; value: string; max: number
  /** Values that can be inserted, read as «name» in the field. */
  insertable: readonly { ref: string; name: string }[]
  onCommit: (text: string) => void
}) {
  const [text, setText] = useState(value)
  const [inserting, setInserting] = useState<'' | 'caret' | 'button'>('')
  const [caret, setCaret] = useState<{ top: number; left: number; height: number; at: number } | null>(null)
  const area = useRef<HTMLTextAreaElement>(null)
  const plus = useRef<HTMLButtonElement>(null)
  const caretMark = useRef<HTMLSpanElement>(null)
  const done = useRef(false)
  useLayoutEffect(() => grow(area.current), [text])
  useLayoutEffect(() => { area.current?.focus(); area.current?.setSelectionRange(text.length, text.length) }, []) // eslint-disable-line react-hooks/exhaustive-deps -- focus once, at the end of the text
  const commit = () => { if (done.current) return; done.current = true; onCommit(text) }
  const openList = (how: 'caret' | 'button') => {
    const el = area.current
    makeRoom(el)
    if (el) {
      const at = el.selectionStart ?? text.length
      const c = caretAt(el, at)
      setCaret({ top: el.offsetTop + c.top, left: el.offsetLeft + c.left, height: c.height, at })
    }
    setInserting(how)
  }
  const closeList = () => { setInserting(''); requestAnimationFrame(() => area.current?.focus()) }
  const insert = (ref: string) => {
    const el = area.current
    const at = el?.selectionStart ?? text.length
    const name = insertable.find((o) => o.ref === ref)?.name ?? ref
    const next = `${text.slice(0, at)}«${name}»${text.slice(el?.selectionEnd ?? at)}`
    setText(next.slice(0, max))
    setInserting('')
    requestAnimationFrame(() => area.current?.focus())
  }
  const at = caret?.at ?? text.length
  // On a phone the sheet covers the field: its text is repeated at the top of the sheet, with the caret.
  const context = (
    <span className="user-text line-clamp-3 whitespace-pre-wrap break-words">
      {text.slice(0, at)}<span className="font-semibold text-accent" aria-hidden="true">|</span>{text.slice(at)}
    </span>
  )
  return (
    <span className="relative my-1 flex w-full items-start gap-1" data-inline-text>
      <textarea ref={area} rows={1} aria-label={label} value={text} maxLength={max} spellCheck
        className="ui-input min-h-9 flex-1 scroll-mt-24 resize-none overflow-hidden py-1.5 font-normal"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); commit() }
          else if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commit() }
          else if (e.key === '/' && insertable.length && (e.currentTarget.selectionStart === 0 || /\s$/.test(text.slice(0, e.currentTarget.selectionStart)))) { e.preventDefault(); openList('caret') }
        }}
        onBlur={(e) => {
          // Moving into the value list (or onto + value) is not leaving the text.
          const to = e.relatedTarget as HTMLElement | null
          if (!inserting && to !== plus.current && !to?.closest('[data-overlay-root]')) commit()
        }} />
      {inserting === 'caret' && caret && (
        <span ref={caretMark} aria-hidden="true" className="pointer-events-none absolute w-px" style={{ top: caret.top, left: caret.left, height: caret.height }} data-caret-anchor />
      )}
      {insertable.length > 0 && (
        <Button ref={plus} size="sm" variant="ghost" icon="plus" aria-haspopup="listbox" aria-expanded={!!inserting} onClick={() => openList('button')}>{t('value')}</Button>
      )}
      <ChoicePopover open={!!inserting} anchor={inserting === 'caret' ? caretMark : plus} align={inserting === 'caret' ? 'start' : 'end'} label={t('Insert a value')}
        onClose={closeList} context={context}
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
  if (!wide) {
    // The sheet opens on its rows, not on a ringed first field, and Done stays at its
    // bottom edge while the rows scroll (routines-editor-polish).
    return (
      <Dialog title={title} onClose={onClose} placement="bottom" testId="word-inspector" className="pb-0!">
        <div tabIndex={-1} data-autofocus className="outline-none">{children}</div>
        <div className="sticky bottom-0 -mx-4 mt-3 flex justify-end border-t border-default bg-surface px-4 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]" data-inspector-footer>
          <Button size="sm" variant="primary" onClick={onClose}>{t('Done')}</Button>
        </div>
      </Dialog>
    )
  }
  if (!slot) return null
  return createPortal(
    <section className="mt-2 rounded-control border border-default bg-sunken p-3" aria-label={title} data-word-inspector
      onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }}>
      {children}
      <div className="flex justify-end pt-2"><Button size="sm" variant="primary" onClick={onClose}>{t('Done')}</Button></div>
    </section>,
    slot,
  )
}
