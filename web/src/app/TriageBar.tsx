// The decisions of Process the Inbox as a toolbar (OpenSpec changes inbox-triage and
// phone-triage). From 768 px: every decision a button with its key, in a row that wraps
// under the card. Below 768 px (phone-triage D1, D2): two rows pinned on the tab bar,
// always in the same place under the thumb: Today, Schedule, Move, Complete and More,
// then Back and Skip; More holds Delegate, Labels, Someday, Open and Trash. Both shapes
// call the same functions as the keys, so a decision is written one way.
import { useLayoutEffect, useRef } from 'react'
import { Button, Icon, Menu, MenuItem, MenuSeparator, type IconName } from '../ui'
import { t } from '../lib/i18n'

export interface Decision {
  key: string
  hint: string
  label: string
  run: () => void
  disabled?: boolean
}

const ICONS: Record<string, IconName> = {
  today: 'sun', schedule: 'calendar-days', move: 'folder-input', complete: 'check',
  delegate: 'user-round', labels: 'tag', someday: 'archive', trash: 'trash-2',
}
/** The first row on a phone; the menu holds every other decision but Back and Skip. */
const FIRST = ['today', 'schedule', 'move', 'complete']
const WALK = ['back', 'skip']

/** One target of the first row: 48 px, the icon over its word. */
const TARGET = 'flex min-h-12! min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-control text-hint press-selected focus-visible:outline-2 focus-visible:outline-solid focus-visible:-outline-offset-2 focus-visible:outline-focus disabled:text-faint'

/**
 * While the bar is pinned, a toast shows above it: the lift the selection bar uses,
 * less the add button's room, which this screen does not need (phone-triage D3).
 */
function useToastAbove(bar: { current: HTMLElement | null }, on: boolean): void {
  useLayoutEffect(() => {
    const el = bar.current
    if (!on || !el) return
    const root = document.documentElement.style
    const publish = () => root.setProperty('--selection-lift', `max(0px, calc(${el.getBoundingClientRect().height}px - 4.75rem))`)
    publish()
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(publish) : null
    observer?.observe(el)
    return () => { observer?.disconnect(); root.removeProperty('--selection-lift') }
  }, [bar, on])
}

function PhoneBar({ decisions, onOpen, noDelegates, pinned }: { decisions: readonly Decision[]; onOpen: () => void; noDelegates: boolean; pinned: boolean }) {
  const bar = useRef<HTMLDivElement>(null)
  useToastAbove(bar, pinned)
  const by = new Map(decisions.map((d) => [d.key, d]))
  const rest = decisions.filter((d) => !FIRST.includes(d.key) && !WALK.includes(d.key) && d.key !== 'trash')
  const [back, skip, trash] = [by.get('back'), by.get('skip'), by.get('trash')]
  return (
    <>
    {/* What is left of the screen under a short card, and the gap a long one keeps above the bar. */}
    {pinned && <div aria-hidden className="min-h-4 flex-1" />}
    <div ref={bar} role="toolbar" aria-label={t('Decisions')} data-triage-bar="phone"
      className={pinned ? 'sticky bottom-0 z-[5] -mx-4 border-t border-soft bg-canvas px-1 pt-1' : 'mt-4'}>
      <div className="flex">
        {FIRST.map((k) => by.get(k)).filter((d): d is Decision => !!d).map((d) => (
          <button key={d.key} type="button" disabled={d.disabled} onClick={d.run} data-decision={d.key}
            className={`${TARGET} ${d.key === 'today' ? 'font-semibold text-accent' : 'text-default'}`}>
            <Icon name={ICONS[d.key]} size="md" /><span className="max-w-full truncate">{d.label}</span>
          </button>
        ))}
        <Menu kind="menu" label={t('More')} namedByContent triggerClassName={`${TARGET} text-default`} triggerProps={{ 'data-triage-more': true }}
          trigger={<><Icon name="ellipsis" size="md" /><span className="max-w-full truncate">{t('More')}</span></>}>
          {rest.map((d) => (
            <MenuItem key={d.key} label={d.label} icon={ICONS[d.key]} disabled={d.disabled} onSelect={d.run} data-decision={d.key}
              description={d.key === 'delegate' && noDelegates ? t('Delegating needs a project you share with someone.') : undefined} />
          ))}
          <MenuItem label={t('Open')} icon="arrow-right" onSelect={onOpen} data-decision="open" />
          {trash && <><MenuSeparator /><MenuItem label={trash.label} icon={ICONS.trash} danger onSelect={trash.run} data-decision="trash" /></>}
        </Menu>
      </div>
      <div className="flex justify-between">
        {back && <Button variant="ghost" size="lg" className="min-h-12!" icon="chevron-left" disabled={back.disabled} onClick={back.run} data-decision="back">{back.label}</Button>}
        {skip && <Button variant="ghost" size="lg" className="min-h-12!" iconEnd="chevron-right" disabled={skip.disabled} onClick={skip.run} data-decision="skip">{skip.label}</Button>}
      </div>
    </div>
    </>
  )
}

export function TriageBar({ decisions, onOpen, noDelegates, phone, pinned }: {
  decisions: readonly Decision[]
  onOpen: () => void
  noDelegates: boolean
  /** Below 768 px: the two rows and the menu. */
  phone: boolean
  /** On a phone, pinned at the end of the page (the screen); the card inside Clarify keeps it in the page. */
  pinned: boolean
}) {
  if (phone) return <PhoneBar decisions={decisions} onOpen={onOpen} noDelegates={noDelegates} pinned={pinned} />
  return (
    <>
      <div role="toolbar" aria-label={t('Decisions')} className="mt-4 flex flex-wrap gap-2" data-triage-bar>
        {decisions.map((b) => (
          <Button key={b.key} size="sm" variant={b.key === 'today' ? 'primary' : 'secondary'} disabled={b.disabled} onClick={b.run}
            aria-keyshortcuts={b.hint === 'Del' ? 'Delete' : b.hint} data-decision={b.key}>
            {b.label} <span className="ui-kbd ms-1">{b.hint}</span>
          </Button>
        ))}
        <Button size="sm" variant="ghost" onClick={onOpen} data-decision="open">{t('Open')} <span className="ui-kbd ms-1">Enter</span></Button>
      </div>
      {noDelegates && <p className="mt-2 text-meta text-faint">{t('Delegating needs a project you share with someone.')}</p>}
    </>
  )
}
