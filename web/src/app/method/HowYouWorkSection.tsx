// Settings → You → How you work (OpenSpec changes open-loops-method, lean-chrome
// D6 and settings-refresh D3; open-loops "Choosing how you work in Settings",
// first-run "Three-step first run"): the synced preference, written at once, and the
// "Start guide" row. Its state reads the synced `first_run` preference; "Open the
// start guide" goes to the Inbox and opens the guide there at its first step on this
// device, writing nothing until a step of the guide writes.
import { useState } from 'react'
import { useDemo } from '../../lib/demo'
import { setHabitsOn, useHabitsEnabled } from '../../lib/habitPrefs'
import { t } from '../../lib/i18n'
import { useUserPrefsRow } from '../../lib/localData'
import { cardCopy, rowCopy } from '../../lib/settingsCopy'
import { useMethodMode } from '../../lib/method/mode'
import { openStartGuide } from '../../lib/startGuide'
import { firstRunDone, formattingButtonOn, setFormattingButton } from '../../lib/userPrefs'
import { readBentoOrder, readFocusStyle, setBentoOrder, setFocusStyle, type BentoOrder, type FocusStyle } from '../../lib/bento'
import { energyLevelsOn, setEnergyLevels } from '../../lib/energy'
import { timeSectorsOn } from '../../lib/sectorNames'
import { setTimeSectors } from '../../lib/sectorPrefs'
import { objectivesOn, setObjectivesOn } from '../../lib/objectivePrefs'
import { Button, Select, SettingRow, SettingsSection, Switch } from '../../ui'
import { act } from '../actionError'
import { navigate } from '../router'
import { MethodModeChooser } from './MethodModeChooser'

/** Opens the start guide over the Inbox, where its first step puts the task it adds. */
export function openStartGuideInInbox(): void {
  navigate({ view: 'inbox' })
  openStartGuide()
}

/**
 * Daily focus and, only with Bento, its Order (bento-daily-check D4): the synced
 * user_prefs.focus_style and bento_order, as in the Daily check's header menu.
 */
export function DailyFocusRows({ style, order, onStyle, onOrder }: { style: FocusStyle; order: BentoOrder; onStyle: (s: FocusStyle) => void; onOrder: (o: BentoOrder) => void }) {
  return (
    <>
      <SettingRow {...rowCopy('how-you-work', 'focus')} id="daily-focus" htmlFor="daily-focus-select" control={(
        <Select id="daily-focus-select" className="sm:w-40" value={style} data-focus-style-select onChange={(e) => onStyle(e.target.value === 'bento' ? 'bento' : 'three')}>
          <option value="three">{t('Three tasks')}</option>
          <option value="bento">{t('Bento')}</option>
        </Select>
      )} />
      {style === 'bento' && (
        <SettingRow {...rowCopy('how-you-work', 'order')} id="bento-order" htmlFor="bento-order-select" control={(
          <Select id="bento-order-select" className="sm:w-40" value={order} data-bento-order-select onChange={(e) => onOrder(e.target.value === 'summit' ? 'summit' : 'frog')}>
            <option value="frog">{t('Frog: Large first')}</option>
            <option value="summit">{t('Summit: Medium first')}</option>
          </Select>
        )} />
      )}
    </>
  )
}

/** The Habits switch (habits-home D1): turning it on says once, in place, where Habits lives. */
function HabitsRow() {
  const on = useHabitsEnabled()
  const [said, setSaid] = useState(false)
  return (
    <SettingRow {...rowCopy('how-you-work', 'habits')} id="habits" htmlFor="habits-switch"
      status={said && on ? <span data-habits-on-note>{t('Habits is in the sidebar under More.')} <button type="button" className="text-accent underline" onClick={() => navigate({ view: 'habits' })}>{t('Open Habits')}</button></span> : null}
      control={<span data-habits-switch><Switch id="habits-switch" checked={on} onChange={(v) => { setSaid(v); act(setHabitsOn(v)) }} label={t('Habits')} hideLabel /></span>} />
  )
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
      {/* Below the three choices, off by default in every mode; off hides the controls, never a sector (time-sectors D7). */}
      <SettingRow {...rowCopy('how-you-work', 'sectors')} id="time-sectors" htmlFor="time-sectors-switch"
        control={<span data-time-sectors-switch><Switch id="time-sectors-switch" checked={timeSectorsOn(prefs)} onChange={(on) => act(setTimeSectors(on))} label={t('Time sectors')} hideLabel /></span>} />
      <DailyFocusRows style={readFocusStyle(prefs)} order={readBentoOrder(prefs)}
        onStyle={(s) => act(setFocusStyle(s))} onOrder={(o) => act(setBentoOrder(o))} />
      {/* Off by default in every mode; off hides the Plan's strip and the review's section, never an objective (plan-objectives D8). */}
      <SettingRow {...rowCopy('how-you-work', 'objectives')} id="objectives" htmlFor="objectives-switch"
        control={<span data-objectives-switch><Switch id="objectives-switch" checked={objectivesOn(prefs)} onChange={(on) => act(setObjectivesOn(on))} label={t('Objectives')} hideLabel /></span>} />
      {/* Not decided by default (habits-home D1): on while the account has a habit; off hides every habit control, never a habit. */}
      <HabitsRow />
      {/* Off by default in every mode; turning it off hides the choice, never a value (task-energy D3). */}
      <SettingRow {...rowCopy('how-you-work', 'energy')} id="energy-levels" htmlFor="energy-levels-switch"
        control={<span data-energy-levels-switch><Switch id="energy-levels-switch" checked={energyLevelsOn(prefs)} onChange={(on) => act(setEnergyLevels(on))} label={t('Energy levels')} hideLabel /></span>} />
      {/* On by default; off hides the Formatting toggle of notes and comments on a computer (notes-toolbar-desktop D4). */}
      <SettingRow {...rowCopy('how-you-work', 'formatting')} id="formatting-button" htmlFor="formatting-button-switch"
        control={<span data-formatting-button-switch><Switch id="formatting-button-switch" checked={formattingButtonOn(prefs)} onChange={(on) => act(setFormattingButton(on))} label={t('Formatting button')} hideLabel /></span>} />
      {!demo && (
        <SettingRow {...rowCopy('how-you-work', 'guide')} id="start-guide"
          status={prefs === undefined ? null : <span data-start-guide-state>{firstRunDone(prefs) ? t('Finished') : t('Not finished')}</span>}
          control={<Button variant="secondary" size="sm" onClick={openStartGuideInInbox} data-start-guide-again>{t('Open the start guide')}</Button>} />
      )}
    </SettingsSection>
  )
}
