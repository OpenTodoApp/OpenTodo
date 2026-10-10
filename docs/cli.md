# Command-line client (`ot`)

`ot` is a small, statically linked client for the OpenTodo REST API. It is built for two audiences: people who live in a terminal (`ot add "Call the plumber" --due tomorrow`, `ot today`) and scripts, cron jobs and editor integrations that want stable JSON output and exit codes instead of hand-written `curl`.

It is an **online** client: it keeps no local copy of your tasks and makes no change when the server cannot be reached. Every write goes through the REST API, which records it in the operation log, so changes made with `ot` reach your phone and browser on their next sync and converge under the same per-field last-writer-wins rule as any other edit.

## Install

Release assets are published for linux, macOS and Windows on amd64 and arm64 (`ot-<os>-<arch>`); download one, make it executable and put it on your `PATH`. Or build from source (Go 1.26+, no other dependency):

```bash
go install github.com/pixari/opentodo/cmd/ot@latest   # into $(go env GOPATH)/bin
# or, from a checkout:
make cli                                              # -> bin/ot
```

The server container image does not include `ot`; it belongs on the machine you type on.

## Sign in

```bash
ot login https://todo.example.com
Email: you@example.com
Password:
Signed in to https://todo.example.com as you@example.com (profile "default").
Token "cli@laptop" stored in /home/you/.config/opentodo/config.json.
```

`ot login` signs in with your email and password, creates an API token named `cli@<hostname>`, signs the session out again and stores only the token. The password is never echoed and never stored. You will see the token in **Settings → API tokens** in the web app, where it can also be revoked.

Other ways to get credentials in:

| Command | Purpose |
| --- | --- |
| `ot auth set-token <token> --server <url>` | Store a token you created in Settings or with `ot token create` |
| `ot auth status` | Show the server, the account and the token name in use |
| `ot auth logout` | Revoke the stored token on the server and remove it locally |

### Configuration file and profiles

The config file lives in the platform's user configuration directory (`$XDG_CONFIG_HOME/opentodo/config.json` or `~/.config/opentodo/config.json` on Linux, `~/Library/Application Support/opentodo/config.json` on macOS, `%AppData%\opentodo\config.json` on Windows). It is written with owner-only permissions (`0600`, directory `0700`).

```json
{
  "default": "home",
  "profiles": {
    "home": { "url": "https://todo.example.com", "token": "ot_…" },
    "work": { "url": "https://tasks.corp.example", "token": "ot_…" }
  }
}
```

Pick a profile with `--profile work` or `OPENTODO_PROFILE=work`; `ot login --profile work <url>` creates one. Precedence, highest first:

1. Flags: `--server <url>`
2. Environment: `OPENTODO_URL`, `OPENTODO_TOKEN` (handy for cron and CI; no config file needed)
3. The selected profile

`OPENTODO_CONFIG=/path/to/config.json` points at another config file. No command ever prints a stored token.

## Tasks

```bash
ot today                       # due today or earlier, overdue first
ot inbox                       # tasks without a project
ot upcoming                    # due after today
ot list                        # every open task, soonest first
ot list --project Home         # one project (name or id)
ot list --completed            # most recently completed first
ot list --all --limit 20       # open and completed
```

Human output is a compact table: an id prefix, priority, due date and time (overdue dates are marked and shown in red on a terminal), project and title. Dates are evaluated in your local time zone. Tasks of archived projects stay out of the cross-project views, as in the web app.

```
ID        P   DUE                 PROJECT  TITLE
8c2a91f0  P2  2026-10-08 overdue  Home     Pay rent
3f1d7a22  P1  2026-10-10 09:00             Call the plumber
```

### Add and edit

```bash
ot add "Call the plumber" --project Home --due tomorrow --time 09:00 --priority 2
ot add "Read the sync design" --label reading --label work --note "docs/sync.md"
ot edit 8c2a --priority 1 --due friday
ot edit 8c2a --due none --project none --note ""     # clear values
```

| Flag | Meaning |
| --- | --- |
| `--project <name-or-id>` | Project; `none` (edit) moves the task to the Inbox |
| `--due <when>` | `YYYY-MM-DD`, `today`, `tomorrow` or an English weekday name (next occurrence; `monday` on a Monday means next week); `none` (edit) clears the date |
| `--time HH:MM` | Due time, 24-hour; with `ot add` and no `--due` the date is today |
| `--priority 1..4` | 1 is highest, 4 is the default |
| `--label <l>` | Repeatable; a label name (case-insensitive) or id. Unknown names create the label. With `ot edit` the given labels replace the list |
| `--note <text>` | Description; `--note ""` clears it |
| `--title <text>` | New title (`ot edit` only) |

`ot add` prints the new task's id (the whole task with `--json`). Priority, time and date are validated locally before any request is sent.

### Complete, reopen, delete

```bash
ot done 8c2a 3f1d          # one or more references
ot reopen 8c2a
ot rm 8c2a                 # asks on a terminal; --yes for scripts
```

A `<ref>` is a full task id or an id prefix that matches exactly one non-deleted task. An ambiguous prefix changes nothing, exits with code 2 and lists the candidates; with several references all are resolved before anything is changed. Scripts should use full ids from `--json`. `ot rm` is a soft delete: the task becomes a tombstone that still appears in the export.

## Projects

```bash
ot project list [--all]                 # --all includes archived projects
ot project add "Garden" [--color "#22c55e"]
ot project rename Garden "Back garden"
ot project archive Garden [--undo]
ot project rm Garden [--yes]
```

Projects are referenced by name (case-insensitive), full id or unique id prefix.

## Tokens and export

```bash
ot token list
ot token create backup-script           # prints the secret once, with a notice on stderr
ot token revoke backup-script           # by name, id or id prefix
ot export                               # full JSON export (including tombstones) to stdout
ot export --out opentodo-$(date +%F).json
```

## Scripting: JSON output and exit codes

Every command accepts `--json`. Stdout then holds only JSON, with the same field names as the [REST API](api.md): an array for lists, the entity for single results, and the error envelope `{"error":{"code":"…","message":"…"}}` on failure. Nothing else is printed on stdout in that mode, and errors from the server are passed through unchanged.

```bash
ot list --json --today | jq -r '.[] | "\(.priority) \(.title)"'
ot add "Nightly backup check" --json | jq -r .id
```

Exit codes:

| Code | Meaning |
| --- | --- |
| 0 | Success |
| 1 | The server rejected the request (its message is printed verbatim) |
| 2 | Usage or local validation error (bad flag, invalid priority or date, ambiguous reference, missing configuration) |
| 3 | Authentication or configuration error (wrong password, revoked token, unreadable config file) |
| 4 | The server could not be reached within the timeout (15 s) |

When stdout is not a terminal, or `NO_COLOR` is set, colour is off and nothing is prompted (`ot rm` deletes without asking; pass `--yes` to be explicit). `ot login` reads the password from stdin when stdin is not a terminal.

### Cron example

A nightly export kept for 30 days, using environment variables instead of a config file:

```cron
# m h dom mon dow  command
0 3 * * *  OPENTODO_URL=https://todo.example.com OPENTODO_TOKEN=ot_… /usr/local/bin/ot export --out /backups/opentodo-$(date +\%F).json && find /backups -name 'opentodo-*.json' -mtime +30 -delete
```

Or add a reminder task every Monday morning:

```cron
0 8 * * 1  OPENTODO_URL=… OPENTODO_TOKEN=… /usr/local/bin/ot add "Weekly review" --due today --time 17:00 --priority 2 >/dev/null
```

## Limits

- Online only: no offline queue, no local cache. Offline capture is what the web app and PWA are for.
- `--due` understands a fixed set of words; the natural-language quick-add grammar lives in the web client.
- Rate limits on `auth/login` apply (10 per minute per address); `ot auth set-token` avoids them entirely.
- No shell completion scripts yet.
