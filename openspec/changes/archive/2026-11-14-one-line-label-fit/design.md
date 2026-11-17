## Context

One line uses a list-wide grid with a fixed labels slot. Shrinking multiple chips independently can cut a count and its labels. Detailed already has its own fitting behavior and available width.

## Decisions

- Measure the One line label cell and reuse the existing tinted chip and tooltip. Keep the longest ordered prefix of whole chips that fits with the counter. If no whole chip fits, give the first label the remaining width after reserving the counter. A CSS-only clip cannot compute the hidden count or its tooltip.
- Remeasure when the label list, font metrics or available width changes. Use local layout only, including offline. No schema, persisted settings, writes or convergence rules change.
- No additional chrome, visible task properties, sidebar items, scroll regions or shortcuts. Reuse the existing focus treatment and tooltips so truncated names are available without a mouse.
- Load the fitting code when a One line row has labels. While it loads, the existing chip group renders at narrow widths and reserves the fixed slot at wide widths so the unfitted chips are kept out of view. This keeps the fitting code outside the initial bundle.
- No dependencies or server code. The embedded application is the only change to binary size.

## Size impact

Against upstream `619be32ea` on the same Linux build, the initial web bundle is 711.6 KB gzip in both builds at the budget check's precision (728,679 bytes with the change and 728,705 bytes on main). The entry is 147.5 KB gzip in both builds. The limits stay at 712 KB and 148 KB, respectively. The Linux server binary with the embedded web app grows by 4,096 bytes.
