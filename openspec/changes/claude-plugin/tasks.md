# Tasks

## 1. MCP skill

- [x] 1.1 Write `skills/opentodo-mcp/SKILL.md` from the registry (tools in `internal/agenttools/testdata/tools_agent_on.golden.json`, resources in `internal/mcp/resources.go`, prompts in `internal/agenttools/skills.go`), covering every rule of design D3; verify by the plugin check of 2.3 passing and by reading every tool name it names in the golden list
  - Done: written from the golden tool list, `internal/mcp/resources.go` and `internal/agenttools/skills.go`; the check of 2.3 passes on it (every backticked tool, every `opentodo://` URI and every prompt it names exists).
- [x] 1.2 Embed it in `skills/skills.go` next to the CLI skill and zip it in `make skill` as `dist/opentodo-mcp-skill.zip`; verify `make skill` prints both zips and `go test ./skills/...` passes
  - Done: `skills.go` embeds it (`OpenTodoMCP`), `skills_test.go` checks both skills' front matter (`go test ./skills/` passes). `make skill` zips both; `zip` is not installed on the development machine, so the zip itself is verified by CI's `skill` job.

## 2. Plugin and marketplace

- [x] 2.1 Create `deploy/claude-plugin/upstream/` per design D2: marketplace manifest, `plugin.json` with `userConfig` (server address, sensitive agent token) and the version of the latest release, `.mcp.json` over HTTP to `${user_config.server_url}/mcp`, copies of both skills, the `today` and `plan-week` task skills, README and LICENSE; verify with `claude plugin validate` on the marketplace and the plugin when Claude Code is installed
  - Done: `claude plugin validate` (Claude Code 2.1.309) passes on the marketplace and on the plugin with nothing to report, after adding `privacyPolicyUrl` (the README's Privacy section) and `.claude-plugin/icon.png`, which its directory checks asked for.
- [x] 2.2 Write `deploy/claude-plugin/README.md` (what it is, how it is checked, the publish job, the manual steps); verify by review
- [x] 2.3 Add `scripts/deploy/claude-plugin.mjs` and `claude-plugin.test.mjs` with the checks of design D4, wired into `make deploy-check`; verify `node --test scripts/deploy/claude-plugin.test.mjs` passes and fails on a drifted copy, an unknown tool, a stale version and a planted token
  - Done: 7 tests pass (committed tree, drifted and missing copy, unknown tool, resource and prompt, stale version, manifest fields, planted token and address); `node scripts/deploy-check.mjs` reports the plugin ok. `repo-checks.test.mjs` counts `claude-plugin` among the publishing jobs, needing only `release`.

## 3. Publishing

- [x] 3.1 Upload `opentodo-mcp-skill.zip` from the `skill` CI job so the release collects it; verify the job's artifact lists both zips
  - Done: the `skill` job uploads both zips; the release collects every `opentodo-*` artifact.
- [x] 3.2 Add the `claude-plugin` publish job after `release` (design D5), with the deploy key secret and the manual fallback, actions pinned by SHA; verify by reading the job and by a dry run of its script against a scratch clone
  - Done: job `claude-plugin`, `needs: [release]`, tags only. A dry run of its script without the secret prints the manual steps and exits 0, and `bash -n` passes. The keyed branch runs for the first time at the next release with the secret set.
- [x] 3.3 First publish by hand: push `upstream/` to `pixari/opentodo-claude` as version of the latest release, tagged; verify `claude plugin marketplace add pixari/opentodo-claude` in a scratch config
  - Done: `pixari/opentodo-claude` commit 48d7a901 "OpenTodo 0.10.0" tagged `v0.10.0`, then 7a1fd9ae (the README line on `/plugin configure`). In a scratch `CLAUDE_CONFIG_DIR`, `claude plugin marketplace add pixari/opentodo-claude` cloned and validated it, `claude plugin install opentodo@opentodo` installed it and named the two required settings, and `claude plugin details opentodo` lists the skills opentodo-cli, opentodo-mcp, plan-week and today and the MCP server opentodo. A live connection to a server was not exercised.

## 4. Docs and integration

- [x] 4.1 Write `docs/claude.md` ("Use OpenTodo from Claude Code"), citing `claude-plugin`; add a section to `docs/mcp.md`, a README line, a ROADMAP row and the CHANGELOG entry under Unreleased; verify `make docs-check`
  - Done: `docs/claude.md` cites `mcp-server` until the archive adds the `claude-plugin` spec (a page may cite only specs that exist; the archive changes it to `claude-plugin`). `make docs-check` passes.
- [ ] 4.2 Run `make check` (TZ=UTC), open the pull request and get CI green
