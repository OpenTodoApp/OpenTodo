// The words a person reads for a task's origin (import-origin-reads-as-app, GitHub
// issue 945). Apart from lib/taskOrigin.ts so the translations stay out of the
// app's first chunk, which imports the origin readers.
import { t } from './i18n'
import { importApp, originLabel } from './taskOrigin'
import type { Origin } from './types'

/**
 * The words a person reads for an origin, in a chip, the task's details, its history:
 * the label; "Imported from Todoist" (or "Imported") for an import, whose id is never
 * shown; "Email" for a mail without a link (its Message-ID is not a label).
 */
export function originText(origin: Origin): string {
  if (origin.kind === 'import') {
    const app = importApp(origin.provider)
    return app ? t('Imported from {app}', { app }) : t('Imported')
  }
  return originLabel(origin) || t('Email')
}
