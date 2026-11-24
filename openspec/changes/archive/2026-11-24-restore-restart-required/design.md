# Design: restore-restart-required

## D1. Check before stopping

The restart hook (`tenant.Options.Restart`) returns whether the server comes back on its own. `cmd/opentodo` resolves its executable before it stops (`restartTarget`: `os.Executable`, then `exec.LookPath(os.Args[0])` when that fails, then a stat that the file can be run), and re-executes the same path afterwards. A host closes the tenant and always comes back. `ConfirmRestore` passes the answer through, and `POST /api/v1/backups/restore` answers `{"status":"restart_required"}` instead of `{"status":"restarting"}`. The server still stops, with exit status 75 (EX_TEMPFAIL) when the re-exec fails, so systemd `Restart=on-failure` or a container restart policy starts it again; the pending restore is applied on that start.

## D2. One final screen

The restart screen has two states: waiting (spinner, "Restoring and restarting…") and stopped (no spinner, "Restart OpenTodo to finish the restore."). Stopped is shown at once on `restart_required`, and after the 60-second wait otherwise, since the page cannot tell a slow start from no start. It keeps polling `/healthz` every 5 seconds and reloads when the server answers; polling stops when the page unmounts.

Data model: none. Interface budget: the full-screen status replaces the screen as before; no chrome, property, destination, scroll region or shortcut is added. No dependency.
