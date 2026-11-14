# Design

## D1. The options live on the Completed view

The view's display button opens its own panel: Group by (Day or Project), then a Combobox of the projects, the Inbox pinned first, with several chosen at once and "All projects" to clear the choice. A search field takes the place of the quick add row, which the Completed view does not have, so the page keeps two rows of chrome above its first item (interface guide). The panel's content loads with the button, after the first screen.

Saved views keep their own query and layout; pairing the logbook with a query in a saved view was considered and left out, because it is harder to find and the review needs only these three controls.

## D2. Grouping by project

By project, the shown completions (narrowed and searched, then the newest 100 and Show more as before) are grouped by project, the Inbox for none, each group in the order of its newest completion and its rows newest first. The heading names the project, so a row leaves out its project chip, as on a label page grouped by project.

## D3. The done marker

Only the Completed view drops the strikethrough: every row there is done, the check already says it, and a muted title reads better in a long list. Other lists keep the strikethrough, where it tells a done task from an open one.

## Data model

None. The options are stored on the device under `completed.display` (JSON: the grouping and the project ids, '' for the Inbox); a missing or unknown value reads as Day with every project. The search lives in the view and is cleared when the view is left. Nothing is synced, so nothing converges; everything is computed from local data, offline included.

## Size

No dependency. The search row, the button and the panel load lazily with the view. The list model's reading of the options, the filter and the grouping by project add about 0.6 KB to the first load (measured 704.4 KB against main's 703.8 KB), so its budget is raised to 705 KB.
