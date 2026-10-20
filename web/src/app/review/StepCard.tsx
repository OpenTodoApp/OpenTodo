// One step of a guided review (OpenSpec changes review-guided-stepper D1 and
// close-the-day D2): the card with its position, a title that takes focus and a
// badge, the step's content, and Back / Next below it. The weekly review and
// Close the day render the same markup, so the review screens keep one look.
import type { ReactNode, RefObject } from 'react'
import { Button, Card, Icon, type IconName } from '../../ui'
import { t } from '../../lib/i18n'

export interface StepNext {
  label: string
  onClick: () => void
  /** The last step's action: a check instead of the chevron, `data-review-finish` instead of `data-review-next`. */
  finish?: boolean
}

export function StepCard({ step, position, title, titleRef, icon, badge, onBack, next, children }: {
  step: string
  /** "Step 2 of 3 · Close the day". */
  position: string
  title: string
  titleRef: RefObject<HTMLHeadingElement | null>
  icon: IconName
  badge?: ReactNode
  onBack: (() => void) | null
  next: StepNext
  children: ReactNode
}) {
  return (
    <>
      <Card as="section" padding="none" aria-labelledby="review-step-title" data-review-step={step}>
        <header className="flex items-start gap-3 border-b border-default bg-accent-soft/40 px-4 py-4 sm:gap-4 sm:px-6 sm:py-5">
          <span aria-hidden="true" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-control bg-accent-soft text-accent">
            <Icon name={icon} size="lg" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-hint font-semibold uppercase tracking-wide text-accent" data-review-position>{position}</p>
            <h2 id="review-step-title" ref={titleRef} tabIndex={-1} className="mt-0.5 text-h2 font-semibold text-strong outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
              {title}
            </h2>
          </div>
          {badge}
        </header>
        <div className="px-4 pb-4 pt-4 sm:px-6 sm:pb-6">{children}</div>
      </Card>
      <div className="mt-4 flex items-center justify-between gap-2" data-review-nav>
        {onBack ? <Button variant="ghost" icon="chevron-left" onClick={onBack} data-review-back>{t('Back')}</Button> : <span />}
        {next.finish
          ? <Button variant="primary" className="max-sm:flex-1" icon="check" onClick={next.onClick} data-review-finish>{next.label}</Button>
          : <Button variant="primary" className="max-sm:flex-1" iconEnd="chevron-right" onClick={next.onClick} data-review-next>{next.label}</Button>}
      </div>
    </>
  )
}
