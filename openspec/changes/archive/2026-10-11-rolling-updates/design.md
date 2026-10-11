# Design: rolling updates

## D1 Two locks

`opentodo.lock` stays the data-directory lock: servers take it with `LOCK_SH`, maintenance commands (`restore`, `mfa-reset`, `reset-owner-password`) with `LOCK_EX` as before, so a maintenance command still refuses while any server runs and a server refuses to start during a restore. A second file, `opentodo-jobs.lock`, is taken `LOCK_EX` non-blocking by the server that runs background jobs; others retry every two seconds and start the jobs once they get it. flock locks are released by the kernel when a process exits, so a crashed leader never blocks the next one.

## D2 What runs where

Every process serves HTTP and sync. Only the jobs leader runs the scheduled and queue-driven work (push scheduler, webhook worker, backup scheduler, email poller, retention, audit pruner, demo nightly reset). Start-up seeding (backup presets, MCP toggle, demo accounts) is idempotent and may run in both.

## D3 Live updates across processes

The SSE wake-up channel is per process: during the overlap, a write handled by the new process does not wake devices connected to the old one. They catch up on their next poll (30 s) or when the old process closes their stream at shutdown and they reconnect to the new one. The overlap lasts seconds.

## D4 Migrations during the overlap

The new process applies pending migrations while the old process still serves. Migrations are additive by rule (new tables and columns via side tables, no renames), so the old binary keeps working on the newer schema until it stops.

## Size

No dependency; a few dozen lines.
