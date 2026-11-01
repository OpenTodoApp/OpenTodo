// Stand-in for web/src/lib/i18n and web/src/lib/i18n/catalog in the plugin bundle
// (esbuild.config.mjs) and its tests (vitest.config.mjs). The shared modules the
// plugin imports (quick add, recurrence, the envelope primitives) only format a
// few English messages with t(); the web catalogue, React and device storage
// stay out of the plugin. The plugin's own strings are in src/strings.ts.
import { formatMessage } from '../../../web/src/lib/i18n/format'

type Values = Record<string, string | number | undefined> & { context?: string }

export function t(message: string, values?: Values): string {
  return formatMessage(message, (values ?? {}) as Record<string, string | number>, 'en')
}

export function msg<S extends string>(message: S): S {
  return message
}

export function currentLanguage(): string {
  return 'en'
}
