// Settings → Preferences → Appearance (OpenSpec change theming, design D9): the
// mode and the accent theme, saved to the synced user_prefs row and applied at
// once. Theme tiles are a radio group with roving focus; each tile previews its
// theme through the real tokens (a data-accent subtree).
import { useLiveQuery } from 'dexie-react-hooks'
import { type KeyboardEvent, useRef } from 'react'
import { readAppearance, setAppearance, THEME_MODES, type Appearance } from '../lib/appearance'
import { db } from '../lib/db'
import type { ThemeModePref } from '../lib/types'
import { USER_PREFS_ID } from '../lib/userPrefs'
import { SettingRow, SettingsSection } from '../ui'
import { ACCENTS, type AccentId } from '../ui'

const MODE_LABEL: Record<ThemeModePref, string> = { system: 'System', light: 'Light', dark: 'Dark' }

export interface AppearanceViewProps {
  value: Appearance
  onMode: (m: ThemeModePref) => void
  onAccent: (a: AccentId) => void
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

export function AppearanceView({ value, onMode, onAccent }: AppearanceViewProps) {
  const modeRefs = useRef<(HTMLButtonElement | null)[]>([])
  const tileRefs = useRef<(HTMLButtonElement | null)[]>([])
  const ids = ACCENTS.map((a) => a.id)
  return (
    <SettingsSection title="Appearance" helpId="settings/appearance" headingId="appearance-heading"
      description="Light or dark, and the colour of buttons, links and selection. Saved to your account, so all your devices follow.">
      <SettingRow label="Mode" description="System follows your device's light or dark setting."
        control={
          <div role="radiogroup" aria-label="Mode" className="inline-flex rounded-control border border-input bg-surface p-0.5" data-appearance-mode>
            {THEME_MODES.map((m, i) => (
              <button key={m} ref={(el) => { modeRefs.current[i] = el }} type="button" role="radio" aria-checked={value.mode === m} tabIndex={value.mode === m ? 0 : -1}
                className={`rounded-control px-3 py-1 text-meta touch-target ${value.mode === m ? 'bg-accent text-on-accent' : 'text-default hover:bg-sunken dark:hover:bg-raised'}`}
                onClick={() => onMode(m)}
                onKeyDown={(e) => roving(e, THEME_MODES, value.mode, onMode, (n) => modeRefs.current[n]?.focus())}>
                {MODE_LABEL[m]}
              </button>
            ))}
          </div>
        } />
      <div className="py-3">
        <p id="appearance-theme-label" className="mb-2 text-sm font-medium text-default">Theme</p>
        <div role="radiogroup" aria-labelledby="appearance-theme-label" className="grid grid-cols-2 gap-3 sm:grid-cols-4" data-appearance-themes>
          {ACCENTS.map((a, i) => {
            const on = value.accent === a.id
            return (
              <button key={a.id} ref={(el) => { tileRefs.current[i] = el }} type="button" role="radio" aria-checked={on} tabIndex={on ? 0 : -1}
                data-accent={a.id} data-theme-tile={a.id}
                className={`flex flex-col gap-2 rounded-card border bg-surface p-2 text-left outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ${on ? 'border-accent ring-2 ring-accent' : 'border-default'}`}
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
                <span className="text-meta font-medium text-default">{a.label}</span>
              </button>
            )
          })}
        </div>
      </div>
    </SettingsSection>
  )
}

/** The panel with its data: the synced row, written through ops. */
export function AppearanceSection() {
  const row = useLiveQuery(async () => (await db.userPrefs.get(USER_PREFS_ID)) ?? null, [])
  const value = readAppearance(row ?? null)
  return <AppearanceView value={value} onMode={(m) => void setAppearance('theme_mode', m)} onAccent={(a) => void setAppearance('theme_accent', a)} />
}
