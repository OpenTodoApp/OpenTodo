# Design

## Context

Quick add parses a line into a title and attributes with one grammar, implemented twice (`internal/quickadd` for the parse route, the CLI and routines; `web/src/lib/nlp` for the app) and pinned by the shared vectors. Link attachments already exist (`attachments` "Link attachments"): an attachment with an `http` or `https` URL, no bytes, size zero, synced as attachment ops in its task's scope. #1743 asks quick add to turn URLs into such attachments.

## Goals / Non-Goals

Goals: one more token, behaving exactly like the existing ones (tint, chip, dismissal, quoting, parsing switch), the same task from the same line on every surface, offline.

Non-goals: page titles or previews (an outbound request per link, against the no-third-party-calls rule); links in descriptions; links already in a title before an edit; routines and `ot time`.

## Decisions

### D1. A link token, on only where asked

The grammar gains a `link` token: a whitespace token starting `http://` or `https://` (case-insensitive), unquoted, with a non-empty host (the text between `://` and the first `/`, `?` or `#`, without a user and a port). A double quote ends a token, so a URL holding one is cut there. The URL is the token without its trailing `.,;:!?` and unbalanced closing `)` or `]`; the whole token leaves the title, so a sentence's full stop goes with its link (`Read the spec at https://x.example/a.` saves as `Read the spec at`). Link tokens are set aside before the other attributes are read, so no other grammar reads inside a URL. `links.go` and `links.ts` are the two copies, pinned by the shared vectors and the fuzz test.

The parser reads links only when the caller sets a context option (`Links` / `links`). Quick add in the app, title editing, the parse route and `ot add` set it. Routines (`internal/rules`) and `ot time` don't, so a routine that writes a URL into a title keeps doing so.

Alternative: always parse links. Rejected because it silently changes existing routines.

### D2. The chip and the saved task

The chip reads the host without `www.`, a port or a user, ASCII letters lowercased (the full URL is its accessible name and tooltip). Its colour is the neutral slate, since links have no attribute colour. On save, every link not dismissed and not quoted becomes, in order, a link attachment through the same path as **Attach → Add a link…**, which names it after its host and stores the URL as the browser normalises it. Its token leaves the title, and whitespace around it collapses like any token.

At most 5 links per line become attachments; the sixth and later stay in the title with no chip. A line whose title would be empty keeps the URL as its title and shows no chip. A link equal to the task's origin URL (share capture) is not attached; it already shows as the origin. Nor is a link the task already has (a title edit), or the same link twice. Links are created one millisecond apart, so the list, sorted by creation, shows them in the order typed.

A line with a link is never matched to an item of a reusable list (`reusable-lists` D3): the reused item would lose the link, and before this change the URL in the title kept the line from matching anyway. Before the first sign-in on a device there is no author for an attachment, so quick add and title editing do not read links at all (`links` follows the signed-in account): a URL stays in the title where it was typed, with no chip.

### D3. One operation set

The task create, its fields, its reminders and its link attachments are written in one `mutate()` (web) or one request sequence with one `Idempotency-Key` per attachment (`ot add`, via `POST /api/v1/tasks/{id}/attachments` with `{url}`). The web path works offline and uploads in one batch. The server's resolver already places an attachment whose task is in the same batch (`batchTasks`), so no sync change is needed. Encrypted accounts encrypt the link like any link attachment. Undo removes the task and its attachments together.

### D4. The parse route

`fields.links` is an array of the URLs in line order, present only when the line has links. It is additive, so older callers ignore it. Its chips carry kind `link` and read the host. The route always reads links. The shared vectors gain cases for: plain links, trailing punctuation, parentheses, quoting, more than five links, a URL-only line, a non-http scheme (`ftp://`, `javascript:` stay text), and a line with parsing off. Dismissal exists only in the app's parser, so its cases are in `links.test.ts`.

## Data model

No new entity or op field: link attachments and their fields exist. No migration.

## Interface budget

No new chrome. The link chip joins the existing chip row under the line (or the field rows of the command bar's Add mode). No new shortcut, no new task property in rows: the existing attachment count shows the link. No dependency: URL parsing uses the platform's `URL` and Go's `net/url`.

## Risks / Trade-offs

- A user who wanted the URL in the title must dismiss the chip. This is the same trade as dates, and quoting is the escape.
- Two implementations must agree on URL edges. The vectors are the contract, and the fuzz test in `internal/quickadd` gets the link token.

## Decisions of the owner (22 Nov)

1. On by default, like every other token; the per-device parsing switch turns it off with the rest.
2. Title editing reads links too, with the same chip and dismissal. As for every token, only text typed during the edit is read (`Parsing while editing a title`), so URLs already in a title stay.

### D5. Title editing

The panel's title field and the inline title editor parse with `links` on. On commit, the links typed during the edit become link attachments of the edited task, in the same undoable change as the other attributes. A viewer who cannot edit the task does not parse, as today.
