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
      {t('Routines: an Ask AI or Summarise step of one of your routines sends its instruction and what it reads (text, lines, tasks with their title, due date, priority, labels and project, or a project with its name, sections and open tasks) to the same provider on a schedule or after an event, while you may not be looking. Its result waits for your review unless you turn on Apply without asking for that routine.')}
    </p>
  )
}
