// The Vim command line's block of the `?` cheat sheet (vim-keybindings, design D6).
// The key bindings themselves are registry rows (web/src/lib/shortcuts.ts, scope
// `vim`), listed while the layer is on; this block adds the modes and the `:`
// commands from commands.ts, which are commands, not keys.
import type { HelpSection } from '../ShortcutHelp'
import { COMMANDS } from './commands'
import { t } from '../../lib/i18n'

export const VIM_HELP: HelpSection = {
  get title() { return t('Vim command line') },
  get note() { return t('Vim keybindings are on for this device (turn them off in Settings → General → Keyboard). The mode, NORMAL, INSERT or COMMAND, is shown at the bottom; a focused text field is Insert mode. All the usual shortcuts still work in Normal mode.') },
  mono: true,
  get rows() { return COMMANDS.map((c): [string, string] => [`:${c.name}${c.arg ? ` ${c.arg}` : ''}`, t(c.desc, { arg: c.arg ?? '' })]) },
}
