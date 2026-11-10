## Design

- Reuse the project header's appearance actions, the existing project edit role check and the same rename mutation. The Projects row swaps its name for an inline field, as in Labels. Favourites keeps the name dialog shared by its other rename actions.
- Put a single trigger to the left of the name. The project popover shows colour swatches and the searchable icon picker together. The label popover shows only colours. Keep selections local to each draft until submission. An untouched colour still uses the existing creation default.
- Create the project with its optional icon and colour through the existing field-level operation. Use the existing label colour input. All edits work offline and converge by the existing field clocks.

No new dependencies, data fields or routes. The controls stay inside the existing name row and overlay system. The list chrome, task properties, primary destinations, scrollers and shortcuts stay within their existing budgets. The creation forms load their appearance control on demand. The gzip entry is 142.3 KB on both main and the branch. The full initial load is 695.1 KB on the branch versus 693.9 KB on main, so the initial-load budget is 696 KB.
