// A note's outline (OpenSpec change note-outline): its headings as a column beside a
// wide note, or behind an Outline button in the note's corner (D2), the current one
// marked (D3), the column's keys (D4). The views only: the editor's side, which reads
// the ProseMirror state, is useNoteOutline.tsx in the editor's lazy chunk.
import { useContext, type KeyboardEvent, type RefObject } from 'react'
import { outlineStep, type OutlineItem } from '../../lib/noteOutline'
import { t } from '../../lib/i18n'
import { keysOf } from '../../lib/shortcuts'
import { Icon, Menu, MenuCloseContext } from '../../ui'

export type OutlineEntry = Pick<OutlineItem, 'level' | 'text'>
/** Where the outline may show (D2): a column when the room is wide enough, else the menu; always the menu. */
export type OutlinePlace = 'auto' | 'menu'

/** One outline line's height in the column, for the "+n more" cut. */
export const LINE_PX = 30
const INDENT = { 1: 'ps-2', 2: 'ps-5', 3: 'ps-8' } as const

const label = (e: OutlineEntry) => e.text || t('Untitled heading')

/** One heading in the menu: a menu item indented by level, marked when current. */
function OutlineMenuItem({ entry, current, onGo }: { entry: OutlineEntry; current: boolean; onGo: () => void }) {
  const close = useContext(MenuCloseContext)
  return (
    <button type="button" role="menuitem" data-menu-label={label(entry)} aria-current={current ? 'location' : undefined} data-outline-item
      onClick={() => { onGo(); close?.() }}
      className={`flex w-full items-center rounded-control py-1.5 pe-2.5 text-left text-body outline-none hover:bg-hover focus-visible:bg-selected focus-visible:outline-2 focus-visible:outline-solid focus-visible:-outline-offset-2 focus-visible:outline-focus ${INDENT[entry.level]} ${current ? 'font-medium text-accent' : entry.level === 1 ? 'text-default' : 'text-muted'}`}>
      <span className="min-w-0 flex-1 truncate">{label(entry)}</span>
    </button>
  )
}

function OutlineItems({ items, current, onGo }: { items: readonly OutlineEntry[]; current: number; onGo: (i: number) => void }) {
  return <div className="max-h-[min(28rem,70vh)] overflow-y-auto" data-outline-menu>{items.map((e, i) => <OutlineMenuItem key={i} entry={e} current={i === current} onGo={() => onGo(i)} />)}</div>
}

/** The Outline button in the note's corner (D2), its menu listing the headings. */
export function OutlineButton({ items, current, onGo, open, onOpenChange }: { items: readonly OutlineEntry[]; current: number; onGo: (i: number) => void; open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <div className="note-outline-button ui-reveal" data-note-outline="menu">
      <Menu kind="menu" label={t('Outline')} open={open} onOpenChange={onOpenChange} width="sm:w-72" tipShortcut={keysOf('editor.outline')}
        trigger={<Icon name="table-of-contents" />} triggerClassName="ui-btn ui-btn--ghost ui-btn--sm ui-btn--icon" triggerProps={{ 'data-outline-open': true }}>
        <OutlineItems items={items} current={current} onGo={onGo} />
      </Menu>
    </div>
  )
}

/**
 * The column beside a wide note (D2): sticky inside the note's scroller, never a
 * scroller of its own; what does not fit the screen is behind "+n more".
 */
export function OutlineColumn({ ref, items, current, onGo, onEscape, menuOpen, onMenu }: {
  ref: RefObject<HTMLElement | null>; items: readonly OutlineEntry[]; current: number; onGo: (i: number) => void; onEscape: () => void
  menuOpen: boolean; onMenu: (open: boolean) => void
}) {
  const fit = Math.max(4, Math.floor(((typeof window === 'undefined' ? 800 : window.innerHeight) - 160) / LINE_PX))
  const listed = items.length > fit ? items.slice(0, fit - 1) : items
  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    const buttons = [...e.currentTarget.querySelectorAll<HTMLButtonElement>('[data-outline-item]')]
    const at = buttons.indexOf(document.activeElement as HTMLButtonElement)
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onEscape(); return }
    const next = outlineStep(e.key, at, buttons.length)
    if (next === null) return
    e.preventDefault()
    buttons[next]?.focus()
  }
  return (
    <nav ref={ref} aria-label={t('Outline')} className="note-outline" data-note-outline="column" onKeyDown={onKeyDown}>
      <ol className="note-outline__list">
        {listed.map((e, i) => (
          <li key={i}>
            <button type="button" data-outline-item aria-current={i === current ? 'location' : undefined} onClick={() => onGo(i)}
              className={`note-outline__item ${INDENT[e.level]} ${i === current ? 'font-medium text-accent' : e.level === 1 ? 'text-default' : 'text-muted'}`}>
              <span className="truncate">{label(e)}</span>
            </button>
          </li>
        ))}
        {listed.length < items.length && (
          <li>
            <Menu kind="menu" label={t('Outline')} open={menuOpen} onOpenChange={(v) => { onMenu(v); if (!v) onEscape() }} width="sm:w-72" namedByContent
              trigger={<span>{t('+{n} more', { n: items.length - listed.length })}</span>} triggerClassName="note-outline__item ps-2 text-muted">
              <OutlineItems items={items} current={current} onGo={onGo} />
            </Menu>
          </li>
        )}
      </ol>
    </nav>
  )
}
