// Close the day's progress (OpenSpec change close-the-day-redesign, design D1): three
// named dots in the header row (above the step's title on a phone, where the shell's
// bar holds the title), small enough for 375 px. The current step is a pill,
// a step already seen is a soft dot and What moves, once passed, reads "decided, not
// yet moved" until the close writes (weekly-review "Carry-over is one batch"). Each
// dot opens its step; its name is the button's name and its tooltip.
import { t } from '../../lib/i18n'
import { CLOSE_STEP_IDS, CLOSE_STEP_TITLES, type CloseStepId } from '../../lib/closeDay'
import { Tooltip } from '../../ui'

export function CloseProgress({ step, seen, onStep }: { step: CloseStepId; seen: ReadonlySet<CloseStepId>; onStep: (s: CloseStepId) => void }) {
  const at = CLOSE_STEP_IDS.indexOf(step)
  return (
    <nav aria-label={t('Close the day progress')} data-review-progress>
      <p className="sr-only">{t('Step {n} of {total}', { n: at + 1, total: CLOSE_STEP_IDS.length })}</p>
      <ol className="flex items-center">
        {CLOSE_STEP_IDS.map((s) => {
          const current = s === step
          const visited = !current && seen.has(s)
          const state = current ? 'current' : visited ? (s === 'moves' ? 'decided' : 'seen') : 'ahead'
          const status = current ? t('current step') : state === 'decided' ? t('decided, not moved yet') : visited ? t('seen') : t('not yet')
          return (
            <li key={s}>
              <Tooltip label={CLOSE_STEP_TITLES[s]}>
                <button type="button" onClick={() => onStep(s)} aria-current={current ? 'step' : undefined} data-progress-step={s} data-progress-state={state}
                  aria-label={`${CLOSE_STEP_TITLES[s]}, ${status}`}
                  className="touch-target flex h-6 min-w-6 items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-focus">
                  <span aria-hidden="true" className={`block h-2 rounded-full transition-all duration-(--duration-ui) motion-reduce:transition-none ${
                    current ? 'w-6 bg-accent forced-colors:bg-[Highlight]' : state === 'decided' ? 'w-2 bg-accent ring-2 ring-accent-soft forced-colors:bg-[CanvasText]' : visited ? 'w-2 bg-accent/50 forced-colors:bg-[CanvasText]' : 'w-2 bg-faint/40 forced-colors:border forced-colors:border-[CanvasText]'}`} />
                </button>
              </Tooltip>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
