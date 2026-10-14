// The Vim section of the `?` overlay (vim-keybindings, design D6). Keep it in step
// with dispatch.ts and the command table in commands.ts.
import type { HelpSection } from '../ShortcutHelp'
import { COMMANDS } from './commands'

export const VIM_HELP: HelpSection = {
  title: 'Vim keybindings',
  note: 'On for this device; turn off in Settings → Preferences → Keyboard. All shortcuts above still work in Normal mode.',
  rows: [
    ['NORMAL / INSERT / COMMAND', 'Mode shown at the bottom; a focused text field is Insert mode'],
    ['3j, 5k, 2↓', 'Count: move the selection that many tasks (clamped)'],
    ['gg / G', 'Select the first / last task; 4gg or 4G selects the fourth'],
    ['g then i / t / u / …', 'Unchanged: go to a view (gg is the only new g sequence)'],
    ['J / K', 'Move the selected task down / up one place (with a count, that many; manually ordered views only)'],
    ['dd', 'Delete the selected task (d alone does nothing after 1 s)'],
    ['x', 'Complete / reopen the selected task (same as c)'],
    ['o', 'Quick add; in project lists and the Inbox the new task lands after the selection'],
    ['i', 'Open the selected task and edit its title (Insert mode)'],
    ['a', 'Unchanged: add a subtask (which also enters Insert mode)'],
    ['1 – 4', 'Priority, applied after 1 s or at the next key (a digit followed by a motion is a count)'],
    ['Esc (in a field)', 'Leave the field and return to Normal mode; the text is kept, the panel stays open'],
    ['Esc (Normal mode)', 'Unchanged: close panel, clear selection'],
    [':', 'Open the command line (Tab completes, Enter runs, Esc cancels)'],
    ...COMMANDS.map((c): [string, string] => [`:${c.name}${c.arg ? ` ${c.arg}` : ''}`, c.desc]),
  ],
}
