import { t } from '../../lib/i18n'

/**
 * The disclosure's paragraph on routines (routines-ai-step D10): a routine's
 * AI steps send what they read on a schedule or after an event, while the
 * person may not be there. Shown before the first message and in Settings for
 * a consent given before routines had AI steps.
 */
export function RoutinesDisclosure() {
  return (
    <p className="text-muted" data-consent-routines>
      {t('Routines: an Ask AI or Summarise step of one of your routines sends what it reads (text, lines, or tasks with their title, due date, priority, labels and project) to the same provider on a schedule or after an event, while you may not be looking. Its result waits for your review unless you turn on Apply without asking for that routine.')}
    </p>
  )
}
