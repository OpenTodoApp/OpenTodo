# Design

## Context

Quick add parses a line into a title and attributes with one grammar, implemented twice (`internal/quickadd` for the parse route, the CLI and routines; `web/src/lib/nlp` for the app) and pinned by the shared vectors. Link attachments already exist (`attachments` "Link attachments"): an attachment with an `http` or `https` URL, no bytes, size zero, synced as attachment ops in its task's scope. #1743 asks quick add to turn URLs into such attachments.

## Goals / Non-Goals

Goals: one more token, behaving exactly like the existing ones (tint, chip, dismissal, quoting, parsing switch), the same task from the same line on every surface, offline.

Non-goals: page titles or previews (an outbound request per link, against the no-third-party-calls rule); links in descriptions; links in title edits, routines and `ot time`.

## Decisions

### D1. A link token, on only where asked

The grammar gains a `link` token: a run starting `http://` or `https://` (case-insensitive) up to whitespace, with trailing `.,;:!?` and an unbalanced closing `)` or `]` left outside, and a host that parses as a URL. Quick add parses links only when the caller sets a context option (`Links`). Quick add in the app, the parse route and `ot add` set it. Routines (`internal/rules`), `ot time` and title editing don't, so a routine that writes a URL into a title keeps doing so.

Alternative: always parse links. Rejected because it silently changes existing routines.

### D2. The chip and the saved task

The chip reads the host without `www.` (the full URL is its accessible name and tooltip). Its colour is the neutral chip colour, since links have no attribute colour. On save, every link not dismissed and not quoted becomes, in order, a link attachment named as **Attach → Add a link…** names it today (the URL's last path segment, else the host). Its token leaves the title, and whitespace around it collapses like any token.

At most 5 links per line become attachments; the sixth and later stay in the title with no chip. A line whose title would be empty keeps the URL as its title and shows no chip. A link equal to the task's origin URL (share capture) is not attached; it already shows as the origin.

### D3. One operation set

The task create, its fields, its reminders and its link attachments are written in one `mutate()` (web) or one request sequence with one `Idempotency-Key` per attachment (`ot add`, via `POST /api/v1/tasks/{id}/attachments` with `{url}`). The web path works offline and uploads in one batch. The server's resolver already places an attachment whose task is in the same batch (`batchTasks`), so no sync change is needed. Encrypted accounts encrypt the link like any link attachment. Undo removes the task and its attachments together.

### D4. The parse route

`fields.links` is an array of `{url, name}` in line order, present only when the line has links. It is additive, so older callers ignore it. Its chips carry kind `link`. The shared vectors gain cases for: plain links, trailing punctuation, parentheses, quoting, dismissal, more than five links, a URL-only line, a non-http scheme (`ftp://`, `javascript:` stay text), and a line with parsing off.

## Data model

No new entity or op field: link attachments and their fields exist. No migration.

## Interface budget

No new chrome. The link chip joins the existing chip row under the line (or the field rows of the command bar's Add mode). No new shortcut, no new task property in rows: the existing attachment count shows the link. No dependency: URL parsing uses the platform's `URL` and Go's `net/url`.

## Risks / Trade-offs

- A user who wanted the URL in the title must dismiss the chip. This is the same trade as dates, and quoting is the escape.
- Two implementations must agree on URL edges. The vectors are the contract, and the fuzz test in `internal/quickadd` gets the link token.

## Open questions for the owner

1. On by default, or opt-in under Settings → Quick add? The proposal says on, like every other token.
2. Should a link typed during a title edit (`Parsing while editing a title`) become an attachment too? The proposal says no: links already in the title stay put anyway, but a pasted link silently leaving the title of an existing task may surprise.
