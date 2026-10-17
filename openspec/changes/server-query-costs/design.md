# Design: server query costs

## D1 Dependency graph once per batch (CORE-3)

The resolver caches each scope's graph (task id -> blocked_by list, plus the (ts, device) of the stored value) the first time a blocked_by op of that scope is checked. The cycle check overlays the candidate list on the cached graph and restores it afterwards. Apply calls `noteBlockedBy` after `writeOp` stores an op; the cached entry is replaced only when the op wins under the same rule `writeOp` uses (`Wins`), so the cache always equals what a fresh read of `scope_fields` would return. Within Apply no other statement writes `blocked_by` rows (scope changes are refused inside a batch).

Migration `0038_blocked_by_index.sql` adds `scope_fields_blocked_by ON scope_fields(scope_id, entity, field, entity_id) WHERE entity = 'task' AND field = 'blocked_by'`. The three equality columns make the planner prefer it over the primary key, so the graph query reads only rows that hold a dependency. Data model: additive index only; disk cost is one entry per task with a blocked_by value.

Measured (BenchmarkBlockedByBatch, 10,000 tasks, 1,000 dependencies in one batch): 10.3 s before, 0.44 s after. BenchmarkScopeBlockedGraph (10,000 tasks, 100 dependencies): 9.5 ms before, 0.28 ms after the index.

## D2 Activity feed newest entities first (CORE-8)

The activity rule (`internal/activity`) groups, compares and labels ops per entity: groups are keyed by actor and entity, old values by entity field, and a comment's task by its own task_id op. So an entity's events depend only on its own ops, and reading an entity's whole history yields exactly its events.

`sync.FeedReader` lists, per shared project, every task, project and comment entity with the time of its latest op at or before `upTo` (the cursor's ts, since an event at or before the cursor starts at an op at or before it), newest first. `Next(n)` reads the whole history of the next n entities (plus ties), opaque document fields left out in SQL, and returns a bound: every entity not read yet has its latest op before the bound, so every event at or after the bound is known. The route derives each round, and stops when more than a page of known events lies after the cursor (the page and the next cursor are then among them, since they sort first) or when every entity is read. The entity count doubles each round.

`internal/activity` is unchanged apart from exporting the cursor parser, so the Go rule still matches `web/src/lib/activity.ts` and the shared fixture. A randomised test pages through the feed with every filter and several page sizes and compares each page with the whole-history computation.

Measured (first page of 20 on a project of 2,000 tasks with 4 KB notes documents): 147 ms and 37 MB allocated before, 29 ms and 1.1 MB after.

## D3 Public view, memberships (CORE-15, CORE-19)

Sections and tasks of a public project are read with one query each (`entity_id IN (children)` ordered by id, the order the per-id reads had). Memberships reads all members of the user's projects in one query ordered by project and user id (the primary-key order the per-project reads had) and sorts each project's list as before. Counted: 210 statements to 5 for a 200-task public view; 21 to 2 for 20 memberships.

## D4 CalDAV view indexes (INT-9)

After loading, the view builds tasks per calendar (in list order), a map from calendar and resource name to the first such task (the one the scan found), and the UID to task id map (the smallest id when two share a UID, where the scan picked one at random). calendar-query encodes each task once and reuses the body for the response properties; `caldav.MatchesAnyTodo` recognises the plain VCALENDAR > VTODO filter, which every served resource satisfies, and the parse is skipped. Any other filter is still evaluated on the parsed calendar data. Measured (multiget of 200 hrefs on 2,000 tasks): 6,032 allocations per href and 133 ms before, 122 per href and 24 ms after.

No new dependency; no effect on image size. Memory per CalDAV request grows by three maps over the already loaded view.
