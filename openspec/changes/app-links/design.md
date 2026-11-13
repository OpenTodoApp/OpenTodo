# Design

## Context

- Note and comment Markdown go through `safeHref` (`web/src/lib/markdown.ts`): only `http(s)` and `mailto` become links; the editor (`richtextEditor.ts`) and the link dialog use the same check. Parsing happens on the device, after decryption.
- Origins are validated on both sides (`internal/origin`, `web/src/lib/taskOrigin.ts`, shared vectors): `url` must be `http(s)` with a host; `obsidian` has its own grammar (`obsidian-origin`, `obsidian-anchors`). The server cannot read an encrypted origin.
- The shells open external links through the bridge (`web/src/lib/shell.ts`, capabilities `links` and `obsidian-links`) and check them again natively.
- CalDAV keeps a VTODO `URL` it does not map in `ical_extra`.

## Goals / Non-Goals

**Goals:** a link back to an item in another app is one click away, for people who opt in, with no new way for one person's content to make another person's device act.

**Non-Goals:** registering OpenTodo as a handler; per-app integrations; links in task titles; a server-side list (the server never decides what opens).

## Decisions

### D1. The list is a personal, synced preference

`user_prefs.app_link_schemes`: a JSON array of lower-case scheme names (RFC 3986 `ALPHA *( ALPHA / DIGIT / "+" / "-" / "." )`, at most 32 characters each, at most 20 entries), `Content: true`. Optional narrowing per scheme (`obsidian` → `open`) is written `scheme:action` and matches the part after `scheme://` up to `?` or `/`. A client drops entries it cannot read and keeps the stored value.

*Alternative:* an owner-wide list. Rejected: the person who clicks is the one who chooses what their device opens.

### D2. One grammar and one deny list, shared

`appLink(url)` (TS) and `origin.AppLink` (Go): a scheme from the grammar, then `:`, then at most 2,048 bytes with no whitespace or control characters. The deny list is fixed in code and pinned by shared vectors in `internal/origin/testdata/app_links.vectors.json`, which the shells run too. `http`, `https` and `mailto` keep their own rules and never count as app links.

### D3. Stored as written, clickable at render time

Markdown keeps a link with a well-formed non-denied scheme as `{t: 'link', app: true}`; the renderer makes it clickable only when the viewer's list allows the scheme, else shows its text with the address in the tooltip. The server stores what it is sent (it cannot read encrypted notes anyway). A shared project's links therefore open only for members who allowed that scheme themselves.

### D4. Confirmation per device and scheme

Opening an app link shows a dialog with the full link and the app's scheme, with **Open** and "Don't ask again for `zotero:` on this device". The answer is a device preference (local storage, wrapped like every other per-device convenience); losing it only means the question comes back. Browsers ask again for external handlers anyway.

### D5. Origins and CalDAV

A `url` origin may carry an app link (D2). The chip shows the scheme's name, opens through D3 and D4, and is plain text for a viewer who did not allow the scheme. A CalDAV VTODO `URL` that is an app link becomes the task's origin when the task has none, and a later `URL` updates an origin CalDAV set; an `http(s)` `URL` keeps today's handling.

### D6. Shells

New capability `app-links`: the page passes the link and the viewer's list; the shell refuses a denied scheme or one not on the list, then hands the link to the system (`Intent.ACTION_VIEW` with no component; `UIApplication.open`). The list comes from the page, which the shell already trusts with the session; the deny list is the shell's own.

## Risks / Trade-offs

- **A scheme that acts** (`tel:`, a custom `deleteall:`): only on a device whose person allowed it, after a confirmation that shows the full link. Documented in the setting.
- **Older clients:** a `url` origin with an app link fails their `http(s)` check, so they show a plain label; Markdown shows the text. To verify against 1.0.0 before implementing (`compat-older-clients`).
- **Spam in shared projects:** links never open without the viewer's list and confirmation, and keep `rel="nofollow ugc noopener noreferrer"`.
