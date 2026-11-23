# Design

## D1. Decided once, at the first read

The phase is decided at the first read of the local store: `copying` when it holds no tasks, no cursor and no cleared first-copy marker; `done` otherwise. It then ends only when the marker is cleared, which sync does on the last page of the first copy, also for an empty account (its first exchange sets and clears it). Deciding once keeps a restore's re-seed, which resets the cursor and sets the marker on a device that holds data, out of it.

## D2. Only while a copy can finish

The skeleton shows only while sync has started in this session (`syncStarted`) and its state is not offline, error, unauthenticated, restricted, locked or limited. A device that cannot sync shows what it has, with the status line saying why, rather than a skeleton that never ends. Unit tests, which do not start sync, see the snapshot as before.

## D3. One reader for every caller

`useLiveTasks` has many callers; the phase is one module store fed by one Dexie live query over the two meta rows and one task row, started by the first reader and stopped when the phase is done. The sync status is read through `useSyncExternalStore` with a boolean snapshot, so a status change re-renders a caller only when that boolean changes.

## D4. The end waits for the task snapshot

A first copy of many pages holds the shared task snapshot (`holdLiveSnapshots`, list-rendering-at-scale) and releases it after the last page, while the first-copy marker is cleared on that page, before the release. The end therefore waits until no hold is on, then 100 ms for the snapshot's refresh to land, so the lists never show a frozen part of the copy between the skeleton and the full list.

## D5. A sign-out starts over

Sign-out stops sync and clears the device without a page load. When sync is no longer started, the phase returns to undecided, so the next sign-in reads the store again: a device that now holds nothing gets the skeleton for its first copy, one with data ends at once.

## Known limits

- A task added during the copy (quick add) shows when the copy ends, not at once.
- A re-seed that stops on an account mismatch leaves the status at `reseeding`; the skeleton then ends with the next exchange.
