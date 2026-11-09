# Tasks

## 1. Implement and verify

- [x] Update the shared chip and its tests in `web/src/ui/Chips.test.tsx`. Verify tint and text tokens, no decorative dot, the slate fallback, and the accessible remove action. Check the shipped catalogue's chip contrast after browser rounding. Run the focused chip, task row, catalogue and token contrast tests.
- [x] Check One line and Detailed rows at desktop and phone widths, and editable chips in light, dark and high contrast. Compare the affected screens with `make screens` before and after. Run `make ui-check` and refresh only affected Storybook baselines using the pinned environment in `make ui-baselines`.
- [x] Update `docs/labels-and-filters.md` and add `changelog.d/Changed/label-chip-tints.md`. Run `make docs` and `make docs-check`.
- [x] Run `npm test` and `npm run build` in `web/` and run `make check` before marking the change complete.

## 2. Prepare the pull request

- [x] Archive the verified change for the finishing PR and run `make docs`, `make openspec-validate` and `make check` on the final diff. Prepare the PR description using the repository template, reference point 2 of #1089 and select the before/after screenshots for attachment.
