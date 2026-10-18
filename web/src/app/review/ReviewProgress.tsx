// The weekly review's progress (OpenSpec change review-guided-stepper, design D1):
// a stepper of numbered circles joined by a line, grouped under the three phases.
// A done step shows a check, the current one is filled with a soft halo, an open
// one shows what is left in a small bubble. Every circle opens its step. Phase
// groups share the width in proportion to their steps but never shrink below their
// name, so the stepper fits a 375 px screen without scrolling.
import { t } from '../../lib/i18n'
import { PHASE_OF, PHASE_TITLES, STEP_IDS, STEP_TITLES, type PhaseId, type ReviewSteps, type StepId } from '../../lib/review'
import { Icon } from '../../ui'

const PHASES: readonly PhaseId[] = ['clear', 'current', 'creative']

export function ReviewProgress({ steps, step, onStep }: { steps: Pick<ReviewSteps, 'done' | 'left'>; step: StepId; onStep: (s: StepId) => void }) {
  const at = STEP_IDS.indexOf(step)
  const columns = PHASES.map((p) => `minmax(min-content, ${STEP_IDS.filter((s) => PHASE_OF[s] === p).length}fr)`).join(' ')
  const status = (s: StepId) => (steps.done[s] ? t('done') : t('{n} left', { n: steps.left[s] }))
  return (
    <nav aria-label={t('Review progress')} className="mb-5" data-review-progress>
      <p className="sr-only">{t('Step {n} of {total} · {phase}', { n: at + 1, total: STEP_IDS.length, phase: PHASE_TITLES[PHASE_OF[step]] })}</p>
      <ol className="grid" style={{ gridTemplateColumns: columns }}>
        {PHASES.map((phase) => (
          <li key={phase} className="min-w-0" data-phase={phase}>
            <p className={`mb-2 whitespace-nowrap pr-3 text-hint font-semibold uppercase tracking-wide ${PHASE_OF[step] === phase ? 'text-accent' : 'text-faint'}`}>{PHASE_TITLES[phase]}</p>
            <ol className="flex">
              {STEP_IDS.filter((s) => PHASE_OF[s] === phase).map((s) => {
                const i = STEP_IDS.indexOf(s)
                const current = s === step
                const done = steps.done[s]
                const last = i === STEP_IDS.length - 1
                const circle = current
                  ? 'bg-accent text-on-accent ring-4 ring-accent-soft'
                  : done ? 'bg-accent-soft text-accent' : 'border border-default bg-surface text-faint'
                return (
                  <li key={s} className={`min-w-0 ${last ? '' : 'flex-1'}`}>
                    <div className="flex items-center">
                      <div className="group relative h-8 w-8 shrink-0">
                        <span aria-hidden="true" className={`flex h-full w-full items-center justify-center rounded-full text-meta font-semibold tabular-nums transition duration-(--duration-ui) group-hover:scale-105 motion-reduce:group-hover:scale-100 ${circle}`}>
                          {done && !current ? <Icon name="check" size="sm" /> : i + 1}
                        </span>
                        {!done && !current && steps.left[s] > 0 && (
                          <span aria-hidden="true" className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-warning-soft px-1 text-hint font-semibold text-on-warning-soft">{steps.left[s]}</span>
                        )}
                        {/* The button carries the spoken name only; the circle above is its picture. */}
                        <button type="button" onClick={() => onStep(s)} aria-current={current ? 'step' : undefined} data-progress-step={s}
                          className="absolute inset-0 rounded-full focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-focus">
                          <span className="sr-only">{`${PHASE_TITLES[phase]}: ${STEP_TITLES[s]}, ${status(s)}`}</span>
                        </button>
                      </div>
                      {!last && <span aria-hidden="true" className={`mx-1 h-0.5 flex-1 rounded-full ${i < at || (done && steps.done[STEP_IDS[i + 1]]) ? 'bg-accent' : 'bg-faint opacity-30'}`} />}
                    </div>
                    <span aria-hidden="true" className={`mt-2 hidden truncate pr-2 text-hint sm:block ${current ? 'font-semibold text-strong' : done ? 'text-muted' : 'text-faint'}`}>{STEP_TITLES[s]}</span>
                  </li>
                )
              })}
            </ol>
          </li>
        ))}
      </ol>
    </nav>
  )
}
