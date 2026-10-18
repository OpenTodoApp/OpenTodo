// Settings → You → How you work (OpenSpec change open-loops-method, open-loops
// "Choosing how you work"): the synced preference, written at once.
import { t } from '../../lib/i18n'
import { useMethodMode } from '../../lib/method/mode'
import { SettingsSection } from '../../ui'
import { MethodModeChooser } from './MethodModeChooser'

export function HowYouWorkSection() {
  const mode = useMethodMode()
  return (
    <SettingsSection title={t('How you work')} headingId="how-you-work-heading" testId="how-you-work"
      description={t('How much the app shows Open Loops, its method for everything on your mind. Saved to your account; switching never changes a task.')}>
      <div className="py-3 first:pt-0"><MethodModeChooser value={mode} /></div>
    </SettingsSection>
  )
}
