# Tasks

## 1. Compute list boundaries

- [x] 1.1 Apply the same visible-group rule to the main list and filter result renderers. Cover flat, nested and collapsed rows, section resets, completion and reorder, and a parent group crossing a rendering-block boundary in focused tests. Verify the custom-field table still uses the same task-row rule.

## 2. Draw the separator

- [x] 2.1 Add the shared decorative hairline at the existing wide-row breakpoint. Verify One line and Detailed, light and dark, narrow panes on desktop, phone widths, and drag and focus cues in the browser. Confirm cards and print keep their existing appearance.
- [x] 2.2 Update `docs/row-layouts.md` and refresh affected visual baselines with `make ui-baselines`. Verify the intended changes in the before and after images with `make ui-check`.

## 3. Verify the complete change

- [x] 3.1 Run `make openspec-validate`, `make docs` and `make docs-check`, web `npm test` and `npm run build`, `make check`, and `make bundle-budget`. Record the gzip and embedded binary deltas against the base build in the design.
- [x] 3.2 Set up a local demo with an expanded nested group, a flat list and a narrow pane. Verify the One line and Detailed behavior and review any conflicts against the current upstream and related PRs during the integration check.

The visual run used the baseline and UI check scripts in the pinned Playwright image, scoped to the three affected stories at desktop and phone widths. The row alignment suite also passed.
