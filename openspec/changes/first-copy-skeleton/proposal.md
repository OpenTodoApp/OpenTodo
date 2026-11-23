# Proposal

## Why

From the phone accessibility pass (interface audit at 360 px): on a new device, the Plan read "Nothing planned" on every day for about 200 ms and then jumped as today's tasks arrived (layout shift 0.27, budget 0.1). The skeleton waits only for the local database's first answer, and on a device that held nothing that answer is "no tasks" until the first sync has brought them. Every list does the same; the audit catches it on the Plan. "Skeleton loading" already rules out an empty state before the data is read.

## What Changes

- On a device whose local store held no tasks and had never synced when the app started, the task snapshot (`useLiveTasks`, `useTasksOfEveryWorkspace`) reads as not loaded until that device's first copy ends, so every screen keeps the skeleton it already shows while tasks load.
- Only while sync runs in this session: before it starts, offline, or when it stops with an error, the screens show what the device has, with the sync status saying why.
- A device with data, a restore's re-seed included, is unchanged.

Sync itself is unchanged: this reads the cursor, the first-copy marker (`firstCopy`, notes-compaction-at-scale D3) and the sync status.

## Capabilities

### Modified Capabilities

- `task-list-presentation`: "Skeleton loading" covers a new device's first copy.

## Impact

- `web/src/lib/firstCopy.ts` (new), `web/src/lib/liveTasks.ts`, `web/src/lib/sync.ts` (two read-only exports: `onSyncStatus`, `syncStarted`), tests.
- No new op, route, setting, string or dependency.
