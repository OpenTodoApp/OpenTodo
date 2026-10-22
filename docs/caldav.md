---
title: Calendar apps (CalDAV)
summary: Turn on CalDAV, create app passwords and connect Apple Reminders, Thunderbird or Android apps.
audience: admin
specs: [caldav-sync]
screens: []
order: 45
---
# Calendar apps (CalDAV)

OpenTodo can act as a CalDAV server for tasks, so Apple Reminders, Thunderbird, Nextcloud Tasks (through DAVx⁵) and other CalDAV clients become one more synced device. Each project is a task list (a calendar collection of VTODO resources), and the Inbox is its own list. Edits made in a calendar app are ordinary operations in the op log, so they converge with every other device under the usual rules: no "pick a version" dialogs.

Implemented by the OpenSpec change `caldav`. The endpoint lives under `/dav/` and needs no extra service, port or dependency.

## Turn it on

CalDAV is **off by default**: until the owner enables it, every path under `/dav/` and `/.well-known/caldav` answers 404 without asking for credentials.

1. As the owner, open **Settings → Integrations → Calendar apps (CalDAV)** and switch on *Allow calendar apps to sync with this server*. The section shows **On** or **Off** beside it; members see the same status without the switch. It takes effect immediately, no restart.
2. Deployments managed as code can set `OPENTODO_CALDAV=true` instead: it presets the toggle on the **first start only**; afterwards the Settings toggle decides.

Use HTTPS. Calendar apps send the app password with every request (HTTP Basic); on plain `http://` it travels unencrypted. Settings warns when the server address is not https. Set `OPENTODO_BASE_URL` to your public https URL so Settings shows the right address.

## Create an app password

Calendar apps sign in with **your account email and an app password**, never your account password, an API token or a single sign-on login (all of those are refused at `/dav/`). App passwords work only for CalDAV: they cannot call the REST API or change the account.

In **Settings → Integrations → Calendar apps** choose **New app password**, enter a name (for example "iPhone") and choose **Create app password**. The password (`otap_…`) is shown **once** in the same dialog; use **Copy** and paste it into the calendar app. Create one per device so you can revoke a lost phone without touching the others. The list shows when each was created and last used. To revoke one, open its **⋯** menu and choose **Revoke**, then confirm. Revoking takes effect on the next request. Deactivating an account revokes its app passwords; deleting it removes them.

Accounts with two-factor authentication or in SSO-only mode use app passwords like everyone else: creating one requires a recent sign-in (the same step-up check as API tokens). Failed sign-ins are limited to 10 a minute per address; after that the endpoint answers 429 for a minute.

## Client setup

The server address is `https://<your server>/dav/` (Settings shows it with a copy button). The user name is your account email.

### Apple Reminders (iPhone, iPad, Mac)

- iOS / iPadOS: **Settings → Apps → Calendar → Calendar Accounts → Add Account → Other → Add CalDAV Account** (on older versions: Settings → Calendar → Accounts). Server: your server's host name (or the full address above), user name: your email, password: the app password. Under *Advanced settings* make sure SSL is on.
- macOS: **System Settings → Internet Accounts → Add Account → Add Other Account → CalDAV Account**, account type *Manual*, then the same values.
- Turn on **Reminders** for the account. Your projects appear as lists; new lists created in Reminders become projects.

### Thunderbird

**New Calendar → On the Network**, user name: your email, location: the server address. Thunderbird discovers the lists; tick the ones to show and enter the app password when asked. Tasks appear in the Tasks tab. A task with a due time shows a Start equal to its Due: to move it, drag it or change Start (Due follows); changing only Due gives the task a deadline on that day.

### Android: Nextcloud Tasks, Tasks.org, jtx Board (DAVx⁵)

In DAVx⁵ add an account with **Login with URL and user name**: base URL is the server address, then your email and the app password. Enable the task lists in the account's CalDAV tab and pick the tasks app DAVx⁵ should sync with.

### Nextcloud

The Nextcloud Tasks web app only shows calendars stored in Nextcloud itself. Use DAVx⁵ on Android, or any desktop client above, to reach OpenTodo directly.

## What maps to what

| VTODO property | OpenTodo field | Notes |
| --- | --- | --- |
| `UID` | task id | A UID that is not a usable id (longer than 64 characters, unusual characters) is kept next to a generated id; the client always sees its own UID and resource name. |
| `SUMMARY` | title | |
| `DESCRIPTION` | description | The note's Markdown text. A change from a calendar app is folded into the rich-text note by the next app that opens it. |
| `DUE;VALUE=DATE` | due date without time | |
| `DUE` (floating) | due date and time | `DUE:20261011T093000` shows 09:30 in every time zone. |
| `DUE;TZID=…` | due fixed to a time zone | IANA zones and vendor paths ending in one (`/mozilla.org/…/Europe/Berlin`); a UTC time (`…Z`) becomes zone `UTC`; an unknown zone (Windows names) falls back to the floating wall time. Served with a matching `VTIMEZONE`. Seconds are dropped. |
| `DUE;VALUE=DATE` with a deadline | [deadline](tasks-and-projects.md#deadlines) | A task with a deadline is served with `DUE` = the deadline (always a date: a deadline has no time) and, when it also has a due date, `DTSTART` = the due date in the forms above. A `DUE` alone sent back for such a task changes the deadline. |
| `DTSTART` with a different `DUE` | due date, and deadline from `DUE` | A client that sends both dates sets the due date from `DTSTART` and the deadline from the day of `DUE` (a time on `DUE` is dropped, and the task is served back with `DUE;VALUE=DATE`). Equal `DTSTART` and `DUE` set the due date only. See [Scheduled times and estimates](#scheduled-times-and-estimates) for every shape. |
| `DTSTART` with a duration, no `DUE` | due date and time | A client that schedules a task as a start and a length (`ESTIMATED-DURATION` or `DURATION`) sets the due date from `DTSTART`; the deadline is kept. |
| `ESTIMATED-DURATION` | duration estimate | Served in hours and minutes (`PT1H30M`). A client that never sends it leaves the estimate alone. At most one week; a longer, zero or negative value is refused with 403. |
| `VALARM` | reminders | See [Alarms and reminders](#alarms-and-reminders). |
| `X-OPENTODO-START` | [start date or Someday](tasks-and-projects.md#when-a-task-starts) | `SOMEDAY` or a date `YYYYMMDD`; iCalendar has no property for a deferral. A client that drops the property leaves the task as it is; an unknown value is kept as client data. |
| `X-OPENTODO-EVENING` | This Evening | `TRUE` when set, absent otherwise. |
| `PRIORITY` | priority | Out: 1→1, 2→5, 3→9, 4→none. In: 1–3→1, 4–6→2, 7–9→3, 0 or absent→4. |
| `STATUS`, `COMPLETED`, `PERCENT-COMPLETE` | completed time | `COMPLETED` (or `CANCELLED`) sets it, `NEEDS-ACTION` reopens. `IN-PROCESS` and a partial `PERCENT-COMPLETE` are kept as client data. Completed tasks stay listed. |
| `CATEGORIES` | labels | By name, case-insensitive; an unknown name creates a label. Labels of other members on a shared task are kept. |
| `RELATED-TO` (parent) | parent task | Sibling and child relations are kept as client data. A parent not uploaded yet is kept until it exists. |
| `RELATED-TO;RELTYPE=DEPENDS-ON` | [Blocked by](tasks-and-projects.md#wait-for-another-task) | One line per blocker in the same calendar. A UID that is not in the calendar (yet) is kept as client data. Blockers in other projects of the same sharing are kept when a client sends the task back. A change that would make tasks wait for each other is refused with 403. |
| `RRULE` | recurrence | See below. |
| `CREATED` | creation time | Used when a task is created. |
| `DTSTAMP`, `LAST-MODIFIED` | | Derived from the newest change to the task. `SEQUENCE` is ignored. |
| everything else | `ical_extra` | Alarms the reminder model cannot express (sound or email alarms, repeating alarms, more than 20), `X-` properties, `URL`, `GEO`, `CLASS`, `DURATION`, a `DTSTART` that sets nothing, unsupported `RRULE`s… are stored verbatim in the task's opaque `ical_extra` field and returned unchanged, so a client never loses them when another device edits the task. |

Fields without a VTODO counterpart (project section, assignee, position, comments) are left untouched by CalDAV writes. A task moved to another list loses its section, as in the app.

### Scheduled times and estimates

What a VTODO does to the due date and the deadline depends only on which date properties it carries. A date the shape does not name is never cleared:

| The client sends | Due date | Deadline |
| --- | --- | --- |
| `DUE` only, task without a deadline | from `DUE` | none |
| `DUE` only, task with a deadline | cleared | from the day of `DUE` |
| `DTSTART` and `DUE`, equal | from `DUE` | unchanged |
| `DTSTART` and `DUE`, different, task without a deadline and `DUE` exactly its current due | from `DTSTART` (a move; the `DUE` is the one the client was served) | unchanged |
| `DTSTART` and `DUE`, different | from `DTSTART` | from the day of `DUE` |
| `DTSTART` and a duration, no `DUE` | from `DTSTART` | unchanged |
| `DTSTART` alone | unchanged (`DTSTART` kept as client data) | unchanged |
| neither, no duration | cleared | unchanged |

So a scheduling client such as Mitra, which writes `DTSTART` and `ESTIMATED-DURATION` without `DUE`, moves a task with a deadline or a repeat rule without erasing either. A task with a due **time** is served with `DTSTART` equal to `DUE`, so such clients show it as scheduled; when they move it and send the old `DUE` back unchanged, the task moves and gains no deadline. To give a task a deadline from a calendar app, change `DUE` (to another day than the start), or set the deadline in OpenTodo.

### Recurrence

Rules that the [recurrence grammar](recurrence.md) can express map both ways: `FREQ=DAILY/WEEKLY/MONTHLY/YEARLY` with `INTERVAL`, weekday lists, `BYMONTHDAY` (including `-1`), `BYDAY=2TU` / `-1FR`, the last weekday of the month, `UNTIL` and `COUNT`. A recurring task is served with `DTSTART` equal to its due date, like any task with a due time. A completion-relative rule (`every 3 days after completion`) is served as its plain interval and kept as is when the client sends the same `RRULE` back.

Completing a recurring task in a calendar app does what completing it in OpenTodo does: an occurrence record is added to Completed and the task moves to its next due date. Apple Reminders and DAVx⁵ apps that advance the due date themselves keep working: their edit is applied as an ordinary due-date change. Thunderbird's task list completes one occurrence as an override (`RECURRENCE-ID` with `STATUS:COMPLETED`); an override of the current occurrence completes it the same way. todoman finishes the task without its rule and creates the next occurrence as a new task, so that task carries on the series under a new id.

An `RRULE` the grammar cannot express (hourly rules, `BYHOUR`, several ordinals…) is kept in `ical_extra`: the calendar app keeps repeating the task, OpenTodo shows it as a plain task. Other per-occurrence overrides (`RECURRENCE-ID`) are not modelled and are dropped.

### Alarms and reminders

OpenTodo reminders are served as display alarms, one `VALARM` per reminder, with a `UID` (and Apple's `X-WR-ALARMUID`) that stays the same across fetches:

- "30 minutes before" → `TRIGGER;RELATED=END:-PT30M`. On a task with a deadline, where `DUE` is the deadline, it is `RELATED=START` (the due date) with `X-OPENTODO-KIND:RELATIVE`.
- A deadline reminder → `TRIGGER;RELATED=END:-P1D` with `X-OPENTODO-KIND:DEADLINE`.
- A reminder at a time → `TRIGGER;VALUE=DATE-TIME:20261012T180000Z`.

A display alarm a calendar app adds becomes a reminder: a relative trigger counts from the due date (from the deadline on a task that has one), a date-time trigger fires at that instant. Changing an alarm in the app changes the same reminder; removing it deletes the reminder, but only when the app had seen the task's alarms (it sent one back, or echoed the `X-OPENTODO-ALARMS` count the server adds), so an app that never shows alarms cannot delete reminders by accident. Reminders written by a calendar app follow every reminder rule: they move with the due date, are dismissed when the task is completed and show "a calendar app (CalDAV)" in the history.

Kept as client data, never a reminder: sound, email and procedure alarms, `REPEAT`/`DURATION` snooze patterns, a `RELATED=START` alarm on a task with no start, an offset beyond one year, and any alarm past the 20th. Delivered and dismissed state is not exchanged: dismissing a reminder in OpenTodo leaves the calendar app's alarm as it is.

Upgrading from a server without this mapping: alarms set earlier in a calendar app stay client data until the app saves the task again; from then on they are reminders.

## Lists, sharing and deletion

- **Discovery**: `/.well-known/caldav` redirects to `/dav/` with the server's full address (`OPENTODO_BASE_URL`, or the address the client used, behind a trusted proxy the forwarded one); a `PROPFIND` on the host root or on `/principals/…` is redirected the same way and an `OPTIONS` on the root reports the DAV capabilities, which is what Apple's clients need when they probe the root. The principal is `/dav/principals/<user id>/`, the calendar home `/dav/calendars/<user id>/`, the Inbox `…/inbox/` and each project `…/<project id>/`. Every other [workspace](workspaces.md) has its own Inbox at `…/inbox-<workspace id>/`, and outside the default workspace a list's name starts with the workspace's ("Work · Website", "Work · Inbox"). Moving a project to another workspace renames its list; the path stays. Archived and deleted projects are not listed. Another account's paths answer 404.
- **Shared projects** appear for every member. Viewers get a read-only list (writes answer 403); editors may add, change and delete tasks; renaming or recolouring needs admin or owner, deleting the list needs the owner.
- **Creating a list** in the app (MKCALENDAR) creates a project with that name and colour. Renaming or recolouring it (PROPPATCH) renames or recolours the project.
- **Deleting a list** moves the project to the Trash and its open tasks to the Inbox (for a shared project as copies, since a task never changes sharing scope). The Inbox cannot be deleted or renamed (403).
- **Deleting a task** moves it to the Trash: it disappears from every device and stays in the export until it is purged. Purged tasks disappear from calendar apps on their next sync. When a calendar app created a task under its own resource name or UID, the server remembers that name (`caldav_resources`); purging the task, purging its project, emptying the Trash or the Trash retention job removes the name in the same transaction, so nothing is left behind for tasks that no longer exist.
- **Moving a task between lists** changes its project. Moving into a list that is shared differently creates a copy there (keeping the calendar app's UID) and moves the original to the Trash, as the app does.

## Sync and conflicts

- Every change from a calendar app is applied with server time under the device id `caldav:<app password id>`, one operation per property that actually changed. The task history shows such changes as "a calendar app (CalDAV)".
- **ETags** change whenever anything the client sees changes, on any device. A write with a stale `If-Match` is refused with 412 and changes nothing; the client re-reads and retries. A write without preconditions is merged field by field like a REST `PATCH`.
- **CTag and sync token** (`urn:opentodo:sync:<n>`) are the position of your op log, shared by all your lists; incremental `sync-collection` reports list changed tasks and the removed ones (deleted, purged or moved away). Tokens never expire; a token from a future position (after restoring an older backup) is refused so the client starts over.
- Supported: `PROPFIND` (Depth 0 and 1), `REPORT` `calendar-query` (VTODO, `time-range`, `prop-filter` with `is-not-defined` and `text-match`), `calendar-multiget` and `sync-collection`, `GET`, `HEAD`, `PUT`, `DELETE`, `MKCALENDAR`, `PROPPATCH`, `OPTIONS` (`DAV: 1, 3, calendar-access`). A resource is at most 1 MB and its preserved properties at most about 60 KB; one content line may be at most 64 KB after unfolding.

## Limits

Not supported: events (VEVENT; to see other calendars' events in Day and Week, or to subscribe to your tasks from a calendar app that has no CalDAV, see [Calendar feeds](calendar-feeds.md)), scheduling and invitations, free/busy, calendar sharing through CalDAV (use project sharing), CardDAV, attachments, per-occurrence overrides, server-side recurrence expansion, and OpenTodo acting as a client of another CalDAV server.

Thunderbird and todoman were run against a real server with the scenario below (served due forms, deadlines, the date shapes, estimates, alarms, completing a repeating task, moves, deletion and incremental sync); what each sent is kept in `internal/caldav/testdata/thunderbird-158/` and `todoman-4.7/` and pinned by `internal/httpapi/caldav_clients_test.go`. The other rows rest on recorded-style fixtures and protocol tests (`internal/caldav/testdata/`, `caldav_interop_test.go`) until someone runs them on the real app:

| Client | Due forms | Deadline | Date shapes | Estimates | Alarms both ways | Recurrence completion | Moves | Deletion | Incremental sync |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Apple Reminders (iOS) | not verified (2026-10-21) | not verified (2026-10-21) | not verified (2026-10-21) | not verified (2026-10-21) | not verified (2026-10-21) | not verified (2026-10-21) | not verified (2026-10-21) | not verified (2026-10-21) | not verified (2026-10-21) |
| Apple Reminders (macOS) | not verified (2026-10-21) | not verified (2026-10-21) | not verified (2026-10-21) | not verified (2026-10-21) | not verified (2026-10-21) | not verified (2026-10-21) | not verified (2026-10-21) | not verified (2026-10-21) | not verified (2026-10-21) |
| Thunderbird 158.0.1 (Linux, 2026-10-22) | works; the task dialog writes times in your default time zone | works: Start is the due date, Due the deadline | works; clearing only Due keeps the due date (Start stays), clear both | kept (not shown) | works both ways; a changed alarm replaces the reminder | works: completing an occurrence in the task list completes it | dragging or changing Start moves the task; changing only Due sets a deadline | works | works (sync token) |
| todoman 4.7.0 + vdirsyncer 0.21.0 (2026-10-22) | works; times are rewritten in UTC (same instant) | works | works | kept (not shown) | kept (todoman has no alarms) | the next occurrence arrives as a new task; the done one keeps no rule | works | works | works (etags, no sync token) |
| DAVx⁵ + Tasks.org | not verified (2026-10-21) | not verified (2026-10-21) | not verified (2026-10-21) | not verified (2026-10-21) | not verified (2026-10-21) | not verified (2026-10-21) | not verified (2026-10-21) | not verified (2026-10-21) | not verified (2026-10-21) |
| DAVx⁵ + jtx Board | not verified (2026-10-21) | not verified (2026-10-21) | not verified (2026-10-21) | not verified (2026-10-21) | not verified (2026-10-21) | not verified (2026-10-21) | not verified (2026-10-21) | not verified (2026-10-21) | not verified (2026-10-21) |
| Mitra | not verified (2026-10-21) | not verified (2026-10-21) | not verified (2026-10-21) | not verified (2026-10-21) | not verified (2026-10-21) | not verified (2026-10-21) | not verified (2026-10-21) | not verified (2026-10-21) | not verified (2026-10-21) |

"Not verified" means the behaviour has not been tried on that client yet; the guide does not claim it works there. Testers are welcome: see issue #9.

## End-to-end encryption

CalDAV is not available for accounts with [end-to-end encryption](e2ee.md): calendar clients can neither read encrypted titles nor write them back, and serving placeholders would let a client overwrite the real titles. For such an account `/dav/` answers 403 and creating an app password answers 409 `encryption_enabled`; existing app passwords stop working until encryption is turned off.

## Downgrading

An older server answers 404 for `/dav/` and refuses `ical_extra` operations from newer devices. Remove the CalDAV accounts from your calendar apps before downgrading.
