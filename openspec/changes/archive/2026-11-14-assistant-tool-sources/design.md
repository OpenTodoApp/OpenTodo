# Design

## D1. A source is ids, not content
A source holds `of` (`tasks` or `projects`), `ids` (the returned ids in the tool's order, at most 50) and `total` (every id the result named). It is computed from the tool result after the call succeeded, on the server from the JSON the model receives and on the device the same way, so the line shows exactly what the model was given. Results: `tasks[].id` (`list_tasks`, `search_tasks`), `task.id` (`get_task`), `overdue[].id` then `due_today[].id` without repeats (`today_summary`), `projects[].id` (`list_projects`). An error result, or any other tool, has no source. Shared vectors (`web/src/lib/assistantDevice/sources.vectors.json`) pin the two readers.

## D2. A separate event, not a block
A source is not a display tool: it does not count toward the turn's 4 blocks, it is not announced, and Copy leaves it out. It travels as its own `source` event and is stored as `AssistantMessage.sources: { at, source }[]`, `at` being the length of the text so far, as for blocks. A client that does not know the event skips it.

## D3. The line
A native `<details>` with the read icon and "Looked at {n, plural} tasks/projects" (or "No tasks found" / "No projects found", not expandable). Opening it lists the stored ids' rows from the device, each a link opening the task or project; a row no longer there reads "Removed". When `total` is larger than the stored ids, the list ends with "and {n} more". No helper text.

## Data model
No op, no field, no migration. The conversation in IndexedDB gains the optional `sources` on a message (not indexed).

## Interface budget
Inside an answer only: no chrome above lists, no new properties, sidebar destinations, scroll regions or shortcuts.

## Size
The stream reader's case and the parser (a few hundred bytes gzip) on the first load; `SourcesLine` is its own lazy chunk next to the blocks. No dependency, no image or memory impact.
