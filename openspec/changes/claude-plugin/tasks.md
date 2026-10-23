# Tasks

## 1. MCP skill

- [ ] 1.1 Write `skills/opentodo-mcp/SKILL.md` from the registry (tools in `internal/agenttools/testdata/tools_agent_on.golden.json`, resources in `internal/mcp/resources.go`, prompts in `internal/agenttools/skills.go`), covering every rule of design D3; verify by the plugin check of 2.3 passing and by reading every tool name it names in the golden list
- [ ] 1.2 Embed it in `skills/skills.go` next to the CLI skill and zip it in `make skill` as `dist/opentodo-mcp-skill.zip`; verify `make skill` prints both zips and `go test ./skills/...` passes

## 2. Plugin and marketplace

- [ ] 2.1 Create `deploy/claude-plugin/upstream/` per design D2: marketplace manifest, `plugin.json` with `userConfig` (server address, sensitive agent token) and the version of the latest release, `.mcp.json` over HTTP to `${user_config.server_url}/mcp`, copies of both skills, the `today` and `plan-week` task skills, README and LICENSE; verify with `claude plugin validate` on the marketplace and the plugin when Claude Code is installed
- [ ] 2.2 Write `deploy/claude-plugin/README.md` (what it is, how it is checked, the publish job, the manual steps); verify by review
- [ ] 2.3 Add `scripts/deploy/claude-plugin.mjs` and `claude-plugin.test.mjs` with the checks of design D4, wired into `make deploy-check`; verify `node --test scripts/deploy/claude-plugin.test.mjs` passes and fails on a drifted copy, an unknown tool, a stale version and a planted token

## 3. Publishing

- [ ] 3.1 Upload `opentodo-mcp-skill.zip` from the `skill` CI job so the release collects it; verify the job's artifact lists both zips
- [ ] 3.2 Add the `claude-plugin` publish job after `release` (design D5), with the deploy key secret and the manual fallback, actions pinned by SHA; verify by reading the job and by a dry run of its script against a scratch clone
- [ ] 3.3 First publish by hand: push `upstream/` to `pixari/opentodo-claude` as version of the latest release, tagged; verify `claude plugin marketplace add pixari/opentodo-claude` in a scratch config

## 4. Docs and integration

- [ ] 4.1 Write `docs/claude.md` ("Use OpenTodo from Claude Code"), citing `claude-plugin`; add a section to `docs/mcp.md`, a README line, a ROADMAP row and the CHANGELOG entry under Unreleased; verify `make docs-check`
- [ ] 4.2 Run `make check` (TZ=UTC), open the pull request and get CI green
