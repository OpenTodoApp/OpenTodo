# Proposal

## Why

A task row says too much. In the demo's Today view one row shows a priority-coloured circle, a coloured date ("Today 10:00" in green, overdue in red, "repeats" in violet), an estimate chip, a subtask count chip, a comment count chip, one or two coloured label chips and a project chip: up to seven items under the title, in five colours, most of them repeating what the view already says ("Today" in Today, the project inside the project, the label inside the label's view). The metadata language from `ux-overhaul` made every row the same; it did not make rows quiet. A list should read as titles with a few quiet facts, and colour should be left for what needs attention.

## What Changes

- **Context-aware metadata.** A row leaves out what its view or its group heading already implies: no "Today" in Today (the time stays), no date words under a date heading of Upcoming, no "evening" under This Evening, no "Someday" in the Someday view, no project chip inside that project or in the Inbox (already the case), no section or project on a project's board card, no chip for the label whose view is open. The rule is a table in the spec, one line per view.
- **Colour discipline.** The priority ring is coloured for P1 and P2 only; P3 and P4 get the neutral ring. The date is in the muted text colour, except overdue (danger) and a timed task due today (accent). "repeats" becomes a muted repeat icon with the word, the deadline keeps its hourglass in the muted colour and its warning and danger tones. Labels are one row of small colour dots followed by the first label's name and "+n" for the rest; the full names are read by assistive technology, shown in a tooltip on hover and focus, and in the panel as today. Every colour comes from the existing tokens.
- **Counts on demand.** Subtask progress, the comment count, the attachment count and the notes marker move out of the metadata line into a quiet trailing group at the end of the row, at low contrast until the row is hovered or holds focus, then at full contrast. They are never hidden: the text stays in the page and the spoken phrases ("1 of 3 subtasks completed", "3 comments") are unchanged.
- **A Calm / Detailed choice** beside Density in Settings → Appearance, synced like Density as an additive preference (`row_detail`: `calm` or `detailed`, unknown reads as `calm`). Calm is the default; Detailed restores today's row exactly (every chip, every colour, the counts in the line). Stories and visual baselines cover both.
- The row's layout, keyboard behaviour, 44 px touch targets, bulk selection, drag and drop, completion feedback and the board card's shape do not change. Nothing new is written for any of the rendering; the only write is the preference op.

Out of scope: the task panel, the sidebar, the board card beyond the badge rule above, the Today heading's own metadata, the `label` view's missing project chip (a separate question), new task fields, and a per-view override of the choice. No shortcut, route, API, dependency or environment variable is added. The op log gains one additive `user_prefs` field; not **BREAKING**.

Advances ROADMAP.md: the Design refresh (`design-language`, `ui-primitives`: one calm row built from the chip primitives), and the UX audit (UX-AUDIT.md rows B3, B6, B7, D4, J9, K6 and N2, which this change extends rather than repeats).

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `task-list-presentation`: "One row anatomy" gains the quiet trailing group for counts; "Metadata language" is rewritten for the Calm row (context rule table, colour rule, label dots, repeat and deadline as muted icon with text) with Detailed keeping the current language; a new requirement "Row detail preference" defines the choice and its default.
- `appearance-preferences`: a new requirement "Row detail preference" (synced additive preference, unknown reads as calm); "Appearance in Settings" lists the Calm / Detailed control beside Density.
- `labels`: "Assign and unassign labels" states how label chips appear on rows in Calm (dots and the first name, "+n", full names for assistive technology, on hover and focus, and in the panel) and in Detailed (one chip per label).

## Impact

- Web app: `web/src/app/TaskRow.tsx` (the row logic, the trailing group, the ring rule), `web/src/ui/Chips.tsx` (a `LabelDots` chip beside `LabelChip`), `web/src/lib/listGroups.ts` (what a group heading implies, as data on each row), `web/src/app/task-list/ListGroups.tsx` (the label view's label id), `web/src/lib/dates.ts` (`describeDue` also returns the time on its own), `web/src/lib/appearance.ts` and `AppearanceSection.tsx` (the preference, its hook and control), `web/src/lib/types.ts` and `web/src/lib/ops.ts` (the additive field), tests `taskRow.test.tsx`, `density.test.tsx`, `budget.test.tsx`, `listGroups.test.ts`, stories `taskRow.stories.tsx` and `board.stories.tsx` with new baselines under `web/src/ui/__screenshots__/`.
- Server: one line in the `user_prefs` schema of `internal/sync/ops.go` (`row_detail`, string). No route, no migration, no query change.
- Docs: `docs/settings-you.md` (Appearance), `docs/work-from-the-list.md` (what a row shows), `docs/labels-and-filters.md` (label dots), `docs/interface-guide.md` (Rows and chips), `UX-AUDIT.md` (three rows added under B), six catalogs under `web/src/locales/` for the new strings.
- Bundle: about +1.2 KB gzipped (the dots chip, the trailing group, the implied-metadata logic, one settings row). Binary and container image unchanged in size; runtime memory unchanged.
- No API, sync protocol or data-model impact beyond the additive preference field.
