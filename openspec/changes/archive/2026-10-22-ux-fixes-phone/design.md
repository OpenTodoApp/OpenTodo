# Design

## Context

The interface audit (`make ux-audit`, change `ux-audit-three-widths`) reports rule findings on the daily screens (`findings.md`). A rerun of the core screens on main before this change (57 screens, 360, 768 and 1280 px, light, English and German) gave M11 523, M7 422, M10 95, M8 45 and M12 28. Most findings come from a few shared building blocks: the task row, the sidebar's project tree and group header, the phone bar and the list page. So the fixes go into those blocks and the primitives under `web/src/ui`, not into each screen.

Three facts found while measuring shape the approach:

- **Rings cancelled by Tailwind 4.** `outline-none` sets `--tw-outline-style: none`, and `focus-visible:outline-2` reads that variable. So 18 elements that declare `outline-none focus-visible:outline-2 … outline-focus` never show their ring. This is most of the M8 list (calendar grid, month and Plan day cells, statistics cells, the timeline, the labels chip group, list rows such as the workspace and archived-project rows).
- **M11 compares across layers.** M11 compared every pair of visible controls, so an open menu, sheet or list of options "overlapped" the page under it. About two thirds of the M11 findings were that.
- **M12 named nothing.** M12 reported only "page". The moved elements had to be logged before the causes were visible: a list page that fills in stages, a phone bar that grows when the project's members arrive, and statistics panels drawn before their data.

## Goals / Non-Goals

**Goals:**
- **Shared blocks:** fix the findings of the shared blocks so that every screen using them improves at once.
- **No exemptions:** empty `scripts/ux-audit/focus-exempt.json`, so the workbench focus pass runs without exemptions.
- **Lint:** stop cancelled rings from coming back.
- **Measures:** make M11 and M12 report what a person would see.

**Non-Goals:**
- **Strict mode:** turning `UX_AUDIT_STRICT` on in CI. That waits for the timings of `ux-audit-three-widths` 6.2.
- **Calendar and secondary controls:** calendar block sizes in Day, Week, Month and Plan; inline buttons in running text (the activity feed); the facet chips of the panel. These are listed under Risks as remaining findings.
- **Overlaps between controls of one overlay:** for example Help and Close in a sheet header at 360 px.

## Decisions

### D1. Target size on a fine pointer: larger boxes, same picture
**Owner question:** keep M7's 24 px gap rule, which is stricter than WCAG 2.2's 24 px circle.

The offenders get boxes of at least 24 × 24 px on a fine pointer. The size the user sees stays the same:
- **Completion circle** (row and panel): the button is 24 px with `-m-0.5` around the 20 px circle, so the slot and the row do not change.
- **Title button:** it gets `py-px -my-px`, so a one-line title is 24 px tall and the row's height is unchanged.
- **Collapse and expand chevrons** (row and sidebar): 24 × 24 px with negative margins inside their 16 px slots. Only the hover background grows, by 4 px.
- **Sidebar group-header actions** (All, Find, the Add menu): `inline-flex min-h-6 min-w-6`, shared as `SIDEBAR_GROUP_ACTION`. The header row is already 24 px tall.
- **Selection box:** its label covers 24 px (`-inset-0.5`).
- **Project header:** the members button and the Public badge are 24 px tall.
- **Quick-add suggestions:** 44 px tall on touch.

**Alternative considered:** a pseudo-element hit area. It keeps the box small, which the audit measures, and makes the hit area invisible to tests.

### D2. Cut text keeps its full text: `TruncatedText`
**Owner question:** how cut text should show its full text.

A new primitive, `web/src/ui/TruncatedText.tsx`, renders the text cut with an ellipsis and measures it with a ResizeObserver. While the text is cut:
- it is wrapped in the shared Tooltip (hover after 400 ms, keyboard focus at once);
- it joins the Tab order with the token ring.

While the text fits, it is a plain element with no tip and no tab stop. The Tooltip gains a `disabled` prop for this, so the element is never remounted. On touch the Tooltip does not open; the element's text stays its whole text for a screen reader.

It replaces cut text in:
- the row's project name;
- the page title (desktop header and phone bar, when it is a string) and the phone bar's subtitle;
- the Trash titles;
- the share dialog's member lines;
- the Week day headers;
- the field column cells;
- the account email in Settings.

Where the cut text is a control named by its content (the Inbox's planned line, a project's Rename button), the control cuts itself; it is announced in full and opens what it names. Short labels in Loop home's pulse tiles wrap instead of being cut, which matters in German.

**Alternatives considered:**
- **Wrapping everywhere:** this changes the height of rows and of the phone bar (see D5).
- **A native `title`:** the lint forbids it.

### D3. Focus rings: one fix, one lint
Every class list with `outline-none` and `focus-visible:outline-N` gets `focus-visible:outline-solid` (18 places). A new style lint, `cancelledRings` in `web/src/ui/tokens/styleLint.ts`, fails on the combination.

Three fields had no ring at all:
- **Panel title and Add subtask:** they get the field ring (`ring-2 ring-focus/30`, as the notes field).
- **Sidebar resize handle:** it gets an outline in place of `outline-none`.

### D4. Overlaps
- **Row actions over the title** (fine pointer from 768 px): the row's trailing group keeps the width of Schedule, Priority and More (7 rem) whenever the row can reveal them, so they never cover the open control. Revealing them still moves nothing, as "Revealed row actions" requires. Long titles are cut 7 rem earlier on such rows.
- **Chevrons on touch:** the sidebar's chevron slot widens to 36 px, and the All projects page's to 44 px. The 44 px chevron then reaches at most 4 px under its destination, and the project tree's names start 20 px further right on touch.
- **The measure:** M11 compares only controls of the same layer: the page, or one menu, dialog, sheet, list of options or tooltip. A control under an open overlay is covered, not visible, as the rule's wording ("visible interactive controls") says.

### D5. Layout shift
M12 now records the elements that moved and their share, and names the top three.

- **List pages** (Inbox, Today, projects, labels, places…) show nothing until their tasks are read, and a project page also waits for its project. Before, the header, the quick add and then the tasks arrived one after another.
- **Project header:** the meta row is one 24 px flex row from the start, so members arriving later do not move it.
- **Phone bar:** its subtitle stays on one line. On a project the subtitle is plain text ("2 · owner · Public"); members and public links open from Share in the project menu, which phone-v2 already put there. With 44 px buttons in the bar, it grew when the membership arrived.
- **Statistics** waits for the tasks and the device's date changes before drawing its panels.

### D6. The issue editor's Test button
While the connection is not saved, the dialog shows "Save the connection first, then test it." beside the disabled button and names it as the button's description. The native `title` and its `tooltip-lint-allow` marker go.

## Risks / Trade-offs

- [The row's 7 rem reservation cuts long titles earlier on desktop.] → Rows already carry the project name or counts there in most views; the cost lands only on long titles without trailing items.
- [`TruncatedText` adds a tab stop to each cut item (a row's project name).] → Only while the text is cut, and only for keyboard users who want to read it; `j`/`k` row navigation is unchanged.
- [Gating the list hides content until the tasks are read.] → The read is from the local database (tens of milliseconds). The page was already empty before the read; it now stays empty instead of showing the header first.
- **Remaining findings, for a later change:**
  - **M7:** calendar blocks under 24 px on a fine pointer, inline text buttons in the activity feed, Learn more links, view-row menus.
  - **M11:** overlaps inside one sheet (Help and Close, panel tabs and the composer at 360 px); the row chevron and the completion circle on touch.
  - **M12:** Plan at 360 px, where the grid preferences arrive after the first paint; the Feed; the All projects page (a 4 px bar flicker).

  The rerun's figures are in the implementation notes of `tasks.md`.

## Migration Plan

Interface only. No data, op-log or setting changes; the visual baselines of the touched screens are regenerated. Rollback is a revert.
