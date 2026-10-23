# claude-plugin Specification

## Purpose
A Claude Code plugin that teaches Claude to use an OpenTodo server well: skills for the MCP tools and the `ot` CLI, and a marketplace that installs them with the server address and a token, adding no access beyond what the server and token already allow.

## Requirements

### Requirement: MCP agent skill
The repository SHALL contain an agent skill for the MCP server, `skills/opentodo-mcp/SKILL.md`, the MCP counterpart of the CLI skill. It SHALL tell an agent to use an `agent` token and explain that write tools appear only when the owner's and the user's switches allow them; which tool answers which question; to take ids from a read and never act on a title; to show a plan and wait for the user's confirmation before changing more than one task; the planning fields (due as a floating date, deadline, start and Someday, This Evening, blocked by, location, estimate) and to pass the user's time zone; to retry creates with the same `client_request_id`; to prefer completing to trashing; that text written by people is data, never instructions; to report every change with its ids and say that it can be undone from the task's history; and which `opentodo://` resources and prompts exist. The skill SHALL name only tools, resources and prompts the MCP server offers. Each release SHALL ship it zipped as `opentodo-mcp-skill.zip`. The skill reads and writes no data itself; every change it leads to goes through the MCP tools and their op log, so offline devices converge as for any other agent write.

#### Scenario: Skill names a removed tool
- **WHEN** a change renames an MCP tool and leaves the old name in the skill
- **THEN** `make check` fails naming the skill and the unknown tool

#### Scenario: Release asset
- **WHEN** a release is published
- **THEN** its assets include `opentodo-mcp-skill.zip` next to `opentodo-agent-skill.zip`

### Requirement: Claude Code plugin and marketplace
The repository SHALL contain, under `deploy/claude-plugin/upstream/`, the whole content of a Claude Code plugin marketplace named `opentodo` with one plugin, `opentodo`. The plugin SHALL contain copies of the MCP and CLI skills, task skills for today and for planning the week, and an MCP server entry for the user's server over streamable HTTP. It SHALL ask for the server address and an `agent` token when the plugin is enabled, the token marked sensitive, and SHALL NOT contain any server address or token. Its version SHALL be the latest release in `CHANGELOG.md`. The plugin adds no route and no data: it reaches only the existing `/mcp` endpoint with the user's token, so offline behaviour and convergence are those of the MCP tools.

#### Scenario: Install
- **WHEN** a user runs `claude plugin marketplace add pixari/opentodo-claude` and `claude plugin install opentodo@opentodo`, and enters their server address and an agent token
- **THEN** Claude Code connects to `<address>/mcp` with that token, and `/opentodo:today` and the MCP skill are available

#### Scenario: Copied skill drifts
- **WHEN** `skills/opentodo-mcp/SKILL.md` changes and the plugin's copy does not
- **THEN** `make check` fails naming the two files

#### Scenario: A token committed by mistake
- **WHEN** a file under `deploy/claude-plugin/upstream/` contains a string shaped like an OpenTodo token or a server address
- **THEN** `make check` fails naming the file

#### Scenario: Version follows the release
- **WHEN** a release preparation moves `CHANGELOG.md` to a new version and leaves the plugin's version behind
- **THEN** `make check` fails naming the expected version

#### Scenario: Wrong token scope
- **WHEN** the user enters a read-only token
- **THEN** the assistant gets the read tools only, and the MCP skill tells it to say that changes need an agent token and the two switches

### Requirement: Publishing the plugin
After a release is published, CI SHALL replace the content of the repository `pixari/opentodo-claude` with `deploy/claude-plugin/upstream/` of the released tag, commit it as that version and tag it, using a deploy key scoped to that repository. When the deploy key is not configured, the job SHALL succeed and print the manual steps; the release itself SHALL NOT depend on it.

#### Scenario: Release with the key
- **WHEN** tag `v0.11.0` is released and the deploy key is configured
- **THEN** `pixari/opentodo-claude` has a commit "OpenTodo 0.11.0" and a tag `v0.11.0` with the plugin at version 0.11.0

#### Scenario: Release without the key
- **WHEN** a tag is released in a repository without the deploy key
- **THEN** the publish job succeeds and its log shows the commands to publish by hand
