# Proposal

## Why

The first run of the interface audit (OpenSpec change `ux-audit-three-widths`, 2026-10-22, 990 captures at 360, 768 and 1280 px, light and dark, English and German) found rule violations on the daily screens that need a design choice rather than a missing attribute: controls below their target size, controls painted over other controls, cut text with no way to read it whole, and focusable elements with no visible focus ring. They make the most-used screens slower or harder to use on a phone and with the keyboard. The ranked report (`findings.md`) is the evidence; each item below names its finding ids.

## What Changes

- **Target size (M7).** The row's completion circle (20 × 20 px with a fine pointer, next to the 22 px title button), the sidebar's expand chevrons and the row's collapse toggle (16 × 20 px), the account button in the sidebar footer, the bulk bar's checkboxes (16 px) and the facet chips of the task panel reach 24 px or keep 24 px of space at 1280 px, and 44 px at 360 and 768 px.
- **Overlap (M11).** The row's revealed actions (Schedule, Priority, More) no longer cover the title button they float over; the sidebar's expand chevron and its destination stop overlapping.
- **Truncation (M10).** Cut text that is not inside a control named by its content gets its full text: the row metadata's project name (`max-w-48`), the panel's facet values, the notification and Trash titles, the project page title, the Updates subtitle.
- **Focus (M8).** Every element listed in `scripts/ux-audit/focus-exempt.json` gets the token ring and leaves the list: the chart cells and bars of Statistics, the Day, Week, Month and Plan day cells, the timeline, the labels chip group, the subtask and title fields of the panel, the sidebar's resize handle, the workspace and archived-project rows.
- **Layout shift (M12).** The pages whose shift after load is above 0.1 (most of them at 360 px, from the late sidebar counts and the reminder toast) reserve their space.
- **German.** The findings marked "German only" by the audit.
- **The issue editor's disabled Test button** says why it is disabled in the dialog instead of a native `title` (`tooltip-lint-allow` in `IssueEditor.tsx`).

Out of scope: new screens, copy changes beyond the truncation fixes, and the rare screens (`screen-stories-rare`) and motion (`motion-polish`). ROADMAP: advances "Next: Design refresh" as the first fix step after the measurement step; no row is closed.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None: the rules are the `design-system` "Audited interface rules" this change makes the app meet; no requirement changes.

## Impact

`web/src/app` rows, sidebar, task panel, statistics and calendar components, `web/src/ui` facet and chip primitives, `scripts/ux-audit/focus-exempt.json` (emptied). No dependency, no op-log change, no new environment variable. Verified by `make ux-audit` with `UX_AUDIT_STRICT=1` and the workbench gate without exemptions.
