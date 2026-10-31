# Design

## Context

`task-origin` made `origin` one whole LWW value `{kind, provider?, id?, url?, title?}` with a closed kind list, validated in one place (`internal/origin.Validate`, called by sync's `kOrigin` check, REST, the CLI, the agent tools, the importers and email) and mirrored in `web/src/lib/taskOrigin.ts`, both pinned by `internal/origin/testdata/origin_vectors.json`. The URL rule (`http`/`https` with a host) exists for one reason: the chip turns the URL into a link, and any other scheme is a script or app-launch vector. `obsidian-plugin` needs a task to point back to an Obsidian note, whose only stable link is Obsidian's own URI, `obsidian://open?vault=<name>&file=<path>`.

## Goals / Non-Goals

**Goals:** the plugin can write an origin that opens the exact note; the server, every client and both shells accept it; nothing else about the URL rule loosens.

**Non-Goals:** links to headings or blocks, other apps' schemes, recognising `obsidian://` links typed into quick add.

## Decisions

**D1. A new kind, not an allowed scheme on `url`.** Alternatives: (a) allow `obsidian://` on `kind: "url"`; (b) a generic `app` kind with a scheme allow-list; (c) `kind: "obsidian"`. (a) loosens the rule for every writer of the most common kind, including the capture screen and the browser extension, which never need it. (b) is an open-ended surface: each scheme has its own actions, and some (`obsidian://new`, `shortcuts://run-shortcut`) write or run things. (c) keeps the exception to one kind whose writers are known, and gives the chip an icon and a label of its own. Chosen: (c). The kind needs `id` (as every kind but `url` does) and `url`, and refuses `provider`, so `origin: obsidian` in a filter matches by kind with no grammar change.

**D2. One URL shape, checked structurally.** An `obsidian` origin's `url` SHALL parse as scheme `obsidian`, host `open`, empty path, no fragment, no user info, and a query with exactly the members `vault` (1–255 characters) and `file` (1–1024 characters), each once, at most 2048 bytes in all. Refused: `path=` (an absolute file-system path that leaks the user's directory layout and opens files outside a vault), any other action (`new`, `search`, `hook-get-address`, `adv-uri` from community plugins, which can write), any extra member. `id` is the vault-relative note path (`Daily/2026-10-29.md`) and must equal `file` with `.md` added when `file` has no extension; this ties the label to the link so a crafted origin cannot show one note's name and open another. Go (`origin.ValidObsidianURL`) and TypeScript (`obsidianURL`) implement it once each and run the same vectors.

**D3. The device guard is the security boundary for encrypted accounts.** The server validates plaintext origins only (`CheckValue` accepts ciphertext). So "Origin links open only http(s)" stays a device-side rule, now "http(s), or a D2-valid Obsidian link on an `obsidian` origin, checked after decryption". A `url` origin that decrypts to `obsidian://…` gets no link, like `javascript:` today.

**D4. Opening it.** Web: `openOrigin` assigns the URL to a hidden anchor and clicks it (`window.open` of a custom scheme leaves an empty tab in Chromium); the browser asks the user whether to open Obsidian, which is the platform's own consent. When nothing handles the scheme the browser does nothing; the chip's menu also offers "Copy link" for every origin with a URL, so the user is never stuck. Shells: `openExternal` today allows `https`, `http`, `mailto`, `tel` (`Bridge.kt:104`, iOS `Bridge.safeExternal`). Both gain `obsidian` for the D2 shape only and list a new capability `obsidian-links`; the web app checks `has('obsidian-links')` before calling. Without it (an older shell) the chip in a shell offers "Copy link" only. Alternative rejected: let the web view navigate to the custom scheme and rely on the system; Android's `WebView` would load an error page and iOS's `WKWebView` silently cancels, and both bypass the shells' single external-link path.

**D5. Labels and icon.** The chip reads the origin's `title` when set, else the last segment of `id` without `.md`, and uses the catalogue icon `notebook-pen` (no brand logo: `docs/design-system.md` forbids brand marks as icons). The tooltip is "Open in Obsidian: <vault> › <path>". `Label()` in Go returns the same, for the CLI and MCP.

**D6. Old clients and old servers.** Kind values are not a field: an old client's `originOf` accepts any string kind, labels it by `id` (the path) and opens nothing because the URL is not `http(s)`. That is the right degradation. An old server refuses the op (`origin kind must be one of …`), which rejects the push of that op only; `obsidian-plugin` reads the server version and never writes the kind to a server older than this change. Mixed devices on a new server converge as before: the value is one LWW register.

## Data model impact

None beyond the enum value. No migration: existing rows hold the four old kinds. Export and import carry the origin unchanged; the importer's own validation (same package) accepts the new kind.

## Progressive disclosure

Nothing new for anyone who does not use Obsidian: the kind only appears on tasks that a plugin, the API or an agent created with it. No setting.

## Interface budget

No new chrome. The chip is an existing neutral chip in the row and the panel's facets; the row still shows at most 7 properties.

## Size

About 60 lines of Go and 60 of TypeScript, ten vector cases, a line in each shell. No dependency; no image, binary or bundle change worth measuring.

## Risks

- **A note renamed in Obsidian breaks the link.** Accepted: Obsidian's URI has no stable note id. `obsidian-plugin` updates the origin of tasks it knows when it sees the rename (its D-rename), and the chip still shows the old name.
- **Vault names with special characters.** Percent-encoding is checked by the vectors (spaces, `&`, `#`, non-Latin names).
