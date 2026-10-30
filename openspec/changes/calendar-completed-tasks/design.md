# Design

## Context

See proposal.md for motivation. Day/Week, Month and Plan share `calendarTasks`, which currently drops every completed row. Their task snapshots already contain completed tasks, so no extra query or server work is needed. `dayLoad` and `planLoad` already exclude completed tasks; Plan's recurring-series selector also excludes them. Day/Week have separate renderers for the lane, timed blocks, overflow list and phone agenda; Plan uses the shared compact TaskRow.

## Goals / Non-Goals

Make one visibility choice apply consistently across every calendar renderer. Keep the default selection, due-zone conversion, ordering and capacity formulas. Avoid account preferences or any change to task data to express a device display choice.

## Decisions

1. **Device-local preference.** Store a boolean under `calendar.showCompleted` in the existing IndexedDB meta table, defaulting to false unless its value is exactly true. Expose its live read and write through `lib/liveData` and `lib/localData`. A separate key avoids coupling a visibility button to grid-hour settings or replacing other preferences in concurrent updates. A synced user preference would require an unnecessary op schema change.
2. **One selector and one button.** Add a default-false optional argument to `calendarTasks`, and pass the preference in Day/Week, Month and Plan. Put a shared `CalendarCompletedToggle` button beside the existing range actions from 1280 px; below that width put the same checked control in the existing More actions menu to avoid overflowing the header; use the UI Button primitive, `aria-pressed`, a check icon and the existing translated Show completed tasks label, constant in both states; the pressed/checked value conveys visibility. Keep the button's accessible action name visible. Render completed tasks against their due date in the viewer's zone, using the existing conversion before selection. Completion time is not a scheduling field.
3. **Presentation and inspection.** Apply line-through to titles only, retain readable time and estimate labels, use the existing dimmed block style and announce the existing `(completed)` message to assistive technology. Completed tasks can be selected and opened. Disable drag/resize, keyboard rescheduling/placement/estimate editing and duplicate completion in the calendar, including guards on fresh task reads before queued edits. Keep edit permission separate from eligibility for calendar scheduling in Month and Plan: only project permissions drive read-only announcements. Compact rows receive a drag handler only when scheduling is allowed. Details remain the ordinary place to change or reopen a task. Hiding a selected completed task must make it unavailable to calendar keyboard actions.
4. **Capacity and recurrence.** Reuse existing open-task capacity and recurring-series checks. Add regression coverage so toggling does not add completed estimates or unestimated counts or create new projected occurrences. Retain the planning list's existing open-task selection. Preserve Slots as their own checklist: their checked rows, counts and container actions stay governed by calendar-slots, while this preference controls standalone task rows and blocks. Slot capacity is unchanged by this preference. Preserve the optional meeting-aware capacity from upstream: counted meeting minutes remain in Day, Week and Month totals when completed rows are shown or hidden.
5. **Interface budget.** The wide-screen button fits the existing header action group and the narrow-screen control uses the existing overflow menu: no new chrome row or scroll region is introduced, task properties stay unchanged, there is no new sidebar destination or shortcut. Check the phone header at 360/390 px with and without subscribed calendars. Use the existing tokens and no new colours.
6. **Focused documentation.** Restore the upstream calendar guide, including its time-format examples, preferred week start and timed-then-priority ordering. Link to a separate completed-calendar guide instead of trimming established guidance to meet the 600-word limit.

## Data model and footprint

One local boolean in meta; no op fields, migrations, API routes, server changes or mandatory environment variables. All task edits still use ops. The preference works without a network connection and never syncs; existing synced task rows determine the view after convergence. No dependencies or new network calls. The expected production change is a small amount of calendar code with no new catalog keys; reuse Show completed tasks and remove the two superseded labels; the initial gzip budget stays unchanged. Binary/container growth is limited to the embedded web assets, with no new runtime services or meaningful server-memory cost. Measured against upstream `b5438326` using the same toolchain and build flags: entry gzip 320,574 → 321,048 bytes (+474); entry plus static imports 720,549 → 721,086 bytes (+537), within the existing upstream 314/705 KiB budgets. The stripped Linux amd64 binary is 35,659,936 bytes versus 35,651,744 bytes on main (+8,192 bytes). No budget increase in this feature. The focused guide's two WebP screenshots total about 49 KiB and load only when viewed.

## Risks / Trade-offs

- More finished tasks can crowd a day → reuse the existing overlap, overflow and month expansion controls, including strike-through in expanded rows.
- A stale selection or queued gesture could edit a hidden/completed task → derive keyboard availability from the visible order and check completion on fresh reads before writes.
- A new header action can wrap on phones → run the repository layout/accessibility checks and capture desktop/phone in both themes, including the subscribed-calendars toggle.
- The display is by due date, not completion date → document this explicitly; undated completed work remains in Completed.

## Migration Plan

Deploy as an ordinary client update; absent or invalid preference means off. No server or data migration. Rolling back leaves an unused local meta key and preserves all task data. Keep the change active for PR review; archive and merge delta specs after merge per CONTRIBUTING.md.
