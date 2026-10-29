# Design

## D1. A personal entity, `frame`

A frame belongs to one person's week, not to a project, so it is a personal entity like `rule` and `place`: it resolves to the author's personal scope, syncs to their own devices only and never to project members, and its ids are unique (entity-id-ownership). Fields, all additive in `internal/sync/ops.go` `Schema`:

| Field | Kind | Default | Meaning |
|---|---|---|---|
| `title` | `kString`, **Content** | `""` | "Deep work"; at most 200 characters (client check; server checks the op size) |
| `weekdays` | `kWeekdays` (new) | `""` | ISO weekdays as a sorted comma list, `"1,2,3,4,5"`; empty = never shown |
| `start` | `kClock` (new) | `"09:00"` | wall time `HH:MM`, 15-minute steps (client check) |
| `end` | `kClock` (new) | `"10:00"` | wall time `HH:MM`, after `start` on the same day |
| `color` | `kString` | `"#64748b"` | a hex colour, drawn through the project palette's nearest hue like a project |
| `source` | `kString` | `""` | planning source key: `project:<id>`, `label:<id>` or `view:<id>`; ids only, not content |
| `from_date` | `kDate` | `null` | first day it applies (inclusive) |
| `until_date` | `kDate` | `null` | last day it applies (inclusive) |
| `position` | `kNumber` | `0` | order in the Frames dialog |
| `created_at` | `kNumber` | `0` | Unix ms |
| `deleted_at` | `kNullableNumber` | `null` | tombstone |

`kClock` accepts exactly `HH:MM` with `00:00`–`23:59`; `kWeekdays` accepts `""` or a comma list of distinct digits `1`–`7`. Both are validated by the server like every kind, and by the client before writing. A frame whose `end` is not after `start` (possible after two concurrent edits, one of each field) is kept and **not drawn**, and the Frames dialog marks it "Times need fixing"; no write repairs it automatically, because a repair from two devices would itself conflict. Every field converges by last-writer-wins per field; deletion is a tombstone.

Alternatives considered:
- An RRULE (`kRecurrence`) instead of a weekday list. Rejected: frames are weekly by nature (the "ideal week"), and an RRULE brings monthly and yearly cases the band and the dialog would have to explain. Weekdays plus a date range cover Morgen's frames.
- Frames as a kind of task (a recurring task with a flag). Rejected: they would leak into lists, counts, CalDAV, the vault and project sharing, and every reader would have to skip them.
- A field on `user_prefs` holding all frames as one JSON value. Rejected: one LWW value for the whole set would lose a frame added on the phone while another was edited on the laptop.

Data model impact: one new entity and its materialized table (migration `NNNN_frames.sql`, following `rules`), two new kinds. Nothing renamed. Export includes frames under `frames`.

## D2. Occurrences are derived, floating and never stored

A frame occurs on date `d` when `d`'s ISO weekday is in `weekdays`, `from_date` is null or not after `d`, and `until_date` is null or not before `d`. Its times are floating wall times in the viewer's zone, like a floating due: a 09:00 frame is at 09:00 wherever the user is. Occurrences are computed on the device for the shown range (`web/src/lib/frames.ts`); nothing is materialized per day. The Go side (`internal/frames`, for the MCP tool and CLI) uses the same rule, pinned by shared vectors `web/src/lib/frames.vectors.json`.

## D3. A background band, never an obstacle

Day and Week draw a frame occurrence as a band from `start` to `end` across the column, below every block layer: a soft tint of the frame's hue at a lower strength than a task block's fill, no border except a 1 px top hairline in the hue, and the title with the time range at the top-left in the faint tone, truncated. Two overlapping frames on one day split the column width like overlapping blocks. A band:
- takes no pointer events except on its title, so drags, drops, resizing, the empty-slot menu (`calendar-clarity`) and the now line behave exactly as without it;
- is not a drop target; a task dropped inside it gets the slot's time as today;
- does not count toward capacity (`time-blocking` "Overlap and capacity" is unchanged);
- is not an obstacle for `replan-the-day`, which only avoids tasks, busy events and slots.

Blocks on top of a band keep their full contrast against the grid (the band's tint is lighter than the 3:1 the edge needs). Bands of days before today are dimmed like past blocks.

Alternative: draw frames as outlined boxes like free events. Rejected: they would read as appointments and compete with blocks. A tint reads as "this stretch is for…".

## D4. Plan from a frame

The title is a button. Its popover shows the title, "Mon–Fri · 09:00–11:00", the source's name, and three actions:
- **Plan from this frame**: opens the planning list (`time-blocking` "Planning list and phone agenda") with the frame's source (or keeps the current source when the frame has none) and remembers this occurrence as the **placement target** while the list is open. Pressing `s` on a list task then proposes the first free 15-minute start inside the occurrence that fits the task's estimate (30 minutes when unestimated), falling back to the usual proposal when none fits. Nothing is placed until the user confirms with Enter or a drop, as today.
- **Edit**: opens the frame form.
- **Delete**: tombstones the frame, with Undo.

A source that no longer exists reads as no source (the list keeps its current source), and is kept, like a deleted label in the planning list.

## D5. Managing frames

- **Frames…** in the Day and Week overflow menu opens a dialog listing the user's frames in `position` order: colour dot, title, weekdays and times, with Add, Edit, Delete and drag or Alt+Up/Down to reorder. Empty state: one sentence ("Frames shade the hours you keep for one kind of work.") and Add.
- The form: Title (Field), Repeat on (seven toggle buttons, the week starting on the user's first day of the week), Start and End (time fields in the user's time format, 15-minute steps), Colour (the project colour picker), Plan from (the Combobox of projects, labels and saved views, optional), Starts and Ends (optional dates, under "More options").
- The command palette's **New frame** opens the same form. `calendar-clarity`'s empty-slot menu adds **New frame here…** with the weekday and the slot's start (end one hour later) prefilled; until that change lands the menu entry is simply absent.
- At most 50 live frames per user; the 51st is refused in the form with a message and by the REST route with a 422.

Progressive disclosure: nothing appears on the grid until a frame exists; the only entry points are an overflow item and a palette command. Simple-list users never see frames; Today, lists and the sidebar are unchanged.

## D6. Phone

Below 640 px the Week is a vertical agenda. A frame occurrence is a heading line inside its day, "Deep work · 09:00–11:00" in the faint tone with the hue's dot, placed before the first timed task that starts inside it, or at its start time's position when none does; it never takes a row of chrome. The Day view on a phone draws bands as on a desktop. The popover becomes a bottom sheet.

## D7. API, CLI, MCP

- REST (`internal/httpapi/frames.go`): `GET /api/v1/frames` (signedIn; `read`, `full`, `agent`, `admin` tokens), `POST /api/v1/frames`, `PATCH /api/v1/frames/{id}`, `DELETE /api/v1/frames/{id}` (signedIn; refused to `read` and `agent` tokens with 403). Writes are built as ops and applied with `ApplyStrict`, then `NotifyApplied`. Invalid weekdays, times or dates answer 422 with the error envelope; an unknown id 404. On an encrypted account, the API returns the title as stored (ciphertext) with `"encrypted": true`, and refuses a plaintext title write with 409 `encrypted_account`, as for other content.
- CLI: `ot frames` (table and `--json`), `ot frames add "Deep work" --days mon-fri --from 09:00 --to 11:00 [--color] [--source label:deep]`, `ot frames rm <id>`.
- Agent tools and MCP: read tool `list_frames` (occurrences for a date range, titles through `e2ee.Display`, marked untrusted text) and the resource `opentodo://frames`. No write tool here; an assistant uses frames to propose ordinary due edits.
- Route matrix and `docs/api.md` updated; `policy_test.go` covers the new routes.

## D8. Encrypted accounts, offline, sharing

- `frame.title` is a content field: encrypted on the device, decrypted for display; the server and MCP degrade to "Encrypted frame" through `e2ee.Display` when they cannot read it (with `ot mcp --decrypt` the local bridge shows it).
- Offline: frames are created, edited and drawn from local data; ops upload on the next sync.
- Sharing: frames are personal. A shared project used as a frame's source still works; a member's frames never reach another member.
- Viewers: a frame is the viewer's own and fully editable by them, whatever their role in the source project.

## D9. Size and budget

No dependency. The dialog and form are a lazy chunk (about 3 KB gzip), the band and the occurrence logic about 1 KB in the calendar chunk; the server adds one table, one handler file and a small Go package. Memory: occurrences are computed per shown range (at most 7 days × 50 frames).

Interface budget (docs/interface-guide.md): no row of chrome (Frames… is an overflow item), no task property, no sidebar destination, no scroll region (bands live in the grid's existing scroller), and one palette command without a default key, so no shortcut conflict.
