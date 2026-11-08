// The What's new dot (OpenSpec `whats-new`, design D2): one quiet marker, not a count, on
// the About row of the settings list and on the What's new card. Its name says there are notes.
import { t } from '../lib/i18n'

export function NewsDot() {
  return <span role="img" aria-label={t('New notes')} data-news-dot className="inline-block h-2 w-2 shrink-0 rounded-full bg-accent" />
}
