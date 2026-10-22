# Proposal

## Why

The interface audit of 21 October found that OpenTodo spends no expression on the three moments that decide whether an app feels alive: the first ten minutes, capturing a task, and finishing the day. A new account meets an empty Inbox and a start guide that explains instead of showing; the only illustration is Inbox zero; Close the day ends by silently returning to Today; and capture is split between a thin line under the header and a palette that cannot add. Things, Todoist and Linear are praised for exactly these moments. This change gives them one calm, consistent treatment without adding chrome.

## What Changes

- **An illustration set.** Five more calm line illustrations in the Inbox zero style (an empty Today, an empty Upcoming, a new empty project, Done for today, the empty Trash), each a brief in the design, drawn only from tokens, checked by the existing `make ui-lint` rules, and shown in the workbench in both themes.
- **Sample tasks instead of a sample project.** The start guide's first step offers "Start with three sample tasks": three Inbox tasks that demonstrate the panel, a date with an estimate, and a subtask, marked with an additive `sample` task field so they never count in Statistics, the Loop pulse or the weekly digest, and removed as one batch with Undo from a "Remove sample tasks" action. The six-task "Show me around" project is removed (replaced).
- **A first-day checklist.** Three steps to first value (add a task, plan today, get OpenTodo on another device), shown as the start guide's last view and reachable from a quiet "Start guide" entry in the sidebar's More group until every step is done or the user hides it; completion is read from local data, the hide is an ordinary preference op.
- **Done for today.** Closing the day shows one calm final state on the Close the day screen (the day's count, the illustration, the line for tomorrow, "Back to Today", "Reopen the day") instead of returning to Today at once. No streak, no score, no nagging.
- **One command bar.** `Ctrl`/`⌘`+`K` opens one floating bar with four modes: Search (default), Add (`+` prefix, the Add segment, or `q` on screens without a quick add), Commands (`>`) and Ask (`?`, only when the assistant is available). Add mode is the quick add with the parsed tokens highlighted inline in the field and the chips row under it as the explanation; Search mode always ends with "Add as a task" so capture is never more than one keystroke away. The quick-add line in lists stays.
- **Inline token highlighting** in every quick add (the bar and the list line): recognised spans are tinted in the field itself, the chips stay as the explanation, and dismissing a chip removes the tint.
- **The undo toast as a primitive.** One toast style for every single action and batch: content, position, durations, pause on hover and focus, keyboard reach, replacement, reduced motion, and the rule that it never covers the focused element (WCAG 2.2, 2.4.11).

Out of scope: a new sidebar destination (the More entry is not a primary destination), gamified streaks or scores, illustrations for settings and error pages, animated illustrations (motion-v2 owns motion; this change forbids animation under reduced motion only), changes to the quick-add grammar, the Ask screen and the assistant panel themselves, and the look of the toast beyond its content and behaviour (tokens-v2 and motion-v2).

ROADMAP: advances "Next: Design refresh" as a new row, "Moments and onboarding", added when it ships. No new environment variable; the op log gains one additive task field (`sample`) and one additive preference (`start_checklist`); no breaking change.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `first-run`: the sample project becomes sample tasks with a marker and a one-batch removal; a first-day checklist with its sidebar entry and its hide preference.
- `design-system`: the named illustration set and its briefs; the toast primitive (content, position, duration, focus and "never covers the focused element").
- `statistics`: sample tasks are excluded rows.
- `email-digest`: sample tasks never reach the digest.
- `weekly-review`: the Done for today state at the end of Close the day.
- `command-palette`: the bar's four modes and prefixes, "Add as a task" at the end of Search, `q` opens the bar in Add mode where no quick add exists.
- `natural-language-capture`: inline highlighting of parsed tokens in the field, with the chips kept as the explanation.
- `in-app-assistant`: Ask mode of the command bar hands the text to the assistant panel.

## Impact

- Web: `web/src/ui/illustrations/` (five files), `web/src/ui/overlay/Toasts.tsx` and `web/src/app/bulk/UndoToast.tsx` (the primitive), `web/src/app/FirstRun.tsx` and `web/src/lib/startGuide.ts` (sample tasks, checklist), `web/src/app/Sidebar.tsx` (the More entry), `web/src/app/review/CloseDay.tsx` (Done for today), `web/src/app/palette/CommandPalette.tsx` (modes), `web/src/app/QuickAdd.tsx` (highlight layer), `web/src/lib/types.ts`, `web/src/lib/ops.ts`, `web/src/lib/userPrefs.ts`, the statistics and Loop pulse predicates in `web/src/lib`.
- Server: `internal/sync/ops.go` Schema (`task.sample`, `user_prefs.start_checklist`), `internal/digest` (excluded rows), the shared statistics fixture.
- Docs: `docs/your-first-task.md`, `docs/quick-add.md`, `docs/search.md`, `docs/method/rhythms.md`, `docs/statistics.md`, `docs/design-system.md` (illustration briefs).
- Size: about 18 KB of raw SVG across the five illustrations (about 5 KB gzipped) in the main bundle; the bar's Add and Ask modes reuse the quick add and the assistant launcher already in the main bundle; the palette stays a lazy chunk. No new dependency. Binary unchanged beyond the web build.
