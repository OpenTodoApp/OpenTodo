import { useEffect } from 'react'

/** An extra block of the `?` overlay (the Vim layer supplies one while it is on). */
export interface HelpSection {
  title: string
  note?: string
  rows: [string, string][]
}

export function ShortcutHelp({ onClose, extraSections = [] }: { onClose: () => void; extraSections?: HelpSection[] }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  const rows: [string, string][] = [
    ['q', 'Quick add a task'],
    ['j / k', 'Move selection down / up'],
    ['Enter', 'Open selected task; accept "complete parent too?"'],
    ['c', 'Complete / reopen selected task (and its subtasks)'],
    ['a', 'Add a subtask to the selected task'],
    ['Shift+A', 'Assign the selected task (type to find a member, Enter assigns)'],
    ['Tab / Shift+Tab', 'Indent under previous sibling / outdent'],
    ['Alt+↑ / Alt+↓', 'Move the selected task, or the focused sidebar project, one place within its list (it stays selected)'],
    ['Alt+Shift+↑ / Alt+Shift+↓', 'Move it to the top / bottom of its list'],
    ['Drag (touch: press and hold)', 'Reorder tasks in project lists, boards and the Inbox, and projects in the sidebar; drop on the middle of a row to nest it; Esc cancels'],
    ['Today, Upcoming, Assigned, Completed, labels, filters', 'Sorted by date (or their own rule): no drag or Alt moves there'],
    ['← / →', 'Collapse / expand subtasks of the selected task, or sub-projects of the focused sidebar project'],
    ['m', 'Move the current project under another project or to the top level'],
    ['v', 'Toggle the current project between list and board (remembered per project on this device)'],
    ['h / l, ← / → (board)', 'Select the first task of the previous / next column; j / k move within a column'],
    ['Shift+← / Shift+→ (board)', 'Move the selected task to the previous / next column (it stays selected)'],
    ['a (board)', 'Add a task to the selected task’s column'],
    ['Shift+S', 'Share the current project: add members by email, change roles, remove, leave, transfer'],
    ['1 – 4', 'Set priority of selected task'],
    ['L', 'Labels of selected task (type to find, Enter adds or creates)'],
    ['e', 'Edit the estimate of the selected task (type 20, 45m, 1h30; Enter)'],
    ['s', 'Schedule the selected task: Day view in placement mode'],
    ['Shift+S', 'Skip the current occurrence of a recurring task'],
    ['Shift+O', 'Recurring task: this occurrence only (standalone copy, series moves on)'],
    ['Delete', 'Delete selected task (and its subtasks)'],
    ['g then i / t / u / c / l / f / v / s', 'Go to Inbox / Today / Upcoming / Completed / Labels / Filter / Views / Settings'],
    ['g then a', 'Go to Assigned to me'],
    ['g then x', 'Go to the Trash'],
    ['j / k, r, Delete (in the Trash)', 'Select, restore, delete permanently (Enter confirms, Esc cancels)'],
    ['Enter (after completing the last task of a project)', 'Archive the project; any other key dismisses'],
    ['g then Shift+I', 'Go to Settings → Import data'],
    ['g then d / w', 'Go to the Day / Week calendar'],
    ['j / k (calendar)', 'Select the next / previous task (lane, then blocks)'],
    ['↑ / ↓ (calendar)', 'Move the selected task 15 minutes (a lane task gets a time)'],
    ['← / → (calendar)', 'Move the selected task one day'],
    ['Shift+↑ / Shift+↓ (calendar)', 'Shorten / lengthen the estimate by 15 minutes'],
    ['u / p (calendar)', 'Unschedule (keep the date) / placement mode for the selected task'],
    ['Enter / Esc (placing)', 'Place the task at the ghost / cancel without changes'],
    ['[ / ] / t (calendar)', 'Previous / next day or week, back to today'],
    ['Enter / Esc (in Filter)', 'Jump from the query to the first result / back to the query'],
    ['s (in Filter results)', 'Save the query as a view, pinned to the sidebar'],
    ['/ (in a saved view)', 'Edit the query; Enter saves it, Esc discards'],
    ['Tab / Shift+Tab (on a dashboard)', 'Move between panels; j / k inside a panel, Enter opens, o opens the view'],
    ['↑ / ↓ (in the filter query)', 'Recall recent queries on this device'],
    ['Enter (on an invitation)', 'Settings → Members: copy the invite link created in this session'],
    ['Delete (on an invitation)', 'Settings → Members: revoke a pending invitation'],
    ['d / r / Delete (on a user)', 'Settings → Users: deactivate or reactivate, create a reset link, delete (each confirms)'],
    ['g then s, Tab', 'Settings → Security: add, rename (Enter saves, Esc cancels) or delete passkeys'],
    ['Shift+C', 'Comment on the open task: focus the composer (markdown; @ completes members, ↑ / ↓ and Enter pick)'],
    ['Ctrl+Enter / ⌘+Enter (in a comment)', 'Post the comment, reply or edit; Esc cancels or leaves the field'],
    ['Tab, Enter (in the comment thread)', 'Reach Reply, Edit and Delete on a comment; Load older activity at the end'],
    ['Shift+H (in a project)', 'Show or hide the project activity; Tab reaches the person and kind filters'],
    ['z (task panel open)', 'Fix a timed due to your time zone, or release it to a floating time'],
    ['Esc', 'Close panel, clear selection'],
    ['?', 'Toggle this help'],
  ]
  const quickAdd: [string, string][] = [
    ['tomorrow · next Wed · 3 Feb · at 3pm', 'Due date and time (6 languages)'],
    ['#project @label p1 +30m', 'Project, label, priority, estimate'],
    ['"quoted text"', 'Keep text literally'],
    ['Backspace ×2 (end of line)', 'Highlight, then dismiss the last chip'],
  ]
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="max-h-full w-full max-w-md overflow-y-auto rounded-xl bg-white p-5 shadow-xl dark:bg-slate-900" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-3 text-base font-semibold">Keyboard shortcuts</h2>
        <table className="w-full text-sm">
          <tbody>
            {rows.map(([k, d]) => (
              <tr key={k} className="border-t border-slate-100 dark:border-slate-800">
                <td className="py-1.5 pr-4"><span className="kbd">{k}</span></td>
                <td className="py-1.5 text-slate-600 dark:text-slate-300">{d}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {extraSections.map((sec) => (
          <section key={sec.title} data-help-section={sec.title}>
            <h3 className="mb-1 mt-4 text-sm font-semibold">{sec.title}</h3>
            {sec.note && <p className="mb-2 text-xs text-slate-500">{sec.note}</p>}
            <table className="w-full text-sm">
              <tbody>
                {sec.rows.map(([k, d]) => (
                  <tr key={k} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="py-1.5 pr-4"><span className="kbd">{k}</span></td>
                    <td className="py-1.5 text-slate-600 dark:text-slate-300">{d}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))}
        {extraSections.length === 0 && (
          <p className="mt-3 text-xs text-slate-500" data-vim-hint>Prefer modal editing? Vim keybindings can be enabled in Settings → Keyboard.</p>
        )}
        <h3 className="mb-2 mt-4 text-sm font-semibold">Quick add syntax</h3>
        <table className="w-full text-sm">
          <tbody>
            {quickAdd.map(([k, d]) => (
              <tr key={k} className="border-t border-slate-100 dark:border-slate-800">
                <td className="py-1.5 pr-4"><code className="text-xs">{k}</code></td>
                <td className="py-1.5 text-slate-600 dark:text-slate-300">{d}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <a className="mt-2 block text-xs text-slate-500 underline" href="https://github.com/pixari/opentodo/blob/main/docs/quick-add.md" target="_blank" rel="noreferrer">
          Full syntax reference (docs/quick-add.md)
        </a>
        <button className="btn-ghost mt-4 w-full" onClick={onClose}>Close</button>
      </div>
    </div>
  )
}
