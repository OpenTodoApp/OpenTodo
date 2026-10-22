// Settings → Appearance (OpenSpec change theming, design D9; ux-overhaul,
// appearance-preferences "Appearance in Settings without a Rows choice"): mode,
// accent theme, density and the promoted sidebar destinations, all in the synced user_prefs row and
// applied at once. Theme tiles are a radio group with roving focus; each tile
// previews its theme through the real tokens (a data-accent subtree). Below
// 640 px the tiles are one scrollable row of named swatches.
import { readMethodMode } from '../lib/method/mode'
import { type KeyboardEvent, useRef } from 'react'
import { DENSITIES, type Density, PROMOTABLE, type Promotable, readAppearance, setAppearance, setPromoted, THEME_MODES, type Appearance } from '../lib/appearance'
import { useUserPrefsRow } from '../lib/localData'
import type { ThemeModePref, UserPrefs } from '../lib/types'
import { SettingRow, SettingsSection, Switch } from '../ui'
import { ACCENTS, type AccentId } from '../ui'
import { t, msg, translatedMap } from '../lib/i18n'
import { accentName } from '../lib/colourNames'
import { act } from './actionError'
import { cardCopy, rowCopy } from '../lib/settingsCopy'

const MODE_LABEL = translatedMap<ThemeModePref>({ system: msg('System'), light: msg('Light'), dark: msg('Dark') })
const DENSITY_LABEL = translatedMap<Density>({ comfortable: msg('Comfortable'), compact: msg('Compact') })

/** The destinations of the sidebar's More group, as the switches name them (app-shell "Sidebar structure"). */
export const PROMOTABLE_LABEL = translatedMap<Promotable>({
  loop: msg('Loop home'), next: msg('Next actions'), waiting: msg('Waiting'),
  anytime: msg('Anytime'), someday: msg('Someday'), assigned: msg('Assigned to me'), completed: msg('Completed'), feed: msg('Updates'), trash: msg('Trash'), filter: msg('Filter'),
})

export interface AppearanceViewProps {
  value: Appearance
  onMode: (m: ThemeModePref) => void
  onAccent: (a: AccentId) => void
  onDensity?: (d: Density) => void
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

export function AppearanceView({ value, onMode, onAccent, onDensity }: AppearanceViewProps) {
  const tileRefs = useRef<(HTMLButtonElement | null)[]>([])
  const ids = ACCENTS.map((a) => a.id)
  return (
    <SettingsSection {...cardCopy('appearance')}>
      <SettingRow id="appearance-mode" {...rowCopy('appearance', 'mode')}
        control={<span data-appearance-mode><Segmented label={t('Mode')} items={THEME_MODES} labels={MODE_LABEL} value={value.mode} onChange={onMode} testId="appearance-mode" /></span>} />
      <div className="py-3" id="appearance-theme" tabIndex={-1} data-setting-row="appearance-theme">
        <p id="appearance-theme-label" className="mb-2 text-body font-medium text-default">{rowCopy('appearance', 'theme').label}</p>
        <div role="radiogroup" aria-labelledby="appearance-theme-label" data-appearance-themes data-scroll-x
          className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-1 sm:mx-0 sm:grid sm:grid-cols-4 sm:gap-3 sm:overflow-visible sm:px-0 sm:pb-0">
          {ACCENTS.map((a, i) => {
            const on = value.accent === a.id
            return (
              <button key={a.id} ref={(el) => { tileRefs.current[i] = el }} type="button" role="radio" aria-checked={on} tabIndex={on ? 0 : -1}
                data-accent={a.id} data-theme-tile={a.id}
                className={`flex w-28 shrink-0 snap-start flex-col gap-2 rounded-card border bg-surface p-2 text-left outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus sm:w-auto ${on ? 'border-accent ring-2 ring-accent' : 'border-default'}`}
                onClick={() => onAccent(a.id)}
                onKeyDown={(e) => roving(e, ids, value.accent, onAccent, (n) => tileRefs.current[n]?.focus())}>
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
                <span className="text-meta font-medium text-default">{accentName(a.label)}</span>
              </button>
            )
          })}
        </div>
      </div>
      {onDensity && (
        <SettingRow id="appearance-density" {...rowCopy('appearance', 'density')}
          control={<Segmented label={t('Density')} items={DENSITIES} labels={DENSITY_LABEL} value={value.density ?? 'comfortable'} onChange={onDensity} testId="appearance-density" />} />
      )}
    </SettingsSection>
  )
}

/** The sidebar destinations (app-shell "Sidebar structure"): one switch per destination of the More group. */
export function SidebarView({ promoted, onPromote, arranged = false }: { promoted: readonly Promotable[]; onPromote: (id: Promotable, on: boolean) => void; arranged?: boolean }) {
  return (
    <SettingsSection {...cardCopy('sidebar', { variant: arranged ? 'arranged' : 'standard' })}>
      {PROMOTABLE.map((id) => (
        <SettingRow key={id} id={`sidebar-${id}`} label={PROMOTABLE_LABEL[id]} htmlFor={`sidebar-switch-${id}`}
          control={<Switch id={`sidebar-switch-${id}`} checked={promoted.includes(id)} disabled={arranged} onChange={(on) => onPromote(id, on)} label={t('Show {name} among the primary items', { name: PROMOTABLE_LABEL[id] })} hideLabel />} />
      ))}
    </SettingsSection>
  )
}

function usePrefsRow(): Partial<UserPrefs> | null {
  return useUserPrefsRow() ?? null
}

/** The panel with its data: the synced row, written through ops. */
export function AppearanceSection() {
  const row = usePrefsRow()
  const value = readAppearance(row)
  return <AppearanceView value={value} onMode={(m) => act(setAppearance('theme_mode', m))} onAccent={(a) => act(setAppearance('theme_accent', a))}
    onDensity={(d) => act(setAppearance('density', d))} />
}

export function SidebarSection() {
  const row = usePrefsRow()
  const value = readAppearance(row)
  return <SidebarView promoted={value.sidebar ?? []} arranged={readMethodMode(row) === 'first'} onPromote={(id, on) => act(setPromoted(row, id, on))} />
}
