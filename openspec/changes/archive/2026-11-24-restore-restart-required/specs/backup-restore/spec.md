## MODIFIED Requirements

### Requirement: Confirmed restore applies through a self-restart
`POST /api/v1/backups/restore` SHALL take a prepared restore id and the confirmation word `RESTORE`. It SHALL require a session that re-authenticated within the fresh window, answer 202, and then restart the server: shut down gracefully, apply the restore before the database reopens, and start again in the same process. Before it stops, the server SHALL check that it can start itself again; the 202 response SHALL carry `status` `restarting` when it can and `restart_required` when it cannot, in which case the server stops and applies the restore on its next start. The restore SHALL be refused with 409 `conflict` while a backup run is in progress.

#### Scenario: Successful web restore
- **WHEN** the owner re-authenticates, types `RESTORE` and confirms a prepared restore
- **THEN** the server restarts, its accounts, tokens, projects, tasks and operation log match the archive, a safety copy of the previous database exists, and the log generation is new

#### Scenario: Server cannot restart itself
- **WHEN** the owner confirms a restore on a server whose executable cannot be resolved (for example a chroot without `/proc/self/exe`) or run
- **THEN** the response is 202 with `status` `restart_required`, the server logs "restart OpenTodo to finish the restore" and exits with a non-zero status (so a supervisor that restarts on failure starts it again), and it applies the restore when it is started again

#### Scenario: Stale session
- **WHEN** the confirmation comes from a session that has not re-authenticated within the fresh window
- **THEN** the response is 403 `reauth_required`, the re-authentication dialog opens, and nothing is restored

#### Scenario: API token instead of a session
- **WHEN** a full-scope API token calls `POST /api/v1/backups/restore`
- **THEN** the response is 403 `session_required`, and nothing is restored

#### Scenario: Missing confirmation word
- **WHEN** the request omits the confirmation word or sends a different one
- **THEN** the response is 400 `invalid_input` with field `confirm`, and nothing is restored

#### Scenario: Unknown or expired prepared id
- **WHEN** the prepared id does not exist or has expired
- **THEN** the response is 404 `not_found`, and the screen asks the owner to prepare the archive again

#### Scenario: Backup running
- **WHEN** a scheduled backup is running at the moment the owner confirms
- **THEN** the response is 409 `conflict`, and the owner can retry once the run finishes

#### Scenario: Demo instance
- **WHEN** a visitor on the public demo instance calls any `/api/v1/backups/restore` route
- **THEN** the demo deny list refuses it, and the panel shows the demo note instead of the restore section

### Requirement: Restore state across the restart
The web app SHALL show restart progress after confirming, poll until the server answers again, and then reload. When the confirmation says `restart_required`, or the server has not answered within a minute, the screen SHALL stop showing progress and say "Restart OpenTodo to finish the restore.", keep polling, and reload once the server answers. After the restart, the restore section SHALL report the outcome of the last restore: time, archive, who requested it, and success or the error. A restore that fails while applying SHALL leave the previous database in place, start the server normally and record the failure.

#### Scenario: Owner watches the restart
- **WHEN** the owner confirms a restore
- **THEN** the screen shows "Restoring and restarting…", then reloads into the restored data once the server answers

#### Scenario: Restart needed by hand
- **WHEN** the confirmation answers `restart_required`, or the server has not come back within a minute
- **THEN** the screen shows "Restart OpenTodo to finish the restore." without a spinner, and reloads once someone starts the server and it answers

#### Scenario: Owner's session predates the restore
- **WHEN** the owner's session was created after the backup was taken
- **THEN** after the restart the sign-in screen opens with a note that the server was restored from a backup

#### Scenario: Apply fails
- **WHEN** the staged database fails its final check while being applied
- **THEN** the server starts on the previous database, and the restore section and the audit log show the failure and its reason
