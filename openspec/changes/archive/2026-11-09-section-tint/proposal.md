# Proposal

## Why

Issue #781 (from #755, item 5): a section's colour only shows as the small icon or dot before its name, so with several sections the colour does not help tell them apart at a glance.

## What Changes

- A section with a colour tints its header with a soft fill of that colour: the group bar in a project's list, and a strip of the same fill at the top of its board column. The section's rows and cards are not tinted.
- The tint is the calendar frame band's recipe (the hue's soft step mixed towards the surface), at a strength chosen so every text tone of the header keeps AA contrast in light, dark, high contrast and every theme. The contrast gate measures it as a new derived step `hue-<name>-tint`, in CI and in the theme editor's live check.
- On a tinted header, "Show" (a section with only completed tasks) uses the default text tone instead of the accent, since the accent is not measured on the tint.
- A section with no colour, "No section", and every other grouping (date, priority, project, label) look as before.

Out of scope: tinting a section's rows or cards, a folded board column's strip, and a per-section switch for the tint. Advances the ROADMAP's sections-and-boards polish; no ROADMAP item is tied to it.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `sections-and-boards`: "Section colour and icon" adds the tinted header.

## Impact

- Web app only: `web/src/ui/patterns/ListGroupHeader.tsx` (a `hue` prop), `web/src/app/Sections.tsx`, `web/src/index.css` (`.ui-group-tint`), `web/src/ui/tokens/pairs.ts` (the derived step and its pairs), `web/src/lib/theme/check.ts`, `generate.ts` and the generated `reference.json` (the theme editor measures the same step), tests in `web/src/app/sectionMenu.test.tsx` and `web/src/ui/tokens/contrast.test.ts`.
- Visual baselines of stories with coloured sections change on purpose.
- No op field, sync, API, CLI, MCP, encryption, dependency, string or server change. First-load JS is unchanged apart from a few bytes; the rest is one CSS rule and a lazy-chunk change.
