# Calendar apps (CalDAV)

OpenTodo can act as a CalDAV server for tasks, so Apple Reminders, Thunderbird, Nextcloud Tasks (through DAVx⁵) and other CalDAV clients become one more synced device. Each project is a task list (a calendar collection of VTODO resources), and the Inbox is its own list. Edits made in a calendar app are ordinary operations in the op log, so they converge with every other device under the usual rules: no "pick a version" dialogs.

Implemented by the OpenSpec change `caldav`. The endpoint lives under `/dav/` and needs no extra service, port or dependency.

## Turn it on

CalDAV is **off by default**: until the owner enables it, every path under `/dav/` and `/.well-known/caldav` answers 404 without asking for credentials.

1. As the owner, open **Settings → Calendar apps (CalDAV)** and tick *Allow calendar apps to sync with this server*. It takes effect immediately, no restart.
2. Deployments managed as code can set `OPENTODO_CALDAV=true` instead: it presets the toggle on the **first start only**; afterwards the Settings toggle decides.

Use HTTPS. Calendar apps send the app password with every request (HTTP Basic); on plain `http://` it travels unencrypted. Settings warns when the server address is not https. Set `OPENTODO_BASE_URL` to your public https URL so Settings shows the right address.

## Create an app password

Calendar apps sign in with **your account email and an app password**, never your account password, an API token or a single sign-on login (all of those are refused at `/dav/`). App passwords work only for CalDAV: they cannot call the REST API or change the account.

In **Settings → Calendar apps** enter a name (for example "iPhone") and choose *Create app password*. The password (`otap_…`) is shown **once**; copy it into the calendar app. Create one per device so you can revoke a lost phone without touching the others. The list shows when each was created and last used. Revoking takes effect on the next request. Deactivating an account revokes its app passwords; deleting it removes them.

Accounts with two-factor authentication or in SSO-only mode use app passwords like everyone else: creating one requires a recent sign-in (the same step-up check as API tokens). Failed sign-ins are limited to 10 a minute per address; after that the endpoint answers 429 for a minute.

## Client setup

The server address is `https://<your server>/dav/` (Settings shows it). The user name is your account email.

### Apple Reminders (iPhone, iPad, Mac)

- iOS / iPadOS: **Settings → Apps → Calendar → Calendar Accounts → Add Account → Other → Add CalDAV Account** (on older versions: Settings → Calendar → Accounts). Server: your server's host name (or the full address above), user name: your email, password: the app password. Under *Advanced settings* make sure SSL is on.
- macOS: **System Settings → Internet Accounts → Add Account → Add Other Account → CalDAV Account**, account type *Manual*, then the same values.
- Turn on **Reminders** for the account. Your projects appear as lists; new lists created in Reminders become projects.

### Thunderbird

**New Calendar → On the Network**, user name: your email, location: the server address. Thunderbird discovers the lists; tick the ones to show and enter the app password when asked. Tasks appear in the Tasks tab.

### Android: Nextcloud Tasks, Tasks.org, jtx Board (DAVx⁵)

In DAVx⁵ add an account with **Login with URL and user name**: base URL is the server address, then your email and the app password. Enable the task lists in the account's CalDAV tab and pick the tasks app DAVx⁵ should sync with.

### Nextcloud

The Nextcloud Tasks web app only shows calendars stored in Nextcloud itself. Use DAVx⁵ on Android, or any desktop client above, to reach OpenTodo directly.

## What maps to what

| VTODO property | OpenTodo field | Notes |
| --- | --- | --- |
| `UID` | task id | A UID that is not a usable id (longer than 64 characters, unusual characters) is kept next to a generated id; the client always sees its own UID and resource name. |
| `SUMMARY` | title | |
| `DESCRIPTION` | description | |
| `DUE;VALUE=DATE` | due date without time | |
| `DUE` (floating) | due date and time | `DUE:20261011T093000` shows 09:30 in every time zone. |
| `DUE;TZID=…` | due fixed to a time zone | IANA zones and vendor paths ending in one (`/mozilla.org/…/Europe/Berlin`); a UTC time (`…Z`) becomes zone `UTC`; an unknown zone (Windows names) falls back to the floating wall time. Served with a matching `VTIMEZONE`. Seconds are dropped. |
| `PRIORITY` | priority | Out: 1→1, 2→5, 3→9, 4→none. In: 1–3→1, 4–6→2, 7–9→3, 0 or absent→4. |
| `STATUS`, `COMPLETED`, `PERCENT-COMPLETE` | completed time | `COMPLETED` (or `CANCELLED`) sets it, `NEEDS-ACTION` reopens. `IN-PROCESS` and a partial `PERCENT-COMPLETE` are kept as client data. Completed tasks stay listed. |
| `CATEGORIES` | labels | By name, case-insensitive; an unknown name creates a label. Labels of other members on a shared task are kept. |
| `RELATED-TO` (parent) | parent task | Sibling and child relations are kept as client data. A parent not uploaded yet is kept until it exists. |
| `RRULE` | recurrence | See below. |
| `CREATED` | creation time | Used when a task is created. |
| `DTSTAMP`, `LAST-MODIFIED` | | Derived from the newest change to the task. `SEQUENCE` is ignored. |
| everything else | `ical_extra` | Alarms (`VALARM`), `X-` properties, `URL`, `GEO`, `CLASS`, `DTSTART`, unsupported `RRULE`s… are stored verbatim in the task's opaque `ical_extra` field and returned unchanged, so a client never loses them when another device edits the task. |

Fields without a VTODO counterpart (project section, assignee, duration estimate, position, comments, OpenTodo reminders) are left untouched by CalDAV writes. A task moved to another list loses its section, as in the app.

### Recurrence

Rules that the [recurrence grammar](recurrence.md) can express map both ways: `FREQ=DAILY/WEEKLY/MONTHLY/YEARLY` with `INTERVAL`, weekday lists, `BYMONTHDAY` (including `-1`), `BYDAY=2TU` / `-1FR`, the last weekday of the month, `UNTIL` and `COUNT`. A recurring task is served with `DTSTART` equal to its due date. A completion-relative rule (`every 3 days after completion`) is served as its plain interval and kept as is when the client sends the same `RRULE` back.

Completing a recurring task in a calendar app does what completing it in OpenTodo does: an occurrence record is added to Completed and the task moves to its next due date. Apple Reminders and DAVx⁵ apps that advance the due date themselves keep working: their edit is applied as an ordinary due-date change.

An `RRULE` the grammar cannot express (hourly rules, `BYHOUR`, several ordinals…) is kept in `ical_extra`: the calendar app keeps repeating the task, OpenTodo shows it as a plain task. Per-occurrence overrides (`RECURRENCE-ID`) are not modelled and are dropped.

### Alarms

Alarms set in a calendar app stay in that app's data (`ical_extra`) and fire there; they are not converted into OpenTodo reminders, and OpenTodo reminders are not served as alarms. When two calendar apps change a task's alarms concurrently, the later write wins for the whole set of preserved properties.

## Lists, sharing and deletion

- **Discovery**: `/.well-known/caldav` redirects to `/dav/`; the principal is `/dav/principals/<user id>/`, the calendar home `/dav/calendars/<user id>/`, the Inbox `…/inbox/` and each project `…/<project id>/`. Archived and deleted projects are not listed. Another account's paths answer 404.
- **Shared projects** appear for every member. Viewers get a read-only list (writes answer 403); editors may add, change and delete tasks; renaming or recolouring needs admin or owner, deleting the list needs the owner.
- **Creating a list** in the app (MKCALENDAR) creates a project with that name and colour. Renaming or recolouring it (PROPPATCH) renames or recolours the project.
- **Deleting a list** moves the project to the Trash and its open tasks to the Inbox (for a shared project as copies, since a task never changes sharing scope). The Inbox cannot be deleted or renamed (403).
- **Deleting a task** moves it to the Trash: it disappears from every device and stays in the export until it is purged. Purged tasks disappear from calendar apps on their next sync.
- **Moving a task between lists** changes its project. Moving into a list that is shared differently creates a copy there (keeping the calendar app's UID) and moves the original to the Trash, as the app does.

## Sync and conflicts

- Every change from a calendar app is applied with server time under the device id `caldav:<app password id>`, one operation per property that actually changed. The task history shows such changes as "a calendar app (CalDAV)".
- **ETags** change whenever anything the client sees changes, on any device. A write with a stale `If-Match` is refused with 412 and changes nothing; the client re-reads and retries. A write without preconditions is merged field by field like a REST `PATCH`.
- **CTag and sync token** (`urn:opentodo:sync:<n>`) are the position of your op log, shared by all your lists; incremental `sync-collection` reports list changed tasks and the removed ones (deleted, purged or moved away). Tokens never expire; a token from a future position (after restoring an older backup) is refused so the client starts over.
- Supported: `PROPFIND` (Depth 0 and 1), `REPORT` `calendar-query` (VTODO, `time-range`, `prop-filter` with `is-not-defined` and `text-match`), `calendar-multiget` and `sync-collection`, `GET`, `HEAD`, `PUT`, `DELETE`, `MKCALENDAR`, `PROPPATCH`, `OPTIONS` (`DAV: 1, 3, calendar-access`). A resource is at most 1 MB and its preserved properties at most about 60 KB.

## Limits

Not supported: events (VEVENT), scheduling and invitations, free/busy, calendar sharing through CalDAV (use project sharing), CardDAV, attachments, per-occurrence overrides, server-side recurrence expansion, and OpenTodo acting as a client of another CalDAV server.

The three target clients were exercised only with recorded-style fixtures and protocol tests in this repository (`internal/caldav/testdata/`, `internal/httpapi/caldav_test.go`); a manual run against real Apple Reminders, Thunderbird and DAVx⁵ installations is still pending.

## Downgrading

An older server answers 404 for `/dav/` and refuses `ical_extra` operations from newer devices. Remove the CalDAV accounts from your calendar apps before downgrading.
