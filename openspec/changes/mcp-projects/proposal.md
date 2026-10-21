## Why

An assistant connected over MCP can create a project but not shape it: it cannot recolour a project, give it an icon, move it under another, pin it to Favourites or set up its sections. The tool to rename or recolour a project already exists, but only behind the agent REST routes; it was kept off MCP in `agent-ready-cli` (design D8) to leave that change's MCP surface unchanged, not for a security reason. Encrypted accounts get even less: every write that carries a name is refused, and the user asked to "give the MCP the passphrase". That would hand the key to the server and end end-to-end encryption, so the same goal has to be reached with the key staying on the user's machine.

## What Changes

- **Project tools on MCP.** `update_project` becomes an MCP write tool and accepts `name`, `color`, `icon`, `parent_id` and `position`, still never `description`.
- **Favourites.** `set_favourite` pins a project to Favourites or unpins it.
- **Icons.** `list_icons` is a new read tool that lists and searches the icon catalogue introduced by `icons-and-section-style`. An icon outside the catalogue is refused.
- **Sections.** `create_sections`, `update_sections` (name, position, colour, icon) and `reorder_sections` act on a project's sections. Sections are never deleted by a tool.
- **Same safeguards.** All of these go through the existing gate (owner switch, user switch, `agent` token, per-minute and per-call limits, `agent.write` audit, untrusted text in results), are written as operations, and converge with device edits.
- **Encrypted accounts, remote MCP.** Changes that carry no content (colour, icon, parent, position, favourite, section order) are allowed. Names stay refused unless they arrive as ciphertext envelopes (see the next point).
- **Encrypted accounts, local MCP.** A new local mode, `ot mcp --decrypt`, runs on the user's machine and is unlocked once with the passphrase or recovery key via `ot encryption unlock`. It:
  - decrypts the ciphertext in tool results before the assistant sees them;
  - encrypts the names and texts the assistant writes before they leave the machine;
  - sends write tools ciphertext envelopes and ids it chose itself, so the server still holds only ciphertext and never the key.

  The user is told plainly that the AI model then reads the content in plain text.
- **Creates take caller-chosen ids.** Write tools that create something accept an optional caller-chosen `id`. The local mode needs this to bind its ciphertext to the new entity's id.
- **Ciphertext is stored as given.** For an encrypted account, a content argument that is a well-formed ciphertext envelope is stored opaquely instead of being refused.

**Out of scope:**
- Archiving, deleting or purging projects or sections.
- Sharing, members, project descriptions.
- A project's layout (List, Board, Timeline): it is a per-device setting that never reaches the server.
- Remote (cloud) MCP clients on encrypted data, such as the claude.ai connector. That needs a device to decrypt for them and is the later change `mcp-device-relay`.
- Giving the server the passphrase in any form.

No new mandatory environment variable and no change to the op log format.

This advances the ROADMAP's assistant integration (MCP server write tools, agent-ready CLI) and end-to-end encryption items.

## Capabilities

### New Capabilities
- `local-mcp-decryption`: the CLI's local MCP mode for encrypted accounts. It covers unlocking and locking the key on the user's machine, decrypting results, encrypting writes, the plaintext notice, and failure modes.

### Modified Capabilities
- `mcp-server`: several requirements change.
  - **Write tools:** gain project, favourite and section tools.
  - **Read-only tools:** gain `list_icons`.
  - **Encrypted accounts and write tools:** allow content-free project and section changes and accept ciphertext envelopes.
  - **Project description in reads:** `update_project`'s accepted fields widen; the description stays unwritable.
  - **stdio bridge:** gains the decrypting mode.

## Impact

- **Server:**
  - `internal/agenttools`: `update_project` moves out of the REST-only set; new `set_favourite`, `list_icons`, `create_sections`, `update_sections` and `reorder_sections`.
  - Encrypted-account handling accepts envelopes and content-free fields.
  - Creates accept a caller-chosen `id`.
- **MCP:** `internal/mcp` tool listing.
- **Agent REST:** the routes keep working; `update_project` stays reachable there.
- **CLI:**
  - `internal/cli`: `ot encryption unlock|lock|status` and `ot mcp --decrypt`.
  - Go standard-library AES-GCM, PBKDF2, HKDF and AES key unwrap, matching `web/src/lib/crypto.ts` and pinned by shared test vectors. No new dependency.
- **Depends on** `icons-and-section-style` for the icon catalogue and the section `color` and `icon` fields.
- **Docs:** `docs/mcp.md`, `docs/cli.md`, `docs/e2ee.md`.
