# Design

## Context

Notes are `task.description`, a string under per-field last-writer-wins (`docs/sync.md`). Everything else about the data layer is settled and must stay: one op per field, LWW on `(ts, device)`, `fields` materialization on the server, Dexie rows with a per-field clock on the client, REST write-through with `device="server"`, 64 KB per value. The bootstrap design (D2) deliberately deferred whole-document CRDTs and left the door open "for notes/comments only". The server must not need to understand documents (keeps the binary small, keeps `e2ee` possible). The client bundle is ~110 KB gzipped today.

## Goals / Non-Goals

**Goals:**
- Concurrent note edits merge; nobody loses a paragraph.
- Rich formatting with keyboard-first editing and Markdown input rules.
- API, export, previews and old clients keep working on plain text with no change.
- Server stays a dumb, schema-validating LWW store; no Go dependency.
- Reusable by comments without a second design.

**Non-Goals:**
- Presence (remote carets), images, tables, HTML rendering on the server, rich titles.
- Per-keystroke delivery as separate ops (see D3: the unit is a debounced full document state).

## Decisions

### D1. Full-state document as an LWW register, merge-and-republish on the client
`notes_doc` is a base64 string of the CRDT's full encoded state. It is a normal field in `Schema` (new kind `kDoc`: base64, max 256 KB) and a normal LWW register on the server and in Dexie. Convergence comes from the client rule: on receiving a `notes_doc` op that wins the LWW race, the client decodes it, merges it into its local document (CRDT merge is commutative, associative and idempotent), and if the merge added anything not already in the received state (compare state vectors), it emits a new `notes_doc` + `description` pair with a fresh timestamp. If the received state already contains the local state, it emits nothing.
- Why: the server, REST write-through, export, Pull/Apply, future compaction and a new device's catch-up are all untouched: one op holds the whole current document, so a fresh device never has to replay history. The op log stays a map of registers. The termination argument: a republish only happens when it strictly grows the known state; two devices republishing concurrently both produce the union, and the next merge of the union with itself grows nothing, so the loop stops after at most one extra round per device.
- Alternatives considered:
  - Per-keystroke CRDT updates as individual ops with server-side merging: needs a CRDT implementation in Go (a port of the chosen library exists but is large and lightly maintained; +3–5 MB binary), a new "append" field semantics that breaks compaction and the `fields` materialization, and makes every new device replay the full history. Rejected.
  - Updates as ops, merged only on clients, server stores the latest delta: REST GET and export would return garbage for the field, and a fresh device would depend on the full log never being compacted. Rejected.
  - Keep plain text, add three-way text merge at sync time: no stable base version exists per field; merges would be heuristic and non-convergent. Rejected.
  - Operational transformation with a central server: needs the server to be authoritative and online, violates local-first. Rejected.
- Known cost: the whole state is re-sent on every debounced change (D3). For notes measured in kilobytes this is cheaper than the sync request envelope itself.

### D2. Projection into `description`, and folding plain text back
Every document mutation emits two ops with the same `ts`: `notes_doc` and `description` (Markdown rendered from the document: `#` headings, `**`, `*`, `~~`, backticks, `[text](url)`, `-`, `1.`, `- [ ]`/`- [x]`). The client tracks which `description` it last projected; when a `description` op arrives whose clock is newer than the local `notes_doc` clock and whose device did not also send a `notes_doc` with that clock (REST writes, older clients), the client treats it as authoritative: it replaces the document body with the Markdown parsed into the document schema and republishes the pair. Older plain-text writes lose to a newer document by ordinary LWW, and the client re-projects `description` so the two fields agree again.
- Why: zero change for every consumer of `description`; integrations get Markdown for free; the rule is deterministic and uses only clocks the client already stores.
- Trade-off: "replace body" on a plain-text write means a concurrent rich edit elsewhere is overridden by the script's text once (LWW semantics for that one transition). That is the same guarantee plain text has today and only applies to writers that cannot speak documents.

### D3. Mutation granularity and outbox coalescing
The editor debounces 400 ms after the last keystroke (and flushes on blur, panel close, visibility change and before unload) and then calls `mutate()` with the pair. `mutate()` gains a coalescing rule for `kDoc` fields only: a pending outbox op for the same `(entity, entityId, field)` is replaced in place rather than appended, keeping one document per task in flight. The timestamp of the coalesced op is the newest one.
- Why: bounds outbox growth during a long offline writing session to one op per note; the server would discard the superseded states anyway.

### D4. Libraries and footprint
Chosen: Yjs (`yjs`, ~22 KB gzipped) for the document, ProseMirror (`prosemirror-model/state/view/commands/keymap/inputrules/schema-list`, ~45 KB gzipped) with `y-prosemirror` (~8 KB) for the editor. A `web/src/lib/richtext.ts` module owns encode/decode/merge, Markdown projection and parsing (a small hand-written renderer/parser for exactly the node set above, ~3 KB; no Markdown library), and the republish rule. The editor chunk is `import()`ed when the detail panel first mounts.
- Why Yjs: compact binary encoding, state-vector diffing (needed for the "did the merge grow the state" check), mature ProseMirror binding, deterministic without server coordination, tombstone garbage collection can be disabled per document for reproducible state. Automerge is 10× larger (WASM). A hand-rolled RGA would be smaller but is a research project.
- Why ProseMirror over a batteries-included editor kit: 2–3× smaller than the kits, fully keyboard-driven, schema-constrained so unknown marks can be preserved as opaque attributes (compatibility requirement). The node set is deliberately small.
- Footprint: initial bundle unchanged (lazy chunk); editor chunk ≈ 75–80 KB gzipped, loaded once per session and precached by the service worker. Memory: one Yjs document per open note, freed on panel close; a few hundred KB in the browser. Server: no new dependency, image size unchanged, runtime memory unchanged; per-field value cap raised from 64 KB to 256 KB for `kDoc` only (the 4 MB request cap still bounds a batch).

### D5. Data model impact
- Op schema: `task.notes_doc` (`kDoc`), additive. `description` unchanged. No rename.
- Server: no migration (fields are rows). Validation: base64-decodable, ≤ 256 KB, nothing else; the server never decodes the document.
- REST: `notes_doc` appears on task responses and is accepted on create/patch (validated the same way); `description` keeps its semantics and is documented as Markdown.
- Export: includes `notes_doc`; format version stays 1 (additive field).
- Client Dexie: `tasks` rows gain `notes_doc` (string, default `""`), `_clock.notes_doc`. Dexie schema version bump with no index change.
- Comments later: `comment.body_doc` + `comment.body` follow the identical pattern; `richtext.ts` is field-agnostic.

### D6. Editor behavior with remote changes
Remote merges are applied through the CRDT binding, which maps positions relatively, so the caret and the local uncommitted transaction survive. Formatting marks are stored in the document's attribute map; marks the client does not know are preserved verbatim on merge and rendered as plain text.

## Risks / Trade-offs

- [Document state grows with tombstones over the note's lifetime] → Yjs tombstones are a few bytes each and the 256 KB cap is roughly 100 K characters of history for a typical note; a "compact note" action that re-creates the document from its projection can be added later behind a confirmation, since it is a semantic reset.
- [Two devices republish merged states in a loop] → republish only when the merge strictly grew the local state vector relative to the received state; covered by `richtext.test.ts` convergence tests with randomized interleavings.
- [`description` and `notes_doc` disagree after partial delivery] → both ops carry the same `ts`, batches are applied atomically on the server and in one Dexie transaction on the client; the projection is re-derived on every merge, so a transient disagreement heals on the next op.
- [Bundle grows by ~80 KB] → lazy chunk, loaded only when a note is opened; report before/after sizes in the PR; `npm run build` budget check for the initial chunk.
- [Markdown round trip is lossy for exotic input] → the parser/renderer cover exactly the supported node set; unknown Markdown is kept as literal text, never dropped.
- [Yjs encoding changes across major versions] → pin the version; the field is base64 of the library's documented update format, which the library guarantees to read forward.
- [A malicious client sends a valid-looking but hostile document] → the server never decodes it; clients decode in a try/catch and fall back to rendering `description` with an "unreadable formatting" notice, so a bad value cannot brick the detail panel.

## Migration Plan

Additive. Existing tasks have no `notes_doc`; the client treats a missing or empty document as "build from `description`" on first open (the fold-back rule in D2), which emits the pair and upgrades the note lazily. No bulk migration, no downtime. Rollback: stop shipping the editor; `description` is intact and current for every note that was ever edited, because it is written in the same mutation.

## Open Questions

- Whether to expose a `?format=markdown|plain` switch on REST reads for integrations that cannot render Markdown (not needed for this change; `description` is Markdown).
- Where the per-note "compact history" action belongs once documents age (likely `trash-and-history`).

## Size evaluation (done before implementation)

The roadmap asked for "Yjs documents stored as op values; evaluate size impact first". Measured on 2026-10-10 with the build's own bundler (rolldown, minified, `gzip -9`), each candidate bundled alone with the exports the design needs:

| Candidate | Raw | Gzipped |
| --- | --- | --- |
| `yjs` 13.6.33 (Doc, updates, state vectors, XML types) | 77.6 KB | 22.7 KB |
| ProseMirror: model, state, view, transform, commands, keymap, inputrules, schema-list, history | 206.0 KB | 62.5 KB |
| Yjs + ProseMirror | 284.1 KB | 85.0 KB |
| Yjs + ProseMirror + `y-prosemirror` 1.3.7 (pulls `y-protocols`) | 308.8 KB | 93.4 KB |

Baseline before the change: the initial chunk was 847.1 KB raw / 248.4 KB gzipped (not ~110 KB as the Context section assumed; the app grew since), 879.9 KB / 257.5 KB after `e2ee` landed on main.

Document sizes (envelope = `"ydoc:v1:"` + base64 of the full Yjs state, measured in `web/`):

| Note | Markdown | Envelope |
| --- | --- | --- |
| Short structured note (heading, link, 3 check items, 3 numbered items) | 254 chars | 1.3 KB |
| The same note after 200 debounced edit sessions (≈1,000 characters typed, 400 deleted, a new Yjs client id per session) | 454 chars | 4.1 KB |
| One session typing 2,000 characters one keystroke per save (worst case, no debounce) | 2,000 chars | 2.8 KB |
| A 600-item check list | 29.3 KB | 97.5 KB |

Decoding plus re-encoding takes ~0.7 ms for the small note and ~10 ms for the 30 KB one (Node 22, in the test runner). The envelope is 3–5× the Markdown for structured text; the 256 KB document cap corresponds to roughly 60–80 KB of Markdown, so in practice the 64 KB cap on the `description` projection binds first (the client refuses a batch whose projection would not fit, see below). Tombstones are small: deleted text is garbage-collected to a few bytes per run.

**Decision: follow D4 (Yjs + ProseMirror), lazily loaded, without `y-prosemirror`.** The numbers match the design's estimate closely enough that no alternative (hand-rolled CRDT, Markdown-source editor) is warranted; a full-state register keeps the server untouched. `y-prosemirror` was dropped (−8.4 KB gzipped) because it deletes text whose marks the schema does not know, which contradicts "unknown formatting is preserved"; an in-house diff-based binding (~150 lines in `lib/richtext.ts`/`lib/richtextEditor.ts`) replaces it.

Shipped footprint (`npm run build`, branch merged with main):

| Chunk | Raw | Gzipped |
| --- | --- | --- |
| Initial `index-*.js` before → after | 879.85 KB → 883.92 KB (+4.07 KB) | 257.48 KB → 258.93 KB (+1.45 KB) |
| `richtext-*.js` (Yjs + document code), loaded when a note document is applied, written or opened | 90.97 KB | 28.26 KB |
| `NotesEditor-*.js` (ProseMirror + editor), loaded when a note is first opened | 221.78 KB | 68.85 KB |

Both lazy chunks are precached by the service worker, so they work offline after the first visit. Server: no Go dependency, binary size unchanged within noise, no migration. Client memory: one Yjs document per open note and one transient document per applied note op (freed afterwards), a few hundred KB at most.

## Implementation notes

Decisions taken while implementing; each keeps the goals above.

- **Envelope with a type marker (D1).** `notes_doc` is `""` or `"ydoc:v1:" + base64(Yjs update v1)`, not bare base64. The server accepts any `"<format>:v<n>:<base64 or base64url>"` envelope (`kDoc`, `MaxDocBytes` = 256 KB of envelope characters) and decodes nothing, so a future format, and the `e2ee` ciphertext `"enc:v1:…"` of the envelope, are valid without a server change. A client that cannot read a value (corrupt, other format, undecryptable) shows `description` with a notice and never overwrites it automatically.
- **Merge regardless of the winner (D1).** A received document is merged with the local one whether its op wins or loses last-writer-wins; the device republishes when the union contains anything the *stored winner* lacks. "Grew" is decided by applying the union to a copy of the winner and watching the Yjs transaction for new structs or deletions (state vectors alone miss deletion-only edits). The republished pair is stamped after the winner (`hlcSeed`), so it always wins.
- **Fold-back is deterministic (D2).** Folding a plain-text write creates a new root body named after that write's clock (`b:<ts>:<device>`), written by a Yjs client id derived from the name into an empty fragment, and deletes the older bodies' content; the greatest body name is the visible note. Two devices folding the same write produce byte-identical structures that merge into one copy (a naive "replace body" on two devices would duplicate the text). The fold runs when a note is opened (and before any republish), as the spec says; a description-only op arriving in the background changes nothing until then. The same fold upgrades legacy notes lazily.
- **Pairs inside `mutateMany` (D2/D3).** Every local batch that writes `notes_doc` merges it with the stored value inside the transaction (so a remote merge that arrived while the editor held an older copy is never undone) and sets `description` to the projection; a local plain-text `description` write to a task with a document (history restore, the plain-text fallback editor) is folded in with the batch's clock. The outbox keeps one pending `notes_doc` op per task. Limits checked before any op exists: document ≤ 256 KB, projection ≤ 64 KB JSON-encoded (the ordinary value cap), and for an encrypted account the e2ee 48,000-byte plaintext cap for the projection and ~196 KB for the document (its ciphertext must fit 256 KB). The editor refuses input that would cross the tighter of these and warns from 90 %.
- **Markdown dialect.** Italic is rendered as `_x_` (or `*x*` when it touches a letter or digit), so it never collides with `**`; a single newline is a hard line break (as in the comment renderer); characters that would read as Markdown are backslash-escaped; empty blocks are not projected. `parse(render(doc))` is a fixed point after one normalisation (fuzzed in `richtext.test.ts`). Unknown Markdown stays literal text.
- **Readers that present values to people** leave the opaque field out: revision history (server), the activity rule (server and client, shared fixture case), local activity recording, and webhook deliveries (a change that only touched `notes_doc` is no event). REST, export, import of the app's own export and sync carry it. MCP and CalDAV only ever used `description`.
- **Dexie.** `notes_doc` is not indexed, so no schema version bump is needed (rows without the field read `''`).
- **Comments** keep their single-author Markdown `body` in this change; `richtext.ts` is field-agnostic (`DOC_FIELDS` maps a document field to its projection field) so a `comment.body_doc` can follow the same pattern.
- **e2ee (merged while this change was implemented).** `notes_doc` is a content field in `internal/e2ee.ContentFields` and `CONTENT_FIELDS`; the envelope is encrypted as one opaque string at upload and decrypted before `applyOps`, so merging happens on plaintext documents.
