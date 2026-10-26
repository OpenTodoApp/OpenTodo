import { ApiError } from './api'
import { t } from './i18n'

/** How a screen words a failed server call (errorText). */
export interface ErrorTextOptions {
  /** The sentence for a request that never got an answer (no ApiError). */
  offline?: string
  /** Screen-specific sentences by error code; a function receives the error. */
  codes?: Record<string, string | ((err: ApiError) => string)>
  /** Capitalise the server's message (default true); false shows it as sent. */
  capitalise?: boolean
}

/**
 * The text a screen shows for a failed call: the screen's sentence for a known
 * code, else the (translated) server message, else the offline sentence. Any
 * error that is not an ApiError counts as "the server could not be reached",
 * as isNetworkError does.
 */
export function errorText(err: unknown, opts: ErrorTextOptions = {}): string {
  if (!(err instanceof ApiError)) return opts.offline ?? t('The server could not be reached.')
  const custom = opts.codes?.[err.code]
  if (custom !== undefined) return typeof custom === 'function' ? custom(err) : custom
  if (opts.capitalise === false) return err.message
  return err.message.charAt(0).toUpperCase() + err.message.slice(1)
}

/** A server answer naming an input field: the field and its message without the field's prefix. */
export function fieldErrorOf(err: unknown): { field: string; message: string } | null {
  if (!(err instanceof ApiError) || !err.field) return null
  return { field: err.field, message: err.serverMessage.replace(new RegExp(`^${err.field}: `), '') }
}

/** The message of any thrown value, for errors raised in the browser (not by the server). */
export function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}
