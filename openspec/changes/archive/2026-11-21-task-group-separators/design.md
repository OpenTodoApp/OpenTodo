# Design

## Context

`GroupedList` receives ordered rows with depth for built-in and project lists. `ViewResults` serves the filters and saved views, where the saved-view renderer supplies nesting depth. `RowList` splits long lists into rendering blocks and the custom-field table bypasses that wrapper. `TaskRow` knows its shape and its depth but has no list context.

## Goals / Non-Goals

Use one boundary rule across the list renderers without coupling it to DOM siblings, rendering blocks, or the row's data model. The row may render the mark when its list requests one. Cards and other `TaskRow` consumers keep their existing appearance.

## Decisions

- Derive the boundary from the ordered visible rows of each section before rendering. Mark each top-level row after the first visible top-level group. Flat rows count as top-level when their parent is absent from that presentation. Skip transient completion clones and quick-add controls. Carry the result into the existing row render path and include it in any renderer cache key that could otherwise reuse a row with an old boundary. A CSS sibling selector would see rendering blocks and field-cell wrappers as list boundaries.
- Use a decorative mark on the existing row and the shared `--ot-border-soft` token. Use the row's existing 40 rem width threshold, with the phone and print rules keeping the decoration hidden. The line should span the task row without adding height or intercepting pointer input. Preserve the placement and appearance of focus, selection, and drag indicators.
- Derive the mark from local presentation data. The change works offline and makes no writes, so it adds no data model, sync, or migration work. It adds no chrome, task properties, sidebar destinations, scroll regions, or shortcuts.
- Use a single pass through each section's existing row sequence on changes to that sequence. No per-row measurement, extra scroll listener, dependency, or backend change. Expect a small CSS and JavaScript delta in the embedded web build. Measure gzip and binary impact against the same base at implementation time and keep the existing limits.

## Risks / Trade-offs

- The first row of a rendering block can follow a subtask from the previous block. Verify the line survives that split and that a subtask starting a block has no line.
- A dragged or selected row already has its own visual cues. Verify both the insertion cue and the resting hairline in the local demo, including compact density and dark and light themes.

## Size impact

Compared with upstream `bba7ff362` in the same Linux environment, the entry went from 136,052 to 136,226 bytes gzip (+174 bytes). The entry and its static imports went from 712,861 to 713,326 bytes gzip (+465 bytes). Both remain within the existing 148 KiB entry and 712 KiB initial budgets. The Linux server binary with the web app embedded remains 46,989,472 bytes.
