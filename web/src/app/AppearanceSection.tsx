// Settings → Appearance (OpenSpec change theming, design D9; ux-overhaul,
// appearance-preferences "Appearance in Settings without a Rows choice"): mode,
// accent theme, density and the promoted sidebar destinations, all in the synced user_prefs row and
// applied at once. Theme tiles are a radio group with roving focus; each tile
// previews its theme through the real tokens (a data-accent subtree). Below
// 640 px the tiles are one scrollable row of named swatches. On a device that can
// vibrate, a switch turns the haptic tick off (motion-v2 D6). Task details holds how a
// task opens from a list, as a page or in a side panel (task-side-panel D1).
// The Custom tile (accent-colour D5) ends the theme row and opens the lazily loaded
// colour picker in a popover (a bottom sheet below 640 px).
// The Theme row (theme-engine D14) comes right after Mode: one list of theme cards
// for a fixed mode, a Light and a Dark list under System, one op per choice. While
// the side shown has a theme other than OpenTodo's, the accent comes from that theme
// and the tiles are not offered (D7).
import { readMethodMode } from '../lib/method/mode'
import { type DragEvent, type KeyboardEvent, lazy, Suspense, useEffect, useRef, useState } from 'react'
import { cachedCustom, customAccentStyle, type CustomAccentValues, deriveCustom, DENSITIES, type Density, destinationOrder, type DestinationId, FIXED_DESTINATIONS, moveDestination, PROMOTABLE, type Promotable, readAppearance, readSidebarCounts, setAppearance, setCustomAccent, setPromoted, setSidebarCounts, SIDEBAR_COUNTS, type SidebarCounts, THEME_MODES, type Appearance } from '../lib/appearance'
import { ActionMenu } from './menus/ActionMenu'
import { useUserPrefsRow } from '../lib/localData'
import type { ThemeModePref, UserPrefs } from '../lib/types'
import { Icon, LazyAccentPicker, Popover, SettingRow, SettingsSection, Skeleton, Switch } from '../ui'
import { ACCENTS, CUSTOM_ACCENT, type ThemeAccent } from '../ui'
import { t, msg, translatedMap } from '../lib/i18n'
import { accentName } from '../lib/colourNames'
import { act } from './actionError'
import { cardCopy, rowCopy } from '../lib/settingsCopy'
import { hapticsPrefOn, setHapticsPref } from '../lib/haptics'
import { canVibrate } from './motion'
import { readTaskOpen, setTaskOpen, type TaskOpenPref } from '../lib/userPrefs'
import { accountRowLayout, ROW_LAYOUTS, setAccountRowLayout, type RowLayout } from '../lib/rowLayout'
import { ROW_LAYOUT_LABEL } from './views/DisplayPanel'
import { readThemeChoices } from '../lib/theme/choice'
import { useInstanceThemes } from '../lib/theme/instance'
import { knownThemes, useCatalogue, type ThemeSettingsProps } from './themeCatalogue'

const ThemeSettings = lazy(() => import('./ThemeRow'))
import { effectiveSide } from '../lib/appearance'

const MODE_LABEL = translatedMap<ThemeModePref>({ system: msg('System'), light: msg('Light'), dark: msg('Dark') })
const DENSITY_LABEL = translatedMap<Density>({ comfortable: msg('Comfortable'), compact: msg('Compact') })
const TASK_OPEN: readonly TaskOpenPref[] = ['page', 'panel']
const TASK_OPEN_LABEL = translatedMap<TaskOpenPref>({ page: msg('As a page'), panel: msg('In a side panel') })

/** The destinations of the sidebar's More group, as the switches name them (app-shell "Sidebar structure"). */
export const PROMOTABLE_LABEL = translatedMap<Promotable>({
  loop: msg('Loop home'), next: msg('Next actions'), waiting: msg('Waiting'),
  anytime: msg('Anytime'), someday: msg('Someday'), assigned: msg('Assigned to me'), completed: msg('Completed'), feed: msg('Updates'), trash: msg('Trash'), filter: msg('New view'), focus: msg('Focus'), notes: msg('Notes'),
})

export interface AppearanceViewProps {
  value: Appearance
  onMode: (m: ThemeModePref) => void
  /** A built-in theme, or `custom` to use the stored custom colour again. */
  onAccent: (a: ThemeAccent) => void
  /** The custom accent (accent-colour D5): its derived values for the tile, and writing a picked colour. */
  custom?: { values: CustomAccentValues | null; onPick: (hex: string) => void }
  onDensity?: (d: Density) => void
  /** The account's task row layout (row-layouts D4): every list without its own choice. */
  rows?: { value: RowLayout; onChange: (r: RowLayout) => void }
  /** The haptics switch, only on a device that can vibrate (appearance-preferences "Haptic feedback preference"). */
  haptics?: { on: boolean; onChange: (on: boolean) => void }
  /** The theme of each side (theme-engine D14): the lists to show and writing a choice. */
  themes?: ThemeSettingsProps
}

/** Roving focus over a radio group: arrows move and select, Home and End jump. */
function roving<T>(e: KeyboardEvent, items: readonly T[], current: T, choose: (v: T) => void, focus: (i: number) => void) {
  const i = items.indexOf(current)
  let next = -1
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (i + 1) % items.length
  else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (i - 1 + items.length) % items.length
  else if (e.key === 'Home') next = 0
  else if (e.key === 'End') next = items.length - 1
  if (next < 0) return
  e.preventDefault()
  choose(items[next])
  focus(next)
}

function Segmented<T extends string>({ label, items, labels, value, onChange, testId }: {
  label: string; items: readonly T[]; labels: Record<T, string>; value: T; onChange: (v: T) => void; testId: string
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-control border border-input bg-surface p-0.5" data-testid={testId}>
      {items.map((m, i) => (
        <button key={m} ref={(el) => { refs.current[i] = el }} type="button" role="radio" aria-checked={value === m} tabIndex={value === m ? 0 : -1}
          className={`rounded-control px-3 py-1 text-meta touch-target ${value === m ? 'bg-accent text-on-accent' : 'text-default hover:bg-sunken dark:hover:bg-raised'}`}
          onClick={() => onChange(m)}
          onKeyDown={(e) => roving(e, items, value, onChange, (n) => refs.current[n]?.focus())}>
          {labels[m]}
        </button>
      ))}
    </div>
  )
}

/** The tile drawing: the theme's accent on the current mode (a sidebar with a soft item, a surface with a button). */
function TilePreview() {
  return (
    <span className="flex h-12 w-full overflow-hidden rounded-control border border-default" aria-hidden="true">
      <span className="flex w-1/3 flex-col gap-1 bg-canvas p-1">
        <span className="h-1.5 w-full rounded-full bg-accent-soft" />
        <span className="h-1.5 w-3/4 rounded-full bg-sunken" />
      </span>
      <span className="flex flex-1 flex-col justify-between bg-surface p-1">
        <span className="h-1.5 w-2/3 rounded-full bg-sunken" />
        <span className="h-3 w-1/2 rounded-full bg-accent" />
      </span>
    </span>
  )
}

const TILE = 'flex w-28 shrink-0 snap-start flex-col gap-2 rounded-card border bg-surface p-2 text-left outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-focus sm:w-auto'

export function AppearanceView({ value, onMode, onAccent, custom, onDensity, rows, haptics, themes }: AppearanceViewProps) {
  const tileRefs = useRef<(HTMLButtonElement | null)[]>([])
  const [picking, setPicking] = useState(false)
  const customRef = useRef<HTMLButtonElement | null>(null)
  const ids: ThemeAccent[] = [...ACCENTS.map((a): ThemeAccent => a.id), ...(custom ? [CUSTOM_ACCENT] as const : [])]
  // Arrows select a built-in theme; on the Custom tile they select the stored colour, or only move there.
  const choose = (a: ThemeAccent) => { if (a !== CUSTOM_ACCENT || value.custom) onAccent(a) }
  const customOn = value.accent === CUSTOM_ACCENT
  const swatch = custom?.values && value.custom ? custom.values : null
  return (
    <SettingsSection {...cardCopy('appearance')}>
      <SettingRow id="appearance-mode" {...rowCopy('appearance', 'mode')}
        control={<span data-appearance-mode><Segmented label={t('Mode')} items={THEME_MODES} labels={MODE_LABEL} value={value.mode} onChange={onMode} testId="appearance-mode" /></span>} />
      {themes && <Suspense fallback={<Skeleton count={2} />}><ThemeSettings {...themes} /></Suspense>}
      <div className="py-3" id="appearance-theme" tabIndex={-1} data-setting-row="appearance-theme">
        <p id="appearance-theme-label" className="mb-2 text-body font-medium text-default">{rowCopy('appearance', 'theme').label}</p>
        {themes?.accentFromTheme ? <p className="text-meta text-muted" data-accent-from-theme>{t('From the theme')}</p> : (
        <div role="radiogroup" aria-labelledby="appearance-theme-label" data-appearance-themes data-scroll-x
          className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-1 sm:mx-0 sm:grid sm:grid-cols-4 sm:gap-3 sm:overflow-visible sm:px-0 sm:pb-0">
          {ACCENTS.map((a, i) => {
            const on = value.accent === a.id
            return (
              <button key={a.id} ref={(el) => { tileRefs.current[i] = el }} type="button" role="radio" aria-checked={on} tabIndex={on ? 0 : -1}
                data-accent={a.id} data-theme-tile={a.id}
                className={`${TILE} ${on ? 'border-accent ring-2 ring-accent' : 'border-default'}`}
                onClick={() => onAccent(a.id)}
                onKeyDown={(e) => roving(e, ids, a.id, choose, (n) => tileRefs.current[n]?.focus())}>
                <TilePreview />
                <span className="text-meta font-medium text-default">{accentName(a.label)}</span>
              </button>
            )
          })}
          {custom && (
            <button ref={(el) => { tileRefs.current[ACCENTS.length] = el; customRef.current = el }} type="button" role="radio" aria-checked={customOn} tabIndex={customOn ? 0 : -1}
              data-accent={swatch ? CUSTOM_ACCENT : undefined} style={swatch ? customAccentStyle(swatch) : undefined} data-theme-tile={CUSTOM_ACCENT}
              className={`${TILE} ${customOn ? 'border-accent ring-2 ring-accent' : 'border-default'}`}
              onClick={() => { if (value.custom && !customOn) onAccent(CUSTOM_ACCENT); setPicking(true) }}
              onKeyDown={(e) => roving(e, ids, CUSTOM_ACCENT, choose, (n) => tileRefs.current[n]?.focus())}>
              {swatch ? <TilePreview /> : (
                <span className="flex h-12 w-full items-center justify-center rounded-control border border-dashed border-input text-muted" aria-hidden="true">
                  <Icon name="plus" />
                </span>
              )}
              <span className="text-meta font-medium text-default">
                {t('Custom')}
                <span className="block font-normal text-muted">{value.custom ? <span className="font-mono">{value.custom}</span> : t('Choose a colour')}</span>
              </span>
            </button>
          )}
        </div>
        )}
        {custom && !themes?.accentFromTheme && (
          <Popover open={picking} onClose={() => setPicking(false)} anchor={customRef} label={t('Custom colour')} align="start" width="sm:w-80" className="p-3">
            <Suspense fallback={<Skeleton count={3} />}>
              <LazyAccentPicker value={value.custom} onPick={custom.onPick} onDone={() => setPicking(false)} />
            </Suspense>
          </Popover>
        )}
      </div>
      {onDensity && (
        <SettingRow id="appearance-density" {...rowCopy('appearance', 'density')}
          control={<Segmented label={t('Density')} items={DENSITIES} labels={DENSITY_LABEL} value={value.density ?? 'comfortable'} onChange={onDensity} testId="appearance-density" />} />
      )}
      {rows && (
        <SettingRow id="appearance-rows" {...rowCopy('appearance', 'rows')}
          control={<Segmented label={t('Task rows')} items={ROW_LAYOUTS} labels={ROW_LAYOUT_LABEL} value={rows.value} onChange={rows.onChange} testId="appearance-rows" />} />
      )}
      {haptics && (
        <SettingRow id="appearance-haptics" {...rowCopy('appearance', 'haptics')} htmlFor="appearance-haptics-switch"
          control={<Switch id="appearance-haptics-switch" checked={haptics.on} onChange={haptics.onChange} label={t('Haptic feedback')} hideLabel />} />
      )}
    </SettingsSection>
  )
}

/** The fixed primary destinations, as the destination list names them. */
const FIXED_LABEL = translatedMap<(typeof FIXED_DESTINATIONS)[number]>({ inbox: msg('Inbox'), today: msg('Today'), upcoming: msg('Upcoming'), calendar: msg('Calendar') })
const destinationLabel = (id: DestinationId): string => ((FIXED_DESTINATIONS as readonly string[]).includes(id) ? FIXED_LABEL[id as (typeof FIXED_DESTINATIONS)[number]] : PROMOTABLE_LABEL[id as Promotable])
const COUNTS_LABEL = translatedMap<SidebarCounts>({ today: msg('Inbox and Today'), all: msg('Every list') })

export interface SidebarViewProps {
  promoted: readonly Promotable[]
  onPromote: (id: Promotable, on: boolean) => void
  /** Open Loops first: the method fixes the sidebar, so the list is disabled and kept. */
  arranged?: boolean
  /** The sidebar counts preference (appearance-preferences "Sidebar counts preference"). */
  counts?: SidebarCounts
  onCounts?: (v: SidebarCounts) => void
  /** Every destination that can be primary, in the user's order (sidebar-polish D3). */
  order?: readonly DestinationId[]
  /** Moves a destination by `delta` places (one, or a drag's distance); resolves once stored. */
  onMove?: (id: DestinationId, delta: number) => Promise<unknown>
}

/**
 * The sidebar card (app-shell "Sidebar structure", sidebar-polish D1, D3): the counts
 * choice, then every destination that can be primary in the user's order, each with a
 * drag handle (Alt+↑ and Alt+↓ on it), Move up and Move down in its menu, and the
 * promotion switch on the promotable ones.
 */
export function SidebarView({ promoted, onPromote, arranged = false, counts = 'today', onCounts, order = [...FIXED_DESTINATIONS, ...PROMOTABLE], onMove }: SidebarViewProps) {
  const [announce, setAnnounce] = useState('')
  const [dragId, setDragId] = useState<DestinationId | null>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const move = async (id: DestinationId, delta: -1 | 1, focus = true) => {
    if (!onMove) return
    const from = order.indexOf(id)
    const to = from + delta
    if (from < 0 || to < 0 || to >= order.length) return
    await onMove(id, delta)
    setAnnounce(t('{name} moved to position {n} of {count}', { name: destinationLabel(id), n: to + 1, count: order.length }))
    if (focus) window.setTimeout(() => listRef.current?.querySelector<HTMLElement>(`[data-destination-row="${id}"] [data-destination-handle]`)?.focus(), 30)
  }
  const onHandleKey = (e: KeyboardEvent, id: DestinationId) => {
    if (arranged || !e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return
    e.preventDefault()
    act(move(id, e.key === 'ArrowUp' ? -1 : 1))
  }
  const onDrop = async (e: DragEvent, target: DestinationId) => {
    e.preventDefault()
    const id = dragId
    setDragId(null)
    if (!id || arranged) return
    const from = order.indexOf(id)
    const to = order.indexOf(target)
    if (from < 0 || to < 0 || from === to) return
    await onMove?.(id, to - from)
    setAnnounce(t('{name} moved to position {n} of {count}', { name: destinationLabel(id), n: to + 1, count: order.length }))
  }
  return (
    <SettingsSection {...cardCopy('sidebar', { variant: arranged ? 'arranged' : 'standard' })}>
      {onCounts && (
        <SettingRow id="sidebar-counts" {...rowCopy('sidebar', 'counts')}
          control={<Segmented label={t('Sidebar counts')} items={SIDEBAR_COUNTS} labels={COUNTS_LABEL} value={counts} onChange={onCounts} testId="sidebar-counts" />} />
      )}
      <div className="py-3" id="sidebar-destinations" tabIndex={-1} data-setting-row="sidebar-destinations">
        <p id="sidebar-destinations-label" className="text-body font-medium text-default">{rowCopy('sidebar', 'destinations').label}</p>
        <p className="mt-0.5 mb-2 text-meta text-muted">{rowCopy('sidebar', 'destinations').description}</p>
        <ul ref={listRef} aria-labelledby="sidebar-destinations-label" className="divide-y divide-default rounded-card border border-default" data-destination-list>
          {order.map((id, i) => {
            const name = destinationLabel(id)
            const promotable = (PROMOTABLE as readonly string[]).includes(id)
            const ghost = dragId === id ? 'opacity-50' : '' // tone-lint-allow: the dragged destination's ghost
            return (
              <li key={id} id={promotable ? `sidebar-${id}` : undefined} data-setting-row={promotable ? `sidebar-${id}` : undefined} data-destination-row={id}
                tabIndex={promotable ? -1 : undefined} draggable={!arranged && !!onMove} onDragStart={() => setDragId(id)} onDragOver={(e) => e.preventDefault()} onDrop={(e) => void onDrop(e, id)}
                className={`flex items-center gap-2 px-2 py-1.5 outline-none focus-visible:ring-2 focus-visible:ring-focus ${ghost}`}>
                {onMove && (
                  <button type="button" data-destination-handle disabled={arranged} aria-label={t('Move {name} (Alt+Up or Alt+Down)', { name })} onKeyDown={(e) => onHandleKey(e, id)}
                    className="ui-btn ui-btn--ghost ui-btn--sm ui-btn--icon shrink-0 cursor-grab">
                    <Icon name="grip-vertical" />
                  </button>
                )}
                {promotable
                  ? <label htmlFor={`sidebar-switch-${id}`} className="min-w-0 flex-1 truncate text-body text-default">{name}</label>
                  : <span className="min-w-0 flex-1 truncate text-body text-default">{name}</span>}
                {promotable && (
                  <Switch id={`sidebar-switch-${id}`} checked={promoted.includes(id as Promotable)} disabled={arranged} onChange={(on) => onPromote(id as Promotable, on)}
                    label={t('Show {name} among the primary items', { name })} hideLabel />
                )}
                {onMove && !arranged && (
                  <ActionMenu label={t('Menu for {name}', { name })} title={name} groups={[{ items: [
                    { kind: 'action', id: 'up', label: t('Move up'), icon: 'arrow-up', disabled: i === 0, reason: t('Already first'), onSelect: () => act(move(id, -1, false)) },
                    { kind: 'action', id: 'down', label: t('Move down'), icon: 'arrow-down', disabled: i === order.length - 1, reason: t('Already last'), onSelect: () => act(move(id, 1, false)) },
                  ] }]} triggerClassName="touch-target rounded-control px-1.5 py-0.5 text-faint hover:bg-sunken dark:hover:bg-raised" />
                )}
              </li>
            )
          })}
        </ul>
        <span role="status" aria-live="polite" className="sr-only">{announce}</span>
      </div>
    </SettingsSection>
  )
}

function usePrefsRow(): Partial<UserPrefs> | null {
  return useUserPrefsRow() ?? null
}

/**
 * The derived values of the stored custom colour for the Custom tile: the ones cached
 * on this device at once, else from the derivation, which loads on first use.
 */
function useCustomValues(hex: string | undefined): CustomAccentValues | null {
  const [got, setGot] = useState<{ hex: string; values: CustomAccentValues } | null>(null)
  const cached = cachedCustom(hex)
  const hasCached = !!cached
  useEffect(() => {
    if (!hex || hasCached) return
    let live = true
    deriveCustom(hex).then((values) => { if (live) setGot({ hex, values }) }, () => {})
    return () => { live = false }
  }, [hex, hasCached])
  if (!hex) return null
  return cached ?? (got?.hex === hex ? got.values : null)
}

/** The panel with its data: the synced row, written through ops. */
export function AppearanceSection({ author = '' }: { author?: string }) {
  const row = usePrefsRow()
  const value = readAppearance(row)
  const values = useCustomValues(value.custom)
  const catalogue = useCatalogue()
  // The server's default and themes (theme-instance-default): re-rendered when they change.
  const inst = useInstanceThemes()
  const choices = readThemeChoices(row, knownThemes(catalogue), null, inst)
  const themes: ThemeSettingsProps = { mode: value.mode, choices, catalogue, accentFromTheme: choices[effectiveSide(value.mode)].status === 'theme', author }
  return <AppearanceView value={value} onMode={(m) => act(setAppearance('theme_mode', m))} onAccent={(a) => act(setAppearance('theme_accent', a))}
    custom={{ values, onPick: (hex) => act(setCustomAccent(hex)) }} themes={themes}
    onDensity={(d) => act(setAppearance('density', d))}
    rows={{ value: accountRowLayout(row), onChange: (r) => act(setAccountRowLayout(r)) }}
    haptics={canVibrate() ? { on: hapticsPrefOn(row), onChange: (on) => act(setHapticsPref(on)) } : undefined} />
}

export function SidebarSection() {
  // Moves rewrite the whole order, so they wait for the stored one (it may hold ids this client does not know).
  const loaded = useUserPrefsRow() !== undefined
  const row = usePrefsRow()
  const value = readAppearance(row)
  return <SidebarView promoted={value.sidebar ?? []} arranged={readMethodMode(row) === 'first'} onPromote={(id, on) => act(setPromoted(row, id, on))}
    counts={readSidebarCounts(row)} onCounts={(v) => act(setSidebarCounts(v))}
    order={destinationOrder(row)} onMove={loaded ? (id, delta) => moveDestination(row, id, delta) : undefined} />
}

/** Settings → Appearance → Task details (task-side-panel D1): the synced choice, written through ops. */
export function TaskDetailsSection() {
  const row = usePrefsRow()
  return <TaskDetailsView value={readTaskOpen(row)} onChange={(v) => act(setTaskOpen(v))} />
}

export function TaskDetailsView({ value, onChange }: { value: TaskOpenPref; onChange: (v: TaskOpenPref) => void }) {
  return (
    <SettingsSection {...cardCopy('task-details')}>
      <SettingRow id="task-open" {...rowCopy('task-details', 'open')}
        control={<Segmented label={t('Open tasks')} items={TASK_OPEN} labels={TASK_OPEN_LABEL} value={value} onChange={onChange} testId="task-open" />} />
    </SettingsSection>
  )
}
