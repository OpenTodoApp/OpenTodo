// The keyboard shortcuts (OpenSpec change `user-documentation`, design D9): one
// table for the `?` overlay (ShortcutHelp) and the keyboard guide, which
// `make docs` writes into docs/keyboard.md, so the two never disagree. Add a
// shortcut here, run `make docs`, and both list it.

export type ShortcutSection = 'everywhere' | 'go' | 'tasks' | 'board' | 'calendar' | 'filter' | 'trash' | 'comments' | 'settings'

/** One row: the keys as shown (a context such as "(board)" in parentheses), what they do, and the guide section. */
export interface Shortcut {
  keys: string
  description: string
  section: ShortcutSection
}

/** Section titles of the keyboard guide, in order. */
export const SHORTCUT_SECTIONS: { id: ShortcutSection; title: string }[] = [
  { id: 'everywhere', title: 'Everywhere' },
  { id: 'go', title: 'Go to a view' },
  { id: 'tasks', title: 'Tasks in a list' },
  { id: 'board', title: 'Board' },
  { id: 'calendar', title: 'Day and Week calendar' },
  { id: 'filter', title: 'Filter, saved views and dashboards' },
  { id: 'trash', title: 'Trash and projects' },
  { id: 'comments', title: 'Comments and notes' },
  { id: 'settings', title: 'Settings' },
]

/** Every shortcut, in the order the overlay lists them. */
export const SHORTCUTS: Shortcut[] = [
  { keys: 'q', description: 'Quick add a task', section: 'everywhere' },
  { keys: 'Shift+I', description: 'Open the assistant (when the server owner has turned it on): ask about your tasks, review proposed changes; Enter sends, Esc closes', section: 'everywhere' },
  { keys: 'Enter / Esc (proposed changes)', description: 'Assistant: apply the checked changes / discard the proposal; Space toggles an item', section: 'everywhere' },
  { keys: 'Shift+V', description: 'Dictate into quick add (turn voice capture on in Settings first); Esc or a pause stops, Enter saves', section: 'everywhere' },
  { keys: 'j / k', description: 'Move selection down / up', section: 'tasks' },
  { keys: 'Enter', description: 'Open selected task; accept "complete parent too?"', section: 'tasks' },
  { keys: 'c', description: 'Complete / reopen selected task (and its subtasks)', section: 'tasks' },
  { keys: 'a', description: 'Add a subtask to the selected task', section: 'tasks' },
  { keys: 'Shift+A', description: 'Assign the selected task (type to find a member, Enter assigns)', section: 'tasks' },
  { keys: 'Tab / Shift+Tab', description: 'Indent under previous sibling / outdent', section: 'tasks' },
  { keys: 'Alt+↑ / Alt+↓', description: 'Move the selected task, or the focused sidebar project, one place within its list (it stays selected)', section: 'tasks' },
  { keys: 'Alt+Shift+↑ / Alt+Shift+↓', description: 'Move it to the top / bottom of its list', section: 'tasks' },
  { keys: 'Drag (touch: press and hold)', description: 'Reorder tasks in project lists, boards and the Inbox, and projects in the sidebar; drop on the middle of a row to nest it; Esc cancels', section: 'tasks' },
  { keys: 'Today, Upcoming, Assigned, Completed, labels, filters', description: 'Sorted by date (or their own rule): no drag or Alt moves there', section: 'tasks' },
  { keys: '← / →', description: 'Collapse / expand subtasks of the selected task, or sub-projects of the focused sidebar project', section: 'tasks' },
  { keys: 'm', description: 'Move the current project under another project or to the top level', section: 'trash' },
  { keys: 'v', description: 'Toggle the current project between list and board (remembered per project on this device)', section: 'tasks' },
  { keys: 'h / l, ← / → (board)', description: 'Select the first task of the previous / next column; j / k move within a column', section: 'board' },
  { keys: 'Shift+← / Shift+→ (board)', description: 'Move the selected task to the previous / next column (it stays selected)', section: 'board' },
  { keys: 'a (board)', description: 'Add a task to the selected task’s column', section: 'board' },
  { keys: 'Shift+S', description: 'Share the current project: add members by email, change roles, remove, leave, transfer', section: 'tasks' },
  { keys: '. / Shift+F10 / Menu key', description: 'Open the menu of the focused row: a label, view, section heading or project', section: 'everywhere' },
  { keys: 'F2 (focused label)', description: 'Rename the label in place; Alt+↑ / Alt+↓ move it, Alt+Shift+↑ / ↓ to the top / bottom', section: 'everywhere' },
  { keys: '1 – 4', description: 'Set priority of selected task', section: 'tasks' },
  { keys: 'L', description: 'Labels of selected task (type to find, Enter adds or creates)', section: 'tasks' },
  { keys: 'e', description: 'Edit the estimate of the selected task (type 20, 45m, 1h30; Enter)', section: 'tasks' },
  { keys: 'd', description: 'Set the deadline of the selected task (type fri, 2026-11-06; Enter)', section: 'tasks' },
  { keys: 's', description: 'Schedule the selected task: Day view in placement mode', section: 'tasks' },
  { keys: 'Shift+S', description: 'Skip the current occurrence of a recurring task', section: 'tasks' },
  { keys: 'Shift+O', description: 'Recurring task: this occurrence only (standalone copy, series moves on)', section: 'tasks' },
  { keys: 'Delete', description: 'Delete selected task (and its subtasks)', section: 'tasks' },
  { keys: 'g then i / t / u / c / l / f / v / s', description: 'Go to Inbox / Today / Upcoming / Completed / Labels / Filter / Views / Settings', section: 'go' },
  { keys: 'g then a', description: 'Go to Assigned to me', section: 'go' },
  { keys: 'g then x', description: 'Go to the Trash', section: 'go' },
  { keys: 'g then k', description: 'Go to Ask: the assistant’s composer and skills (when the assistant is on)', section: 'go' },
  { keys: 'g then h', description: 'Go to Activity: what changed in your shared projects (j / k select, Enter opens the task, Tab reaches the filters)', section: 'go' },
  { keys: 'j / k, r, Delete (in the Trash)', description: 'Select, restore, delete permanently (Enter confirms, Esc cancels)', section: 'trash' },
  { keys: 'Enter (after completing the last task of a project)', description: 'Archive the project; any other key dismisses', section: 'trash' },
  { keys: 'g then Shift+I', description: 'Go to Settings → Data → Import data', section: 'go' },
  { keys: 'g then d / w', description: 'Go to the Day / Week calendar', section: 'go' },
  { keys: 'g then ?', description: 'Open Help: the user guide, offline, with search', section: 'go' },
  { keys: 'j / k (calendar)', description: 'Select the next / previous task (lane, then blocks)', section: 'calendar' },
  { keys: '↑ / ↓ (calendar)', description: 'Move the selected task 15 minutes (a lane task gets a time)', section: 'calendar' },
  { keys: '← / → (calendar)', description: 'Move the selected task one day', section: 'calendar' },
  { keys: 'Shift+↑ / Shift+↓ (calendar)', description: 'Shorten / lengthen the estimate by 15 minutes', section: 'calendar' },
  { keys: 'u / p (calendar)', description: 'Unschedule (keep the date) / placement mode for the selected task', section: 'calendar' },
  { keys: 'Enter / Esc (placing)', description: 'Place the task at the ghost / cancel without changes', section: 'calendar' },
  { keys: '[ / ] / t (calendar)', description: 'Previous / next day or week, back to today', section: 'calendar' },
  { keys: 'Enter / Esc (in Filter)', description: 'Jump from the query to the first result / back to the query', section: 'filter' },
  { keys: 's (in Filter results)', description: 'Save the query as a view, pinned to the sidebar', section: 'filter' },
  { keys: '/ (in a saved view)', description: 'Edit the query; Enter saves it, Esc discards', section: 'filter' },
  { keys: 'Tab / Shift+Tab (on a dashboard)', description: 'Move between panels; j / k inside a panel, Enter opens, o opens the view', section: 'filter' },
  { keys: '↑ / ↓ (in the filter query)', description: 'Recall recent queries on this device', section: 'filter' },
  { keys: 'Enter (on an invitation)', description: 'Settings → Administration → Members: copy the invite link created in this session', section: 'settings' },
  { keys: 'Delete (on an invitation)', description: 'Settings → Administration → Members: revoke a pending invitation', section: 'settings' },
  { keys: 'd / r / Delete (on a user)', description: 'Settings → Administration → Users: deactivate or reactivate, create a reset link, delete (each confirms)', section: 'settings' },
  { keys: 'Tab (in Settings → Security)', description: 'Passkeys: add, rename (Enter saves, Esc cancels) or remove passkeys', section: 'settings' },
  { keys: 'Shift+C', description: 'Comment on the open task: switch to the Comments tab and focus the composer (markdown; @ completes members, ↑ / ↓ and Enter pick)', section: 'comments' },
  { keys: 'Ctrl+Enter / ⌘+Enter (in a comment)', description: 'Post the comment, reply or edit; Esc cancels or leaves the field', section: 'comments' },
  { keys: 'Tab, Enter (in the comment thread)', description: 'In the Comments tab: reach Reply, Edit and Delete; in the Activity tab: expand a group or load older activity', section: 'comments' },
  { keys: '← / → (on the task tabs)', description: 'Switch between Comments, Activity and History in the task panel', section: 'comments' },
  { keys: 'Shift+H (in a project)', description: 'Show or hide the project activity; Tab reaches the person and kind filters', section: 'comments' },
  { keys: 'z (task panel open)', description: 'Fix a timed due to your time zone, or release it to a floating time', section: 'tasks' },
  { keys: 'Ctrl/⌘+B, I, Shift+X, E, K (in the notes)', description: 'Bold, italic, strikethrough, inline code, link', section: 'comments' },
  { keys: 'Ctrl/⌘+Alt+1–3 / 0 (in the notes)', description: 'Heading 1–3 / normal text', section: 'comments' },
  { keys: 'Ctrl/⌘+Shift+8 / 7 / 9 (in the notes)', description: 'Bullet, numbered, check list; Ctrl/⌘+Enter ticks a check item; Tab / Shift+Tab indent', section: 'comments' },
  { keys: '- · 1. · # · [ ] · **x** (typed in the notes)', description: 'Markdown typing becomes formatting; Shift+Enter is a line break, Esc leaves the notes', section: 'comments' },
  { keys: 'Esc', description: 'Close panel, clear selection', section: 'everywhere' },
  { keys: '?', description: 'Toggle this help', section: 'everywhere' },
]

/** Quick add syntax shown at the end of the overlay and the guide. */
export const QUICK_ADD_SYNTAX: [string, string][] = [
  ['tomorrow · next Wed · 3 Feb · at 3pm', 'Due date and time (6 languages)'],
  ['#project @label p1 +30m', 'Project, label, priority, estimate'],
  ['"quoted text"', 'Keep text literally'],
  ['Backspace ×2 (end of line)', 'Highlight, then dismiss the last chip'],
]
