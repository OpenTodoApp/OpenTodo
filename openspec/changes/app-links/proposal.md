## Why

A task often starts in another app: a note in Obsidian, a mail, a paper in Zotero, a page in OneNote. Those apps have URL schemes that open exactly that item (`zotero://select/…`, `mid:<message-id>`, `message:`, `onenote:`), but OpenTodo renders only `http(s)` and `mailto` links in notes and accepts only `http(s)` origins (plus the one `obsidian://open` shape). So the way back to the context is copy and paste (GitHub issue 1287, from a user who mapped it out in detail).

Some schemes act instead of opening, and encrypted content can only be checked on the device, so this has to stay opt-in, personal and checked where the link is opened.

## What Changes

- **Links to other apps** in Settings: a personal list of URL schemes, empty by default, synced to the person's devices (an encrypted field on end-to-end encrypted accounts). Nothing changes for anyone who adds none.
- A fixed **deny list** no setting overrides: `javascript`, `data`, `vbscript`, `file`, `blob`, `about`, `filesystem`, `view-source`, `intent`, `opentodo`, and `http`/`https`/`mailto`, which already have their own rules.
- Links are **stored as written** (when well formed and not denied) and **made clickable at render time** against the viewer's own list, so one person's list never changes what others see on a shared project.
- The first time a scheme is opened **on a device**, a confirmation shows the full link ("Open in another app?") with "Don't ask again for `zotero:`".
- **Where:** note and comment Markdown links; a `url` origin may carry an allowed scheme; a CalDAV VTODO `URL` with a well-formed non-denied scheme becomes the task's origin when it has none.
- **Shells:** the Android and iOS shells hand such a link to the system only when its scheme is on the list the page passes and not on the deny list (new capability `app-links`).

## Capabilities

### New Capabilities

- `app-links`: the scheme list, the deny list, render-time checks, the per-device confirmation, origins and CalDAV `URL`, the shells.

### Modified Capabilities

- `task-management`: Origin validation accepts a `url` origin with a well-formed non-denied scheme (written into the Origin validation requirement when this change is implemented).

## Impact

- One `user_prefs` field (`app_link_schemes`, content). No new dependency, no network request, no server-side link check beyond the grammar and the deny list.
- Older clients: a `url` origin with another scheme fails their `http(s)` check and shows as a plain label; notes show such links as text, as today.
