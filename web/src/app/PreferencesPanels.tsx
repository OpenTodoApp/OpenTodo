// Settings → Preferences panels (OpenSpec settings-navigation, settings-redesign D3).
import { Select } from '../ui/Field'
import { SettingRow, SettingsSection } from '../ui/patterns/SettingsSection'
import { Switch } from '../ui/Switch'
import { setStartView, type StartView } from '../lib/views'
import type { View } from '../lib/types'
import { useStartView, useViews } from './useViews'
import { setVimEnabled, useVimEnabled } from './vim/prefs'

export function StartViewSection() {
  const views = useViews()
  const startView = useStartView()
  return <StartViewView views={views} startView={startView} onChange={(v) => void setStartView(v)} />
}

/** Presentational part of the start view setting, rendered without effects for tests and stories. */
export function StartViewView({ views, startView, onChange }: { views: View[]; startView: StartView; onChange: (v: StartView) => void }) {
  const startIsKnown = !startView.startsWith('view:') || views.some((v) => `view:${v.id}` === startView)
  return (
    <SettingsSection title="Start view" helpId="settings/start-view" headingId="start-view-heading"
      description="The view this device opens on launch. Each device keeps its own choice; it is not synced.">
      <SettingRow label="Open on launch" htmlFor="start-view-select" control={
        <Select id="start-view-select" className="sm:w-56" aria-label="Start view on this device" value={startIsKnown ? startView : 'inbox'}
          onChange={(e) => onChange(e.target.value as StartView)}>
          <optgroup label="Built-in">
            <option value="inbox">Inbox</option>
            <option value="today">Today</option>
            <option value="upcoming">Upcoming</option>
            <option value="completed">Completed</option>
            <option value="filter">Filter</option>
          </optgroup>
          {views.length > 0 && (
            <optgroup label="Saved views">
              {views.map((v) => <option key={v.id} value={`view:${v.id}`}>{v.name}</option>)}
            </optgroup>
          )}
        </Select>
      } />
    </SettingsSection>
  )
}

/** Vim keybindings switch (vim-keybindings): per device, off by default, applies at once. */
export function KeyboardSection() {
  const vim = useVimEnabled()
  return <KeyboardView vim={vim} onVim={setVimEnabled} />
}

export function KeyboardView({ vim, onVim }: { vim: boolean; onVim: (on: boolean) => void }) {
  return (
    <SettingsSection title="Keyboard" helpId="settings/keyboard" headingId="keyboard-heading"
      description="Every action has a shortcut; press ? anywhere to list them.">
      <SettingRow label="Vim keybindings" description={
        <>Normal, Insert and Command modes on top of the usual shortcuts: counts, <span className="kbd">gg</span>, <span className="kbd">dd</span>, <span className="kbd">:</span> commands. This device only.</>
      } control={<span data-vim-switch><Switch checked={vim} onChange={onVim} label="Vim keybindings (this device)" hideLabel /></span>} />
    </SettingsSection>
  )
}
