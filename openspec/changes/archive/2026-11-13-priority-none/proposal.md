# Proposal

## Why

Every task starts at priority 4, the lowest level, which AGENTS.md and the docs call the default. The app showed that level as a priority like the others: "P4" in bold in the task panel, a "P4" choice beside P1 to P3 in the picker, "Priority 4" as a group heading. A person who wants a task to have no priority could not see how to leave it blank and read the default as a priority they could not remove (issue #1225).

## What Changes

- **Level 4 reads as no priority while the person has not named it:** "No priority" as a word (group headings, board columns, filter chips, bulk actions, quick-add chips and suggestions, routines, the assistant), "None" as a short choice (the priority picker, row and inline-edit menus, history, before and after). The task panel shows the faint unset Priority part, as for any other unset property; the facts column shows "Set a priority".
- **Taking a priority away is choosing None**, which writes level 4 as before. The command bar offers "Remove the priority of …"; a bulk change says "Priority removed from N tasks".
- **A name for level 4 still wins** (priority-names): "Whenever" shows wherever "No priority" would.
- **The `ot` table** leaves the priority column empty for level 4; `--json`, the API, MCP, CalDAV, quick-add tokens (`p4`), filters and saved views keep the number.
- **No data change:** the stored value stays 4; no migration.

## Capabilities

### Modified Capabilities

- `priority-names`: the default name of level 4 is no priority, with scenarios for a new task, taking a priority away and a named level 4.
- `filter-queries`, `trash-and-history`, `web-app`, `end-to-end-encryption`: scenarios that quoted "P4" or "Priority 4" read the new words.

## Out of scope

A fifth, empty priority value; changing the number a task stores; the server's own texts (emails, digest), which never named level 4.

## Roadmap

A fix outside the roadmap's milestones (issue #1225).
