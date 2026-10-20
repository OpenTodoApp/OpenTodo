# Design

## Context

See proposal.md for motivation. Today the source of a task is scattered: `web/src/lib/share.ts` `proposedDescription` appends the shared URL to the notes and nothing else keeps it; `internal/email/process.go` `taskOps` writes title, description, priority, `created_at` and `position` with device `server` and records the Message-ID only in the receipts table; `internal/importer/profile_linear.go` puts `ENG-123` at the start of the description and every named profile computes a `Row.SourceID` (`linear:ENG-5`, `todoist:<hash>:<n>`, `things:<uuid>`, `ticktick:<taskId>`) that the service remembers per user for `already_imported`. The task schema in `internal/sync/ops.go` has one object-valued kind already (`kDue`, checked member by member in `kinds.go`), and `checkAttachment` shows the pattern for an `http(s)`-only URL that is skipped when the value is ciphertext.

Constraints that shape the approach:

- The op log is field-level LWW; a value is one JSON document. End-to-end encryption (`web/src/lib/e2eeSync.ts`) encrypts only string values of the fields in `CONTENT_FIELDS`, and the server validates ciphertext as an opaque string.
- The server never fetches a user-typed address outside `internal/outbound`, and this change adds no outbound request at all.
- The filter grammar has three shapes a new term can take: a simple keyword (`blocked`), `no <thing>` (`no deadline`) and a prefixed text term (`search: text`), parsed identically in `internal/filter/filter.go` and `web/src/lib/filter/parse.ts`; evaluation is client-only (`evaluate.ts`).
- Icons come only from the vendored set in `web/src/ui/icons/names.json` (102 names; among them `link`, `external-link`, `at-sign`, `download`, `globe`, `inbox`, `hash`; no tracker logos).
- Row metadata uses three styles (`task-list-presentation` "Metadata language"); the panel shows set properties as `PropertyChip`s (`web/src/app/task-detail/Properties.tsx`) and offers the rest from an Add menu built by `usePropertiesModel.ts`.
- Go ports of web logic are pinned by shared vectors (`internal/recurrence`, `internal/zoned`, `internal/quickadd`); the same pattern fits URL recognition.

## Goals / Non-Goals

**Goals:**
- One additive field, validated once in the schema, flowing unchanged through sync, REST, export, webhooks, MCP and the importer with no per-reader special case beyond "show it".
- Provider and id derived by one table that exists twice (Go and TypeScript) and is proven equal by one vector file, so a URL captured on the phone, through the CLI or by an assistant yields the same origin.
- The chip is a link, not a button that opens a menu: one click reaches the source.
- Nothing fetched: no favicon, no page title, no issue state.

**Non-Goals:**
- No editor to type an origin by hand (notes and link attachments cover a pasted link); no quick-add syntax.
- No change to the importer's duplicate detection; no polling of trackers (`issue-import`).
- No origin on projects, comments or attachments.

## Decisions

**D1. One object register `task.origin`, not five fields.** `Schema["task"]["origin"] = kOrigin`, a new kind in `kinds.go` checked like `kDue`: `null`, a ciphertext string (`e2ee.IsCiphertext`), or an object with `kind` ∈ {`url`, `email`, `issue`, `import`}, optional `provider` (`^[a-z0-9-]{1,32}$`), `id` (≤ `MaxOriginID` = 512 runes), `url` (`url.Parse`, scheme `http`/`https`, non-empty host, ≤ `MaxOriginURL` = 2048 bytes), `title` (≤ `MaxOriginTitle` = 500 runes, the capture screen's title limit); `kind: url` requires `url`, the other kinds require `id`; unknown members are refused (decode into a struct with `DisallowUnknownFields`). Alternative: `origin_kind`, `origin_provider`, `origin_id`, `origin_url`, `origin_title` as separate LWW fields, each a string the existing e2ee hooks already handle. Rejected: two devices setting different origins would converge to a mix (one device's `url` under the other's `provider`), and five fields on every row, export and payload for one concept is noise. The object converges whole, as `due` does.

**D2. Encrypted accounts encrypt the object as one string.** `"origin"` joins `e2ee.ContentFields["task"]` and `CONTENT_FIELDS.task`. `title` and `url` are user content and `id` names the page or issue, so there is nothing worth leaving in the clear; `kind` alone would tell the server "this came from a tracker", which is more than it knows today. The hooks in `e2eeSync.ts` gain one serialisation step for non-string content values: `prepareOutgoing`, `afterApply` (encrypt-on-sight) and the migration job's `pending()` call `contentToString(entity, field, value)` (JSON for `task.origin`, identity for strings) before `encryptValue`; `decryptIncoming` calls `contentFromString` after `decryptValue`. A plaintext string can never be mistaken for an origin because the schema accepts only `null`, an object or ciphertext for the field. Server-side readers that present content (`internal/agenttools/data.go`, webhooks, the digest) already treat a ciphertext title as `e2ee.Placeholder`; for `origin` they emit nothing (`agenttools`) or pass the string through (webhooks, export), which the e2ee spec already allows. Alternative: encrypt only `title` and `url` inside the object. Rejected: it needs a second encryption shape in every hook and the AAD design (`entity\0id\0field`) does not name a member.

**D3. Recognition is a table, in Go and TypeScript, with shared vectors.** New package `internal/origin` with `Recognize(rawURL string) (Origin, bool)` and `web/src/lib/origin.ts` with `originFromUrl(url, title?)`, both reading the same rules and tested against `internal/origin/testdata/origin_vectors.json` (the web test imports the file as the recurrence vectors are imported). Rules, host-exact, path-anchored, no network:

| Host | Path | provider | id |
| --- | --- | --- | --- |
| `github.com` | `/{owner}/{repo}/(issues\|pull)/{n}` | `github` | `owner/repo#n` |
| `gitlab.com` | `/{path…}/-/(issues\|merge_requests)/{n}` | `gitlab` | `path#n` (`!n` for a merge request) |
| `*.atlassian.net` | `/browse/{KEY-n}` | `jira` | `KEY-n` |
| `linear.app` | `/{workspace}/issue/{KEY-n}[/…]` | `linear` | `KEY-n` |

A match gives `{kind: "issue", provider, id, url, title?}`; anything else `http(s)` gives `{kind: "url", url, title?}`; a non-`http(s)` URL gives nothing. Self-hosted trackers are not recognised (they are `url` origins); recognising them by path shape alone would misname unrelated sites. The table is the one place to extend later. Alternative: derive on the server for every write. Rejected: the API writes what it is sent (`docs/api.md`), the device must work offline, and the server would then own a second copy of the rule anyway.

**D4. Who derives, who validates.** The capture screen derives (`proposedOrigin(payload)` beside `proposedDescription` in `share.ts`, title cut to 500 characters as the title field is), the CLI derives (`--origin-url` through `internal/origin` before any request; `none` on `edit` sends `null`; a non-`http(s)` value exits 2 in `validateLocal`), the agent registry derives (`origin_url` on `create_tasks` and `update_tasks` items, planned into the change set as `origin`), and the importers set the object directly (Linear: `issue`/`linear`/the `ID` column, no URL; Todoist, Things, TickTick: `import`/profile name/the `SourceID` without its `<profile>:` prefix). REST accepts the object as sent. The server validates everywhere through `Validate`, so `internal/httpapi` needs no new code path: `handleCreate`/patch already refuse unknown and ill-typed fields through the schema; only the agent-token field allow-list in `internal/httpapi/agent_rest.go` gains `origin` for `POST`/`PATCH /tasks`, and the per-item `only(...)` list in `internal/agenttools/write_tasks.go` gains `origin_url`.

**D5. Email origin.** `taskOps` adds `{"origin", {"kind":"email","id":<Message-ID>}}` with op id `ids.NameID("email-op", userID+"\x00"+messageID+"\x00origin")`, so a re-poll produces the same op and stays idempotent. A missing Message-ID already yields no receipt; one over 512 runes skips the origin and logs at debug. No `url`: a `mailto:`/`message:` link is not `http(s)` and no client opens it reliably. The row chip reads "Email" (the Message-ID is an identifier, not a label).

**D6. Importers.** `importer.Row` gains `Origin *RowOrigin{Kind, Provider, ID}`; `plan_foreign.go` appends the `origin` field after `start` when set. Generic CSV/JSON rows leave it nil. `plan_own.go` already copies every schema field of an own export row, so the round trip needs only a test. The preview gains no column (the origin is visible on the task after import); the Linear description keeps its `ENG-123` prefix so existing fixtures and the `named_test.go` expectations change only by the added field. The sanitiser (`internal/importer/sanitize`) needs no change: ids are already synthetic in the fixtures.

**D7. The row chip.** In `TaskRow.tsx` after the estimate and before the custom-field badges: `<NeutralChip>` rendered as `<a href={url} target="_blank" rel="noopener noreferrer" data-origin>` when `origin.url` is set, else a `<span>`; icon by kind (`link` for `url` and `issue`, `at-sign` for `email`, `download` for `import`), text `origin.id ?? host(origin.url)` (`"Email"` for an email origin without a host), `aria-label` "Opens the source {text}" / "From {text}"; `onClick` stops propagation so the row does not open. `hasMeta` includes `task.origin`. Cards are `TaskRow` with `card`, so the board gets it for free. The `origin.title` is the chip's `title` attribute (tooltip). No new token or colour: it is a neutral chip. Alternative: tone text like the deadline. Rejected: the chip is an action (it opens something) and the metadata language reserves tone text for dates.

**D8. The panel chip.** `Properties.tsx` renders `<PropertyChip id="origin" icon={…} label={t('Origin')} value={text} note={origin.title}>` only when `task.origin` is set, with `onClear` → `updateTask(id, {origin: null})` (one op, offline like every clear) and an activation that opens the URL (`window.open(url, '_blank', 'noopener')`) when there is one, else does nothing. `usePropertiesModel.ts` leaves `origin` out of the Add menu list, so the "at most seven items on an empty task" budget is untouched. Keyboard: Tab reaches the chip, Enter opens, the clear control is the chip's existing remove affordance. No new shortcut: nothing in `web/src/lib/shortcuts.ts` changes.

**D9. Filter terms.** Go: `origin` in `simpleKeywords`, `origin` in `noKeywords`, and an `originPrefix` term mirroring `searchPrefix` (`origin:` then a bare word or quoted string). TypeScript: the same three in `parse.ts` (`{type: 'origin', value}` token; `Keyword` gains `'origin' | 'no origin'`), `evaluate.ts` (`origin` → `!!task.origin`; `no origin` → `!task.origin`; `origin: v` → `(task.origin?.provider ?? task.origin?.kind)?.toLowerCase() === v.toLowerCase()`), `suggest.ts` (after `origin:` offer the four kinds and the distinct providers found in the local tasks), `format()` prints `origin: ${quote(v)}`. `origin` becomes a reserved word (custom field "origin" needs quotes), consistent with "Custom field terms in the grammar". `docs/filters.md` grammar block and keyword table gain the three. A `Dexie` index is not needed: evaluation is a scan like every other term.

**D10. Palette search.** `web/src/app/palette/index.ts` appends `origin.id` and `origin.title` to the task entry's `secondary` text (the string the matcher already searches), so `eng-123` finds the task without a new index. Encrypted accounts search the decrypted local row as today.

**D11. Assistant-facing shape.** `taskOut` gains `Origin *originOut{Kind, Provider, ID}` and `taskText` (the `untrusted_text` object) gains `origin: {title, url}`, so the untrusted marking covers exactly the free text; for a ciphertext origin both are omitted and `Encrypted` is already true. Resources (`internal/agenttools/resources.go`) render through the same `taskOut`. The MCP tool list changes only by two optional properties; `tools/list` output in `docs/mcp.md` is regenerated.

**D12. Readable history and activity.** `web/src/lib/activity.ts` `FIELD_LABELS` gains `origin: msg('the origin')`; `internal/activity` derives `edited` for any other field already and the shared fixture needs no new case (a created task's origin is part of `created`). `historyVersions.ts` shows the origin's id or host as the field's readable value.

**D13. Webhooks and export need no code.** `BuildPayload` serialises the entity's fields and `changes`; `handleExport` dumps every field. Tests assert the new field is present; `docs/webhooks.md` and `docs/api.md` list it.

## Data model

Additive: `task.origin` (`kOrigin`, default none; clients read a missing value as `null` like `deadline`). No rename, no removal, no migration: SQLite stores op values as JSON already and the materialised task row gains the column through the existing "every schema field" projection (verify in `internal/sync` materialisation tests). `web/src/lib/types.ts` adds `origin?: Origin | null` with `Origin = {kind: 'url' | 'email' | 'issue' | 'import'; provider?: string; id?: string; url?: string; title?: string}`; `ops.ts` adds `origin: null` to `TASK_DEFAULTS`, `origin` to `COPY_FIELDS` (duplication and templates keep it) and an `origin?` input on `createTask`. `e2ee.ContentFields["task"]` and `CONTENT_FIELDS.task` add `"origin"`. Op values stay well under `MaxValueBytes` (the bound is 2048 + 512 + 500 characters plus keys).

Older servers refuse an op or body with `origin` as an unknown field (`invalid_input`); the web app ships inside the binary so it never runs against an older server, and `ot add --origin-url` against an older server prints that error verbatim (CLI "Server rejects the write"). Older devices that have not reloaded the app keep unknown fields in Dexie as today and show no chip until they update.

## Size and resources

No dependency. Web bundle about +3 KB gzipped: the row and panel chips (~0.6 KB), `origin.ts` (~0.6 KB), the three filter terms across parse, evaluate, suggest and format (~0.8 KB), the capture, palette and e2ee changes (~0.5 KB), strings (~0.3 KB per catalog, lazy). Binary about +40 KB: `kOrigin` and its tests, `internal/origin`, four importer profiles, one email op, the CLI flag and schema entry, the agent tool properties, the filter terms. Container image, runtime memory and the database schema unchanged. The filter scan reads one more field per task; no new index.

## Interface budget

- Rows of chrome above a list's first item: unchanged (no new header control).
- Task properties visible by default: the origin chip appears only when set, in the row's metadata line and the panel's chip row; an empty task still shows at most seven items (`budget.test.tsx`).
- Primary sidebar destinations: unchanged.
- Vertical scroll regions: unchanged.
- Shortcuts: none added; the chip is reached by Tab and activated by Enter like the other property chips.

## Risks / Trade-offs

- [A chip that is a link inside a row that opens on click] → `stopPropagation` on the chip and a test that clicking the chip does not open the panel; middle-click and Ctrl-click work as for any link.
- [The provider table goes stale or is too narrow] → it recognises four hosts by exact name and path shape only; everything else is an honest `url` origin, and the table is the single extension point for `issue-import`.
- [Linear import without a URL looks like a half origin] → the chip shows `ENG-123` without a link; the design leaves room for a URL when the workspace slug is known (an importer option in `issue-import`).
- [Object serialisation in the e2ee hooks is a new code path] → one helper pair, exercised by the e2ee vectors test with an origin value and by the migration test (encrypt existing plaintext origins on enable, decrypt on disable).
- [`origin` as a reserved word breaks a saved view that used a custom field named "origin" bare] → the client's parse error points at quoting, as for `due`; the server's view validation reports the same.
- [Title in the origin duplicates the task title at capture] → it is the page title as shared, kept so a later retitle still shows where the task came from; it is a tooltip, never a second line.
- [Message-ID in the open: a receiver of webhooks sees it] → it is already an identifier the mail system shows to everyone on the thread; the sender address is not stored.

## Migration Plan

Additive field; ships with the binary. No data migration. Rollback is reverting the commit: a server without the field refuses new `origin` ops as unknown, which is the existing behaviour for any unknown field; stored ops from the newer version are kept and ignored by the materialiser until the field returns. Docs (`sync.md`, `api.md`, `filters.md`, `capture.md`, `import.md`, `cli.md`, `mcp.md`, `webhooks.md`, `e2ee.md`) are updated in the same change.

## Open Questions

- Whether a Linear import should ask for the workspace slug to build issue URLs; deferred to `issue-import`, where polling needs the workspace anyway.
- Whether the demo seed should include one captured task so the chip is visible on the demo instance; harmless either way and decided at implementation.
