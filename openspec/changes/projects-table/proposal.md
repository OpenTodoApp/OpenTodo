# Proposal

## Why

Part 8 of the "Precision" redesign build plan (`design-references/round2/README.md`, row 8; mock-up `projects-table.png`), after `precision-tokens`, `precision-shell` and `precision-rows`. The All projects page is a tree of names with an open count. It answers "where is my project?" but not "which project needs me?". The round-2 mock-up turns it into a table you read like Linear's projects list: each project's health in one word, its progress, what is open, when the next thing is due, who is in it and when it last moved.

- **"Immediately clear, colours help a lot":** a health word in a state colour tells the user where to look before they read a number.
- **"Space perfectly used":** the page spends the full content surface on aligned columns, instead of a narrow tree with a count at the end.
- **Calm intelligence, on the device:** the health is worked out from rules the user can read, from data the device already holds, with no request and no model.

## What Changes

- **All projects becomes a table.**
  - Columns: Name, Health, Progress, Open, Next due, People, Updated, then the row's menu.
  - The tree stays: sub-projects are indented under their parent, fold and unfold as before, and Collapse all / Expand all stay in the page menu.
  - The whole row opens the project.
- **Health, one word per project, from explicit rules** (statistics, new requirement "Project health"):
  - **Late:** an open task's deadline has passed. The detail names that task, or says how many are past their deadline.
  - **Slipping:** an open task is due before today. The detail says how many are late.
  - **Quiet:** nothing in the project changed for a week. The detail says for how many days.
  - **On track:** otherwise, while something is open.
  - A project with nothing open shows "Nothing open".
  - A note under the table says how health is worked out.
- **Figures follow the sidebar's rule:** a folded row sums its sub-projects, an expanded row counts its own tasks.
- **Progress:** a ring and a percentage, completed over all tasks. A recurring series counts once.
- **Next due:** the earliest due date among open tasks, in the danger colour when it is before today.
- **People:** the members of a shared project as avatars, up to three, then "+n". A project that is not shared shows nothing.
- **Updated:** the newest change to the project or one of its tasks, as "12 min ago", "yesterday", "9 days ago" or a date.
- **Sorting:** every column but People sorts by a click on its header.
  - A first click sorts in the column's natural direction: health from the most urgent, Updated from the newest, the rest ascending.
  - A second click reverses the order; a third returns to the user's own order.
  - Rows are sorted among their siblings, so the tree stays a tree.
- **Keyboard:**
  - Up and Down (and `j`, `k`), Home and End move between rows.
  - Left folds a row, or moves to its parent; Right unfolds it.
  - Enter opens the project. Down from the find field enters the table.
- **Narrowing:** the table is its own size container, and its columns drop from the end as it narrows.
  - Under 68 rem: Updated goes. Under 60 rem: People. Under 52 rem: Progress. Under 44 rem: Next due.
  - Under 36 rem: Open goes, along with the health detail.
  - A phone keeps the name and the health word.
- **Active and Archived tabs** replace the archived projects disclosure, with their counts.
  - `/projects#archived` and the link from Settings → Data open the Archived tab.
  - The fragment follows the tab.
- **New UI:**
  - a `ProgressRing` primitive with a story;
  - three icons from the existing Lucide set: `activity`, `trending-up`, `circle-alert`;
  - new strings in five languages.

Out of scope:
- The filter and display buttons in the mock-up's toolbar (`views-and-display`).
- Health on the project page itself and in the sidebar.
- Health for archived projects: the Archived tab keeps its list with Restore.
- Any server-side health: nothing is computed or stored on the server, and the digest is unchanged.
- Saving the chosen sort: it lasts while the page is open.

ROADMAP: advances the Precision redesign (round-2 build plan, change 8). No new environment variable, no op-log change: nothing here is **BREAKING**.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `project-organization`:
  - "All projects page": the table, its columns, sorting, keyboard and narrowing;
  - "Archived projects list": a tab instead of a disclosure.
- `statistics`: the new requirement "Project health" (the rules, computed on the device, the excluded rows).

## Impact

- **Web:**
  - `app/ProjectsView.tsx` (tabs, find, sort state);
  - `app/ProjectsTable.tsx` (new: the table);
  - `lib/projectHealth.ts` (new: the rules and the sort, pure);
  - `ui/ProgressRing.tsx` (new), `ui/icons` (three names);
  - `app/ArchivedProjects.tsx` (the focus fallback);
  - the locales.
- **Server, API, sync, data:** none. The table reads the local task, project and membership rows the page already had, plus completed tasks for progress.
- **Bundle:** about 3 KB of JS before compression; no dependency.
