// "How you work" (OpenSpec change open-loops-method, design D2, D10; open-loops
// "Choosing how you work"): three choices as a radio group of cards, each with one
// sentence, "Learn the method", and after choosing Open Loops the two offers: the
// starter contexts (when there is no context yet) and, for Open Loops first, the
// Loop home as this device's start view. Nothing is written about the offers.
import { useRef, useState, type KeyboardEvent } from 'react'
import { t, translatedMap } from '../../lib/i18n'
import { SETTINGS_COPY } from '../../lib/settingsCopy'
import { useAllLabels } from '../../lib/localData'
import { METHOD_NAME } from '../../lib/method'
import { METHOD_MODES, setMethodMode, type MethodMode } from '../../lib/method/mode'
import { createStarterContexts, hasContext, STARTER_CONTEXTS } from '../../lib/method/starter'
import { setStartView } from '../../lib/views'
import { Button, Notice } from '../../ui'
import { act } from '../actionError'
import { openHelp } from '../../lib/helpRequest'
import { METHOD_HELP_SCREENS } from '../help/MethodLink'

// The three options' text is the How you work card's in the settings copy table (settings-copy D7).
const OPTIONS = SETTINGS_COPY['how-you-work'].options
export const MODE_LABEL = translatedMap<MethodMode>({ lists: OPTIONS.lists.label, companion: OPTIONS.companion.label, first: OPTIONS.first.label })
export const MODE_DESCRIPTION = translatedMap<MethodMode>({ lists: OPTIONS.lists.description, companion: OPTIONS.companion.description, first: OPTIONS.first.description })

type Offer = 'contexts' | 'start'

export function MethodModeChooser({ value, onChosen, writeOnChoose = true, offerPreselected = false }: {
  value: MethodMode
  /** Called after a choice (and after it is written, when `writeOnChoose`). */
  onChosen?: (mode: MethodMode) => void
  /** Write the preference at once (Settings); the first-run card writes when it moves on. */
  writeOnChoose?: boolean
  /** Show the offers for the preselected value too (the first-run card preselects Companion). */
  offerPreselected?: boolean
}) {
  const labels = useAllLabels()
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const offersFor = (mode: MethodMode): Offer[] => [...(mode !== 'lists' && !hasContext(labels) ? ['contexts' as const] : []), ...(mode === 'first' ? ['start' as const] : [])]
  const [offers, setOffers] = useState<Offer[]>(() => (offerPreselected ? offersFor(value) : []))
  const [done, setDone] = useState<string | null>(null)
  const choose = (mode: MethodMode) => {
    if (mode === value) return
    if (writeOnChoose) act(setMethodMode(mode))
    setDone(null)
    setOffers(offersFor(mode))
    onChosen?.(mode)
  }
  const onKey = (e: KeyboardEvent, i: number) => {
    const next = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? (i + 1) % METHOD_MODES.length
      : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? (i - 1 + METHOD_MODES.length) % METHOD_MODES.length
      : e.key === 'Home' ? 0 : e.key === 'End' ? METHOD_MODES.length - 1 : -1
    if (next < 0) return
    e.preventDefault()
    choose(METHOD_MODES[next])
    refs.current[next]?.focus()
  }
  const drop = (o: Offer) => setOffers((list) => list.filter((x) => x !== o))
  return (
    <div data-method-chooser>
      <div role="radiogroup" aria-label={t('How you work')} className="grid gap-2 sm:grid-cols-3">
        {METHOD_MODES.map((mode, i) => {
          const on = mode === value
          return (
            <button key={mode} ref={(el) => { refs.current[i] = el }} type="button" role="radio" aria-checked={on} tabIndex={on ? 0 : -1}
              data-method-mode={mode} onClick={() => choose(mode)} onKeyDown={(e) => onKey(e, i)}
              className={`touch-target rounded-card border p-3 text-left transition duration-(--duration-ui) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ${on ? 'border-accent bg-accent-soft' : 'border-default bg-surface hover:bg-sunken'}`}>
              <span className="block text-body font-semibold text-default">{MODE_LABEL[mode]}</span>
              <span className="mt-1 block text-meta text-muted">{MODE_DESCRIPTION[mode]}</span>
            </button>
          )
        })}
      </div>
      <p className="mt-2">
        <button type="button" className="text-meta text-accent underline" data-learn-method data-help-screen={METHOD_HELP_SCREENS.overview} aria-haspopup="dialog"
          onClick={(e) => openHelp(METHOD_HELP_SCREENS.overview, e.currentTarget)}>{t('Learn the method: {method}', { method: METHOD_NAME })}</button>
      </p>
      {offers.includes('contexts') && (
        <div className="mt-3" data-offer="contexts">
          <Notice tone="info" action={<span className="flex flex-wrap gap-2">
            <Button size="sm" variant="primary" onClick={() => act(createStarterContexts().then((names) => { drop('contexts'); setDone(names.length ? t('Created {names}.', { names: names.join(', ') }) : null) }))}>{t('Create them')}</Button>
            <Button size="sm" variant="ghost" onClick={() => drop('contexts')}>{t('No thanks')}</Button>
          </span>}>
            {t('Start with four contexts? {names}. Any label that starts with @ is a context.', { names: STARTER_CONTEXTS.map((n) => t(n)).join(', ') })}
          </Notice>
        </div>
      )}
      {offers.includes('start') && (
        <div className="mt-3" data-offer="start">
          <Notice tone="info" action={<span className="flex flex-wrap gap-2">
            <Button size="sm" variant="primary" onClick={() => act(setStartView('loop').then(() => { drop('start'); setDone(t('This device now opens on the Loop home.')) }))}>{t('Open on the Loop home')}</Button>
            <Button size="sm" variant="ghost" onClick={() => drop('start')}>{t('Keep my start view')}</Button>
          </span>}>
            {t('Open on the Loop home on this device? Your other devices keep their own start view.')}
          </Notice>
        </div>
      )}
      {done && <p role="status" className="mt-2 text-meta text-muted">{done}</p>}
    </div>
  )
}
