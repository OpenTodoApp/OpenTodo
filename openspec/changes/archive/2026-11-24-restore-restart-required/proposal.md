# Say when a restore needs a manual restart

## Why

GitHub issue #1961: after a confirmed web restore the server stops and starts itself again from its own executable. Where that path cannot be resolved (a chroot without `/proc/self/exe`), it only logs "restart OpenTodo to finish the restore" and exits, while the page keeps showing "Restoring and restarting…" with a spinner, forever.

## What Changes

- Before it stops, the server checks that it can start itself again (the executable resolves and can be run; without `/proc/self/exe`, the command it was started as is tried). The confirmation answers 202 with `status` `restart_required` instead of `restarting` when it cannot.
- On `restart_required`, or when the server has not come back within the wait, the page shows a final screen without a spinner: "Restart OpenTodo to finish the restore.", the same words as the log. It keeps checking, and reloads once the server is back.

No new mandatory environment variable, no op change, no new route: one new value of an existing response field.

## Out of scope

- Warning before the confirmation: the check runs at confirmation, and the restore itself is unchanged (it is applied on the next start, however the server is started).
- Restarting through a supervisor or service manager.

ROADMAP.md: none (a bug fix from an issue).

## Capabilities

### Modified Capabilities

- `backup-restore`: the confirmation says when the server cannot restart itself, and the page shows a final state.
