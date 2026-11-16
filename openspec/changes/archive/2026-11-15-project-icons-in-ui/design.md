## Context

The sidebar and task rows already use `ProjectMark`. Several project pickers project their local project rows into items that retain the colour but discard the icon. The archive, Notes rows and review screens already have enough data to draw the shared mark.

## Decisions

- Carry the existing icon alongside the colour through project picker options and local projections. Use the Combobox's existing `renderLeading` hook from the app, keeping the generic UI primitive independent of projects.
- Use `ProjectMark` at the existing leading positions, including in Loop. Keep the marks decorative and preserve labels, picker order, focus, selection and permissions. Keep the existing icon behaviour in utility controls such as swatches and special picker options.
- Keep the existing lazy catalogue and its dot fallback. Import the marker from its own module, so an archive or review screen does not import the sidebar to draw a project. Keep the public list on its existing API response.
- Use one leading slot in the group heading for the project's decorative catalogue icon. The header tint already carries the colour. A missing or unavailable icon renders nothing, and the heading retains its accessible name. In the grouped task lists and saved-view lists and boards, resolve the icon from the same project record as the tint.

## Impact and interface budget

The change uses existing project mark positions and the group heading. It adds no controls, task properties, sidebar destinations, scroll regions or shortcuts. There are no new dependencies, persisted fields or Go code changes. The web build is embedded in the server, so the asset diff is its only expected contribution to binary size.

Against main at `a1935e3db`, the entry is 147.5 KB gzip on both builds. The initial load goes from 711.6 KB to 711.7 KB gzip, within the existing 148 KB entry and 712 KB initial-load budgets. Both stripped Linux server binaries are 44,118,176 bytes.
