## Context

- **Agent tools have one home.** Every tool an AI agent can call is defined once in `internal/agenttools`. The remote MCP server (`internal/mcp`, `/mcp`) and the agent REST routes both call the same registry, so validation, the write gate, limits, the `agent.write` audit and untrusted-text marking are shared.
- **`update_project` is REST-only on purpose.** It was added in `agent-ready-cli` (D8) for the agent REST routes and kept off MCP so that change left the MCP surface untouched (`TestRestOnlyToolHiddenFromMCP`). There was no security reason: the REST route that reaches it uses the same gate.
- **What is content.** In the op schema, `project.name`, `project.description` and `section.name` are content fields, encrypted for an end-to-end encrypted account. `project.color`, `project.icon`, `project.parent_id`, `project.position`, `section.position` and `user_prefs.favourites` are not: they are plaintext even for encrypted accounts.
  - `icons-and-section-style` adds `section.color` and `section.icon`, also plaintext, and a searchable icon catalogue.
- **Today's refusal for encrypted accounts.** The remote MCP server never holds a key. For an encrypted account it refuses any write that carries a content field (`encryption_enabled`) and offers only structural task writes.
- **How encryption works.** All crypto lives in the browser (`web/src/lib/crypto.ts`), using Web Crypto only:
  - The account key (DEK) is AES-256-GCM.
  - It is wrapped (AES-KW) under a PBKDF2-SHA-256 passphrase key and under an HKDF recovery key.
  - Values are `enc:v1:` + base64url(nonce ‖ ciphertext ‖ tag).
  - The additional authenticated data is `entity \0 entityId \0 field`, so a value only decrypts on the field and entity it was written for.
  - The server stores and serves the wrapped key record but never the passphrase or the DEK.
- **The CLI today.** It is online-only and stores its token in an owner-only config file. `ot mcp` bridges stdio to `/mcp` and refuses any token that is not read-scoped unless `--allow-full-token` is given.
- **Project layout is device-local.** List, Board or Timeline is saved per device in the client's meta store (`saveViewMode`); it never reaches the server.

## Goals / Non-Goals

**Goals:**
- An assistant can do on MCP what a person does in the project header and the sidebar, short of destroying anything:
  - recolour a project, give it an icon, rename it, move it under another, reorder it, pin it;
  - add, rename, reorder and style its sections.
- Encrypted accounts get those changes through remote MCP where no content is involved, and fully through a local mode where the key stays on the user's machine.
- One set of tool definitions: the local mode exposes the same tools as `/mcp`; it only transforms values on the way in and out.

**Non-Goals:**
- Archiving, deleting or purging projects or sections.
- Sharing or members.
- Writing a project's description.
- Setting the project layout, which would first need to become synced.
- A remote MCP client (claude.ai, any cloud agent) reading encrypted content: that needs an online device to decrypt for it, which is the later change `mcp-device-relay`.
- Sending the passphrase, recovery key or DEK to the server in any form.

## Decisions

### D1. Expose `update_project` on MCP; add new tools
`update_project` leaves the REST-only set and becomes an ordinary write tool. It accepts `id` plus any of:
- `name`
- `color` (`#rrggbb`)
- `icon` (a catalogue name, or null for the colour dot)
- `parent_id` (a project id or null; no cycles, same rules as the app)
- `position` (number)

`description` stays refused, as today.

New tools:
- `set_favourite` `{kind: "project", id, favourite: bool}`: adds or removes `project:<id>` in `user_prefs.favourites`, keeping the order of the others and appending at the end. It takes `kind` so labels and views can follow later without a new tool.
- `create_sections` `{project_id, items: [{name, color?, icon?, position?, id?, client_request_id?}]}`
- `update_sections` `{updates: [{id, name?, color?, icon?, position?}]}`
- `reorder_sections` `{project_id, ids: [...]}`: writes positions in the given order. Sections not listed keep their place after the listed ones.
- `list_icons` `{query?, limit?}`: a read tool that returns `{name, category, keywords}` from `iconset.Entries()`, the server side of the catalogue in `icons-and-section-style`. Matching and order are the picker's: case-insensitive, exact name, then name prefix, then keyword, then category.

**Alternative rejected:** one big `update_project` that also edits sections. Sections are their own entities with their own ids, and batching several of them is clearer as separate tools within the existing per-call limit.

### D2. Icons are validated against the shared catalogue
`icons-and-section-style` introduces one catalogue (names plus search keywords) that both the web app and the server read. The server copy (`internal/iconset`, generated from `web/src/ui/icons/catalogue.json`) is checked by a test, and `iconset.Valid` is the one check every write tool uses.

Any `icon` argument outside the catalogue is refused with invalid arguments naming the value, so a model can never store an icon the app can't draw. `list_icons` lets the model find a valid name instead of guessing.

### D3. Encrypted accounts: content-free writes are allowed; names need ciphertext
For an encrypted account:
- **Allowed as plaintext:** `color`, `icon`, `parent_id`, `position`, favourites and section order. They are already plaintext in the data, so writing them reveals nothing new.
- **Names and other content fields:** accepted only when the value is a well-formed `enc:v1:` envelope, stored as given. A plaintext value keeps returning `encryption_enabled`.
- `tools/list` keeps listing `update_project`, `create_sections` and `update_sections` for encrypted accounts, with the content arguments described as "ciphertext only".

The server can't check that an envelope was made with the right key or bound to the right id. A wrong one is equivalent to overwriting the name with something unreadable:
- devices show their "can't decrypt" placeholder;
- the field's history still holds the previous value, which can be restored;
- the token could already do as much harm with structural writes, and every write is audited.

### D4. Creates accept a caller-chosen `id`
To encrypt a new entity's name, the encrypter needs its id, because the AAD binds the ciphertext to it. Today ids of agent-created entities are derived on the server from the user, the token and `client_request_id`.

`create_tasks`, `create_project`, `create_label` and `create_sections` gain an optional `id` (a UUID):
- It is used as given when no live entity of any kind has it.
- It is refused as `conflict` otherwise.
- When both `id` and `client_request_id` are present, a retry with the same pair returns the same result; a different pair with the same id is a conflict.

**Alternative rejected:** have the local mode compute the server's derived id. That would freeze an internal derivation (including the token id) into a client contract.

### D5. Local mode: `ot mcp --decrypt`
The existing stdio bridge gains a mode that keeps forwarding to `/mcp` but transforms messages:

- **Results (server to assistant):** each `enc:v1:` value the bridge can attribute is decrypted, then the `encrypted` marker is removed. Attribution means knowing the entity, its id and the field, from the tool's result shape: tasks, projects, sections, labels, comments, custom field values.
  - A value it can't attribute or decrypt keeps the existing encrypted placeholder.
  - The untrusted-text wrapping stays as is: decrypted text is still untrusted user content.
- **Calls (assistant to server):** each content argument of a write tool is encrypted with the AAD of the target entity and field before forwarding. For creates, the bridge assigns a fresh UUID `id` (D4) when the call has none.
- **Same tools:** `tools/list` is forwarded unchanged apart from the "ciphertext only" wording, which the bridge rewrites, because from the assistant's side plaintext is now accepted.
- **Tokens:** decrypting mode requires a `read` or `agent` token.
  - A `read` token gives a read-only assistant that can read encrypted content.
  - An `agent` token also allows writes, through the server's gate.
  - The bridge also accepts `agent` tokens in plain mode, since they can only write through that gate. `full` still needs `--allow-full-token`.

**Alternative rejected:** reimplement the tools locally against the sync API. That would mean two tool implementations that drift, and it would bypass the server's gate and audit.

### D6. The key on the user's machine
- **`ot encryption unlock`:**
  - Reads the passphrase (or `--recovery`) from the terminal without echo, or from `--passphrase-file`.
  - Fetches the wrapped key record (`GET /api/v1/encryption/keys`) and checks the PBKDF2 bounds, as devices do.
  - Unwraps the DEK and stores it, with the `keyVersion` it belongs to, in `<config dir>/opentodo/keys/<profile>.json`, owner-only (0600, directory 0700), the same protection as the token.
  - Five failures within a minute delay further attempts.
- **`ot encryption lock`** deletes the key file. **`ot encryption status`** reports locked, unlocked, or out of date.
- **When a request fails:** the bridge never prompts, because MCP clients start it non-interactively. With no key, or a key whose `keyVersion` differs from the profile's, `--decrypt` refuses to start with an error naming `ot encryption unlock`. During a session, a version change makes it return a tool error for the request that noticed it.

**Alternative considered:** the OS keychain (macOS Keychain, Windows Credential Manager, Secret Service). It is stronger at rest but needs a third-party Go module per platform and does not work headless (Secret Service). It stays a later option; the file mirrors how the token is already stored and how SSH keys without passphrases are kept.

### D7. Crypto in Go from the standard library
Go's standard library provides AES-GCM (`crypto/aes`, `crypto/cipher`), PBKDF2 (`crypto/pbkdf2`) and HKDF (`crypto/hkdf`). AES key unwrap (RFC 3394) is about 40 lines on `crypto/aes`.

These primitives live in `internal/e2ee/crypt` and are imported only by `internal/cli`, never by the server, so the server binary still contains no content crypto. They are pinned by known-answer vectors shared with `web/src/lib/crypto.ts` (`internal/e2ee/testdata`).

### D8. The plaintext notice
Starting `--decrypt` writes one line to stderr:

> The assistant will read your encrypted tasks in plain text; your AI provider receives them.

The assistants section in Settings and `docs/mcp.md` say the same. End-to-end encryption protects the content from the server, not from the model the user chooses to give it to.

### Data model
No new op fields beyond `section.color` and `section.icon`, which belong to `icons-and-section-style`. Favourites keep their one-string, last-writer-wins shape. The server stores envelopes exactly as devices write them.

### Size and memory
- **Server:** a few tool definitions and the icon table, a few KB.
- **CLI:** standard-library crypto, under 100 KB added to `ot`.
- **Web:** no change.
- **Memory:** the bridge holds one 32-byte key.

### Interface budget
- The only screen change is one sentence in the assistants settings section.
- No new shortcut, sidebar destination, chrome row or scroll region.

## Risks / Trade-offs

- **The key at rest on disk.** Anyone with the user's account on that machine can read the key file, as they can read the token today. *Mitigation:* owner-only permissions, `ot encryption lock`, and a docs note to lock on shared machines. The keychain remains a later option.
- **Ciphertext of the wrong shape.** A buggy or hostile client can store an envelope devices can't decrypt. *Mitigation:* history restore, audit, and devices already show a placeholder. Devices could later flag such values in the trash-and-history view.
- **Attribution gaps.** A result field the bridge does not know how to attribute stays encrypted. *Mitigation:* the bridge has a table of attributable shapes, tested for every tool, and a test fails when a tool's result gains a content field the table does not cover.
- **Favourites race.** `set_favourite` rewrites the whole favourites string, so an offline device editing Favourites at the same time wins or loses as a whole. This is the same rule that applies between two devices today.
- **Two changes extend "Read-only tools".** This change and `time-tracking` both extend it (`list_icons`, `list_time_entries`). This change adds `list_icons` through its own requirement; the "exactly the read tools" scenario is reconciled when the second of the two is archived (task 6.3).

## Implementation notes

- **Every write tool stays listed for encrypted accounts (D3 adjusted).** The first draft kept omitting the content tools (`create_tasks`, `create_project`, `create_label`, `add_comment`) from `tools/list`, but `ot mcp --decrypt` forwards the server's list, so its assistant would never see them. Every write tool is now listed; text arguments carry `agenttools.CiphertextOnlyNote` and lose their plaintext length bounds, `origin_url` is left out, and the bridge strips the note. A remote assistant that sends plain text still gets `encryption_enabled`.
- **`add_comment` takes a chosen id too (D4).** The bridge needs the id to bind a comment body's ciphertext.
- **Results carry placeholders, not envelopes (D5 adjusted).** Read tools never put ciphertext into a model's context: the server writes "Encrypted item" (`[encrypted]` for a time entry note). The bridge therefore attributes each placeholder by the result's shape (task, project or project count, section in a project resource, custom field definition, comment, time entry) and reads the raw value of that entity's field through the REST collections (`/tasks`, `/projects`, `/labels`, `/sections`, `/fields`, `/tasks/{id}/comments`, `/time-entries`), once per message, then decrypts it. `TestMCPBridgeDecrypts` seeds a value in every content field a read tool shows and fails when one comes back as a placeholder.
- **Stale check.** Before each `tools/call` and `resources/read` the bridge reads `/api/v1/me` and compares the key version; a change answers that request with a JSON-RPC error and forwards nothing.
- **Passphrase normalisation.** Devices NFC-normalise the passphrase before PBKDF2; Go's standard library has no normaliser, so `ot` does not. A passphrase with non-ASCII characters typed in another normal form fails to unwrap; the error suggests `--recovery`.
- **Not in the in-app assistant.** The in-app assistant shares the registry but its review screen describes task, project, label and comment changes only, so `update_project`, `set_favourite` and the section tools are left out of it (`internal/assistant` `notInApp`).
- **Vectors.** The CLI's crypto (`internal/e2ee/crypt`) is checked against the existing shared vectors `web/src/lib/e2ee.vectors.json`, which `crypto.test.ts` already verifies, instead of a second copy under `internal/e2ee/testdata`.
- **Sizes.** `ot` grows by the standard-library crypto and the bridge code only (no new module; the 11.9 MB `ot` binary of this branch includes them); the server binary does not link `internal/e2ee/crypt` (`TestServerDoesNotLinkCrypt`); web: one sentence and its translations.

## Open decisions

- **Key storage.** File versus OS keychain (D6). Default: the file now, the keychain later.
- **Envelope acceptance.** Whether to accept envelopes for encrypted accounts only from tokens whose client declared `--decrypt` (an `X-OpenTodo-Encrypting: 1` header). It would not be a security boundary, since a client can send it, but it would catch a confused integration. Default: no header, D3 as written.
