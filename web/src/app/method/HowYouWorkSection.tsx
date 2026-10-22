// Settings → You → How you work (OpenSpec changes open-loops-method, lean-chrome
// D6 and settings-refresh D3; open-loops "Choosing how you work in Settings",
// first-run "Three-step first run"): the synced preference, written at once, and the
// "Start guide" row. Its state reads the synced `first_run` preference; "Open the
// start guide" goes to the Inbox and opens the guide there at its first step on this
// device, writing nothing until a step of the guide writes.
import { useDemo } from '../../lib/demo'
import { t } from '../../lib/i18n'
import { useUserPrefsRow } from '../../lib/localData'
import { cardCopy, rowCopy } from '../../lib/settingsCopy'
import { useMethodMode } from '../../lib/method/mode'
import { openStartGuide } from '../../lib/startGuide'
import { firstRunDone } from '../../lib/userPrefs'
import { Button, SettingRow, SettingsSection } from '../../ui'
import { navigate } from '../router'
import { MethodModeChooser } from './MethodModeChooser'

/** Opens the start guide over the Inbox, where its first step puts the task it adds. */
export function openStartGuideInInbox(): void {
  navigate({ view: 'inbox' })
  openStartGuide()
}

export function HowYouWorkSection() {
  const mode = useMethodMode()
  const prefs = useUserPrefsRow()
  // The start guide never opens on a demo instance, so it is not offered there.
  const demo = useDemo()
  return (
    // Copy: SETTINGS_COPY['how-you-work']; no Learn more, "Learn the method" is the line's link (settings-copy D7).
    <SettingsSection {...cardCopy('how-you-work')} testId="how-you-work">
      <div className="py-3 first:pt-0"><MethodModeChooser value={mode} /></div>
      {!demo && (
        <SettingRow {...rowCopy('how-you-work', 'guide')} id="start-guide"
          status={prefs === undefined ? null : <span data-start-guide-state>{firstRunDone(prefs) ? t('Finished') : t('Not finished')}</span>}
          control={<Button variant="secondary" size="sm" onClick={openStartGuideInInbox} data-start-guide-again>{t('Open the start guide')}</Button>} />
      )}
    </SettingsSection>
  )
}
