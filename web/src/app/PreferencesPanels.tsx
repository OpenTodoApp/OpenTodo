// Settings → Preferences panels (OpenSpec settings-navigation, settings-redesign D3).
import { HelpHeading } from './help/HelpLink'
import { setStartView, type StartView } from '../lib/views'
import { useStartView, useViews } from './useViews'
import { setVimEnabled, useVimEnabled } from './vim/prefs'

export function StartViewSection() {
  const views = useViews()
  const startView = useStartView()
  const startIsKnown = !startView.startsWith('view:') || views.some((v) => `view:${v.id}` === startView)
  return (
    <section className="space-y-2">
      <HelpHeading screen="settings/start-view" className="font-semibold">Start view</HelpHeading>
      <p className="text-sm text-muted">The view this device opens on launch. Each device keeps its own choice; it is not synced.</p>
      <select className="input max-w-xs" aria-label="Start view on this device" value={startIsKnown ? startView : 'inbox'}
        onChange={(e) => void setStartView(e.target.value as StartView)}>
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
      </select>
    </section>
  )
}

/** Vim keybindings switch (vim-keybindings): per device, off by default, applies at once. */
export function KeyboardSection() {
  const vim = useVimEnabled()
  return (
    <section className="space-y-2">
      <HelpHeading screen="settings/keyboard" className="font-semibold">Keyboard</HelpHeading>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={vim} onChange={(e) => setVimEnabled(e.target.checked)} data-vim-switch />
        Vim keybindings (this device)
      </label>
      <p className="text-sm text-muted">
        Normal, Insert and Command modes on top of the usual shortcuts: counts, <span className="kbd">gg</span>, <span className="kbd">dd</span>, <span className="kbd">:</span> commands. This device only; <span className="kbd">?</span> lists them.
      </p>
    </section>
  )
}
