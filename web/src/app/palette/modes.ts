// The command bar's modes (OpenSpec change moments-and-onboarding, design D7;
// command-palette "Open and close the palette"): Search (default), Add, Commands and,
// only when the assistant is available, Ask. Pure rules for the prefixes: `+`, `>` and
// `?` typed as the first character of an empty field switch mode and are removed; the
// same prefix typed again into the empty field of its mode returns to Search with the
// character kept, so a search for text starting with it stays possible.
import { msg, translatedMap } from '../../lib/i18n'

export type BarMode = 'search' | 'add' | 'commands' | 'ask'

export const PREFIX_OF: Record<Exclude<BarMode, 'search'>, string> = { add: '+', commands: '>', ask: '?' }

export const MODE_LABEL = translatedMap<BarMode>({ search: msg('Search'), add: msg('Add'), commands: msg('Commands'), ask: msg('Ask') })

/** The modes offered: Ask only when the assistant is available to the user. */
export function barModes(askAvailable: boolean): BarMode[] {
  return askAvailable ? ['search', 'add', 'commands', 'ask'] : ['search', 'add', 'commands']
}

/**
 * What a change of the field's text does: `{ mode, text }` when it switches the mode
 * (with the text the field then holds), or null when it is ordinary typing.
 */
export function prefixSwitch(mode: BarMode, before: string, after: string, askAvailable: boolean): { mode: BarMode; text: string } | null {
  if (before !== '' || after.length !== 1) return null
  if (mode !== 'search') return PREFIX_OF[mode] === after ? { mode: 'search', text: after } : null
  const target = (Object.keys(PREFIX_OF) as Exclude<BarMode, 'search'>[]).find((m) => PREFIX_OF[m] === after)
  if (!target || !barModes(askAvailable).includes(target)) return null
  return { mode: target, text: '' }
}
