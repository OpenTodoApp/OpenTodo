# Design

## Context

`op-log-compaction` (archived as `2026-10-31-notes-compaction`) decided *what* compaction deletes (D1, D3) and that it runs in short steps (D4); `performance-10k` D7 built the fixture that measures it. The measurements in the proposal show the rules are fine and the mechanics are not. This change keeps every rule of D1–D3 and replaces how the job finds, deletes and reclaims, and adds one sync feature for a device's first copy.

Facts found while profiling (development machine, the notes fixture: 2,654 MB, 679,000 pages, already in incremental vacuum mode):

- `ops` stores `ts`, `device` and `received_at` after `value`. Reading them still costs about 6 µs per row (300 rows of one note in 1.5–1.9 ms): with incremental vacuum SQLite finds overflow pages through the pointer map and does not read the value. So no new index is needed to read an op's metadata.
- The old candidate query took 3–10 s per 100 candidates; the delete itself took 6–21 ms per 100.
- `PRAGMA incremental_vacuum(500)` with 2 GB on the free list held the writer for about a second: removing a free page from the end of the file searches the free list's trunk chain.

## Decisions

**D1. Plan a field, not a sequence window of candidates.** The unit of work is a *field*: one `(scope, entity, entity_id, field)` of `CompactFields`. Planning reads all its ops without their values (`seq, ts, device, received_at` through `ops_entity` and `op_scopes`) and its winner (`scope_fields`), then decides in memory: delete when not the winner's `(ts, device)`, received before the cutoff, and for a daily field (`description`) not the greatest `(ts, device, seq)` of its UTC day. That is exactly op-log-compaction D1 and D3, now linear in the field's size instead of quadratic.

The fields to plan are found by walking the log **from its newest op back to the first** in windows of 8,192 sequence numbers: the fields of `CompactFields` with an op in the window (`SELECT DISTINCT` over the window, value never read). Newest first because the newest rows sit at the end of the file, and incremental vacuum returns pages from the end: deleting there first means a vacuum step mostly truncates free pages instead of moving live pages that a later window would delete anyway (measured: the reclaim half of a pass went from 43 s to 22 s). A field with ops in several windows is planned again in each; after the first time its plan is short. The mark is the window's upper bound, a sequence number stored as text in the job's record (`mark`, with `in_pass`); a record of the earlier version (`cursor`) restarts the pass from the head, which is harmless.

Alternatives considered: a covering index `(entity_id, entity, field, device, ts, received_at)` on note fields (not needed once the metadata read proved cheap; it would cost a migration that reads every note op of an upgraded database); walking `scope_fields` in key order (simpler, but key order is random relative to the file, so the vacuum moved twice as many pages).

**D2. Hold the writer about 20 ms at a time.**

- *Deletion.* A writer transaction takes at most 64 planned ops of one field. It first checks the plan against the database as it is now, with index lookups only: each op is still in the field's scope (`op_scopes`), it is still not the winner (`scope_fields`), and for a daily field the later revision of its day that made it deletable still exists. An op's `ts`, `device` and `received_at` never change, so nothing else can have changed. Then it deletes in statements of 16 ops (`RETURNING octet_length(value)`, which takes the size from the record header) and commits once it has run for 20 ms. Waiting writes get the connection next (database/sql hands a released connection to the oldest waiter).
- *Reclaiming.* A run alternates: about 2 s of deletions, then incremental vacuum steps until the free list is empty or the run's budget is over. Each step's size follows the last one's duration (aiming at 20 ms, between 16 and 128 pages), because a page costs from almost nothing (a free page at the end) to about 0.2 ms (a live page moved). The free list therefore never holds more than a couple of seconds of deletions, which keeps each step cheap.
- *Checkpoints.* During a run the writer's automatic checkpoint is off and the page cache is 32 MB; a goroutine copies the write-ahead log back into the database four times a second from the reader pool (small copies: with one a second the CI runner saw a push wait 105 ms instead of 34) (WAL mode allows a checkpoint beside a writer), and once more before the settings are put back. Otherwise the commit of whichever write crosses 1,000 pages, often a device's push, would copy the run's pages and wait for the disk.
- The run's budget stays 20 s and `Retry` 1 minute; nothing else in the job model changes.

**D3. A first copy pulls the latest documents only (`latest_docs`).** A device sends the sync feature `latest_docs` while it copies the account for the first time: from cursor 0 until a page says `hasMore: false`. The client keeps a `firstCopy` flag in its meta table so a copy interrupted by a reload continues with the feature; a restore's re-seed sets the cursor to 0 and so starts a new first copy. With the feature, for the ops of `CompactFields` in a page the server serves:

- for a document field (`notes_doc`): per scope, the op with the greatest `(ts, seq)` of each device (the device's *head*);
- for `description` and `appends.*`: the op that is the field's winner.

Why heads are enough: a device's document only grows. Every local save merges the stored document first and every received document is merged whether it wins or loses (docs/sync.md "Mergeable documents", rules 1 and 2), so a device's later document contains its earlier ones, and the union of all heads is the union of all documents. A new device that merges the heads computes the same union, makes the same decision to republish, and ends with the same rows as one that merged every save. That keeps op-log-compaction's scenario "Pushed and not yet pulled": the new device still gets A's and B's documents. Projections and appends are plain registers for a device without local edits: only the winner is ever stored, and fold-back (rule 3) compares winners only.

Mechanics: the page query reads `octet_length(value)` instead of the value for these fields; the server reads each touched field's metadata (as in D1), decides, and fetches the values of what it serves in one more query. A left-out op is passed by the cursor like the device's own ops and does not count against the page's byte budget. The server never reads a value to decide, so encrypted accounts behave the same. Pages may now carry no ops and still `hasMore: true`, as they already could when every op was the device's own.

Not done: the catch-up replay of a newly joined shared project (`backfillPage`) keeps serving everything; its pages are cut by progress markers that an empty page would complicate, and shared notes are a small part of the history.

**D4. No change for older clients.** The feature is additive, the request and response formats are unchanged, and a client that does not send `latest_docs` gets the log exactly as before. The v1 client recordings replay unchanged (`TestV1ClientsReplay`).

**D5. Budgets.** The fixture's composition after a complete pass is fixed by the rules: 250 winning documents and projections of each kind stored twice (the op and `scope_fields`, 15 MB), the 30-day window's documents (1,450 superseded saves of the 50 recent notes, 31 MB) and one revision per day of each note's projection (13,400 descriptions, 65 MB): 116 MB against the first estimate of 100 MB (performance-10k D7). The limit `notes-share` becomes 130 MB with that reason; no other notes limit changes.

**D6. The note search keystroke.** Once the first sync took 21 s instead of 235 s, the CI run measured the rest of the notes session, and the note search keystroke was over its limits (62 ms on a computer, 383 ms in the phone profile; 50 and 150). The benchmark types right after the Notes page appears, so its 95th percentile is the first keystroke, and profiling found:

- every keystroke stripped the Markdown of each of the 50 rows shown again for its snippet (18 of 20 ms of a warm keystroke): the index now keeps each note's plain text with its prepared form, and an ASCII text's snippet is cut from the string instead of an array of its characters;
- the first keystroke prepares the notes the idle warm-up has not reached yet: preparing is now about four times cheaper on ASCII text, with the same results (NFKD is skipped for ASCII, whitespace runs that are already one space are left alone, a line starting with a letter skips the block-marker checks, a run without inline markers is copied at once), and the warm-up uses each idle period to its end;
- after a first sync, writes to tasks re-derived the page's notes and searched again (30–150 ms each in the phone profile): the page keeps its list of notes while it shows the same notes (`sameEntries`).

These are `web/src/lib/noteSearch.ts`, `web/src/lib/noteList.ts` and the Notes page's data hooks; the task list rendering is not touched. `noteSearch.ts` has a Go twin pinned by shared vectors (`internal/notesearch`): the results are unchanged, which the vectors and two new equivalence tests check.

## Data model impact

None: no table, column, index or op field changes. The compaction job's stored record (`settings` key `compaction.last`) gains `mark` and `in_pass` and stops writing `cursor`.

## Size and memory

No dependency. Binary size unchanged within noise. During a run the writer's page cache is 32 MB instead of SQLite's default 2 MB, given back at the end of the run. The web bundle grows by a few bytes (`lib/sync.ts`).

## Risks

- A device whose document did *not* contain its earlier saves (a client bug, a local store wiped while keeping the device id) would lose those saves for a new device's copy. Mitigation: device ids live in the same local store as the documents (wiping one wipes the other), and existing devices still pull every op; only first copies use the feature.
- Disk-bound moments: a commit waits for the disk when the system is busy writing other data back (the CI benchmark first copied the 2.6 GB fixture and measured while the kernel wrote the copy, and a commit took 200 ms; the benchmark now waits for that write-back first). The checkpoint runs four times a second and before the run ends, so the log stays small.
