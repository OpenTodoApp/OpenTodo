// One step of a guided review (OpenSpec changes review-guided-stepper D1 and
// close-the-day D2): the card with its position, a title that takes focus and a
// badge, the step's content, and Back / Next below it. The weekly review and
// Close the day render the same markup, so the review screens keep one look;
// Close the day puts Back / Next in the card's footer (close-the-day-v2 D5).
import type { ReactNode, RefObject } from 'react'
import { Button, Card, Icon, type IconName } from '../../ui'
import { t } from '../../lib/i18n'

export interface StepNext {
  label: string
  onClick: () => void
  /** The last step's action: a check instead of the chevron, `data-review-finish` instead of `data-review-next`. */
  finish?: boolean
}

export function StepCard({ step, position, title, titleRef, icon, badge, onBack, next, navInside = false, children }: {
  step: string
  /** "Step 2 of 3 · Close the day". */
  position: string
  title: string
  titleRef: RefObject<HTMLHeadingElement | null>
  icon: IconName
  badge?: ReactNode
  onBack: (() => void) | null
  next: StepNext
  /** Back and Next in the card's footer instead of a row below it. */
  navInside?: boolean
  children: ReactNode
}) {
  const nav = (
    <div className={`flex items-center justify-between gap-2 ${navInside ? 'border-t border-default px-4 py-3 sm:px-6' : 'mt-4'}`} data-review-nav>
      {onBack ? <Button variant="ghost" icon="chevron-left" onClick={onBack} data-review-back>{t('Back')}</Button> : <span />}
      {next.finish
        ? <Button variant="primary" className="max-sm:flex-1" icon="check" onClick={next.onClick} data-review-finish>{next.label}</Button>
        : <Button variant="primary" className="max-sm:flex-1" iconEnd="chevron-right" onClick={next.onClick} data-review-next>{next.label}</Button>}
    </div>
  )
  return (
    <>
      <Card as="section" padding="none" aria-labelledby="review-step-title" data-review-step={step}>
        <header className="flex items-start gap-3 border-b border-default px-4 py-4 sm:gap-4 sm:px-6 sm:py-5">
          <span aria-hidden="true" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-control bg-raised text-muted">
            <Icon name={icon} size="lg" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-hint font-semibold uppercase tracking-wide text-faint" data-review-position>{position}</p>
            {/* Focused from code on each step so a screen reader reads it; not a stop for Tab, so no ring (precision-polish D6). */}
            <h2 id="review-step-title" ref={titleRef} tabIndex={-1} className="mt-0.5 text-h2 font-semibold text-strong outline-none">
              {title}
            </h2>
          </div>
          {badge}
        </header>
        <div className="px-4 pb-4 pt-4 sm:px-6 sm:pb-6">{children}</div>
        {navInside && nav}
      </Card>
      {!navInside && nav}
    </>
  )
}
