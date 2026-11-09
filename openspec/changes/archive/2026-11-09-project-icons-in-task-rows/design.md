## Context

The sidebar renders configured project icons through the catalogue, with the project colour dot as a fallback. Task rows have their own dot in both row layouts. On a phone, One line sometimes displays just that marker and keeps the project name in the accessible text.

## Decisions

- Share the project marker already used in the sidebar, with a compact size for the row. The existing catalogue renders known icons and keeps the dot until a lazy icon loads or when the name is unknown. Keeping separate renderers would duplicate that behaviour.
- Use the marker in the existing project cell in both layouts. Keep the project name and its truncation and visibility rules. The decorative marker adds no accessible name or interaction.
- Consume the project object the row already receives. The device shows the icon it knows about, using the existing local catalogue and fallback when offline. Sync and convergence continue to use the existing project fields.

## Impact and interface budget

The same project property occupies the same cell. There is no added chrome, property, sidebar destination, scroll region or shortcut. No dependency or persistent data changes, and no material container size or memory impact is expected.

Keep the project header's existing import from the sidebar. The sidebar re-exports the shared marker and task rows import that marker directly. On main at `890d7185`, this arrangement measures 143.1 KB gzip for the entry and 686.8 KB for the full initial load, compared with 143.4 KB and 686.8 KB on main.
