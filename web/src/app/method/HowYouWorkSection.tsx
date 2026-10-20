// Settings → You → How you work (OpenSpec changes open-loops-method and lean-chrome
// D6, open-loops "Choosing how you work in Settings"): the synced preference, written
// at once, and "Show the start guide again", which opens the start guide at its first
// step on this device and writes nothing until a step of the guide writes.
import { useDemo } from '../../lib/demo'
import { t } from '../../lib/i18n'
import { useMethodMode } from '../../lib/method/mode'
import { openStartGuide } from '../../lib/startGuide'
import { Button, SettingsSection } from '../../ui'
import { MethodModeChooser } from './MethodModeChooser'

export function HowYouWorkSection() {
  const mode = useMethodMode()
  // The start guide never opens on a demo instance, so it is not offered there.
  const demo = useDemo()
  return (
    <SettingsSection title={t('How you work')} headingId="how-you-work-heading" testId="how-you-work"
      description={t('How much the app shows Open Loops, its method for everything on your mind. Saved to your account; switching never changes a task.')}>
      <div className="py-3 first:pt-0"><MethodModeChooser value={mode} /></div>
      {!demo && (
        <div className="pb-1">
          <Button variant="ghost" size="sm" icon="rotate-ccw" onClick={openStartGuide} data-start-guide-again>{t('Show the start guide again')}</Button>
        </div>
      )}
    </SettingsSection>
  )
}
