# Design

## Context

`web/src/ui/Chips.tsx` renders the shared `LabelChip`. Both task row layouts use it through `LabelChips`, and task details, notes and selected-item controls also use it. The sidebar and label chooser have separate colour markers.

## Decisions

- Put the treatment on the shared chip so it applies consistently to read-only and removable chips. Keep the existing name and remove control, and let the existing overflow calculation measure the resulting chip width.
- Resolve the stored colour through `hueFor` and use the design system's soft fill and matching text tokens. Imported hex colours and colours without a recognised hue follow the existing palette mapping. The existing chip text/soft fill contrast pairs are checked at 4.5:1. Verify the rendered chip and the remove control in light, dark and high contrast.
- Check the catalogue's chip pairs again after rounding to the browser's 8-bit sRGB colours. The catalogue generator can adjust the lightness of a shipped hue when rounding takes its contrast below 4.5:1. The theme editor and stored label colours use their existing rules.
- Using the stored colour directly for a CSS fill would require new contrast calculations for custom themes. A row-only variant would make the same chip look different in a task's details. The shared palette and primitive already cover these cases.

## Impact and interface budget

This is a presentation change over locally available labels. It adds no data field, preference, dependency, network request or sync behaviour. Container size, first-load JavaScript and runtime memory should see no material increase. The change adds no header row, visible property, sidebar destination, scroll region or shortcut.
