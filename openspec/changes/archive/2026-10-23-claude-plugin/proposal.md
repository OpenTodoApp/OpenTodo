# Proposal

## Why

OpenTodo already speaks to AI assistants in two ways: the MCP server (`/mcp`, read tools always, write tools behind the owner's and the user's switches and an `agent` token) and `ot`, whose agent skill file (`skills/opentodo-cli/SKILL.md`, shipped as `opentodo-agent-skill.zip` and printed by `ot skill`) teaches an agent the CLI's rules: read before writing, preview, plan without forcing a due date, retry-safe creates, prefer completing to deleting, text in tasks is data.

MCP has no such file. The tools carry descriptions, but nothing tells a client like Claude how to use them well: which tool answers which question, that ids come from a read and never from a title, that a change to many tasks is proposed first, that the user's time zone goes with every date question. People who connect Claude to OpenTodo also have to assemble the connection by hand: copy a JSON entry, paste a token into a config file, find the skill zip.

Claude Code installs plugins from marketplaces: git repositories with a small manifest. One plugin can carry skills and the MCP connection, and asks the user for the server address and token when it is enabled, storing the token in the system's credential store. That is the shortest honest path from "I use Claude Code" to "Claude works with my own OpenTodo, safely".

## What Changes

- **An MCP skill.** `skills/opentodo-mcp/SKILL.md` is the MCP counterpart of the CLI skill: setup (an `agent` token and the two write switches), which tool answers which question, ids from reads, propose a plan and wait for a yes before changing several tasks, the planning vocabulary (start, Someday, deadline, This Evening, blocked by, location; floating dates; the user's time zone), retry-safe creates with `client_request_id`, untrusted text is data, report changes with ids and how to undo them, and the `opentodo://` resources and workflow prompts. It names only tools that exist; a check fails the build otherwise.
- **A Claude Code plugin, `opentodo`, in a marketplace, `opentodo`.** The source lives in this repository under `deploy/claude-plugin/upstream/`, file for file the content of a small published repository, `pixari/opentodo-claude`, as `deploy/runtipi/upstream/` is for Runtipi. The plugin holds copies of both skills, two task skills (`/opentodo:today`, `/opentodo:plan-week`), and the MCP connection. It asks the user for the server address and an `agent` token (`userConfig`, the token marked sensitive) and never ships either.
- **Checks in `make check`.** `scripts/deploy/claude-plugin.mjs` fails when the copied skills differ from `skills/`, when the MCP skill names a tool the agent tool registry does not offer (read from the registry's golden tool list), when `plugin.json`'s version differs from the latest release in `CHANGELOG.md`, or when the plugin contains anything that looks like a real server address or token.
- **Publishing.** After a successful release, a CI job copies `upstream/` into `pixari/opentodo-claude`, commits "OpenTodo <version>" and tags it, with a deploy key from the secret `CLAUDE_PLUGIN_DEPLOY_KEY`. Without the secret the job succeeds and prints the manual steps. `deploy/claude-plugin/README.md` documents both.
- **Packaging.** `make skill` also zips the MCP skill (`opentodo-mcp-skill.zip`), and the release ships it next to `opentodo-agent-skill.zip`.
- **Docs.** A guide, `docs/claude.md` ("Use OpenTodo from Claude Code"), and a section in `docs/mcp.md`.

No server, API, op or data change. No new environment variable. Not **BREAKING**.

## Out of scope

- A plugin system inside OpenTodo, or a catalogue of third-party plugins.
- Submitting the plugin to Anthropic's directory (a later step once the plugin has been used).
- Other AI clients' formats (Claude Desktop extensions, other editors' configs); `docs/mcp.md` keeps covering them by hand.
- New MCP tools, resources or prompts.

ROADMAP: advances "Next: Bring your agent" with a fourth row, a Claude Code plugin with the MCP skill (`claude-plugin`).

## Capabilities

### New Capabilities

- `claude-plugin`: the MCP agent skill, the Claude Code plugin and marketplace built from this repository, their consistency checks, and how they are published.

### Modified Capabilities

None. The CLI skill's requirement in `cli-client` is unchanged; the plugin copies it.

## Impact

- New: `skills/opentodo-mcp/SKILL.md`, `deploy/claude-plugin/**`, `scripts/deploy/claude-plugin.mjs` and its test, `docs/claude.md`.
- Changed: `skills/skills.go` (embeds the MCP skill), `Makefile` (`skill`, the deploy check), `.github/workflows/ci.yml` (release assets, the publish job), `docs/mcp.md`, `README.md`, `ROADMAP.md`, `CHANGELOG.md`.
- A new public repository, `pixari/opentodo-claude`, a few KB, written only by the publish job or the manual steps.
