// "Learn more" (OpenSpec change settings-refresh, settings-navigation "Learn more
// links", design D2): the one element every "Learn more" in the app comes from. It
// opens a guide section in the Help panel beside the page, so it is a button, but it
// reads and points like a link: underline, accent and the pointer cursor. `make
// ui-lint` refuses a "Learn more" text rendered by anything else.
import { openHelp } from '../lib/helpRequest'
import { t } from '../lib/i18n'

export interface LearnMoreProps {
  /** The Help screen id it opens. */
  screen: string
  /** What it is about, for the accessible name ("Learn more: Passkeys"); the text alone when absent. */
  topic?: string
  className?: string
  /** Extra data attributes kept for tests and scripts. */
  dataAttrs?: Record<string, string | boolean>
}

export function LearnMore({ screen, topic, className = '', dataAttrs }: LearnMoreProps) {
  return (
    <button type="button" data-help-screen={screen} data-learn-more aria-haspopup="dialog"
      aria-label={topic ? t('Learn more: {topic}', { topic }) : undefined}
      className={`ot-learn-more text-accent underline underline-offset-2 hover:decoration-2 ${className}`}
      onClick={(e) => openHelp(screen, e.currentTarget)} {...dataAttrs}>
      {t('Learn more')}
    </button>
  )
}
