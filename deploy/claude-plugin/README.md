# Claude Code plugin

OpenTodo's [Claude Code](https://code.claude.com) plugin marketplace (OpenSpec change `claude-plugin`). Users add it with `/plugin marketplace add pixari/opentodo-claude` and install `opentodo@opentodo`; see [docs/claude.md](../../docs/claude.md).

[`upstream/`](upstream/) is the whole content of the repository [`pixari/opentodo-claude`](https://github.com/pixari/opentodo-claude), file for file. That repository is small on purpose: Claude Code clones a marketplace, and this one (356 MB with its screenshots) would be a heavy clone for a few kilobytes of skills.

| Path | What it is |
| --- | --- |
| `.claude-plugin/marketplace.json` | The marketplace `opentodo`, listing one plugin |
| `plugins/opentodo/.claude-plugin/plugin.json` | The plugin `opentodo`: version (the latest release in CHANGELOG.md), and `userConfig` asking for the server address and a sensitive agent token |
| `plugins/opentodo/.mcp.json` | The MCP server over streamable HTTP: `${user_config.server_url}/mcp`, `Authorization: Bearer ${user_config.agent_token}` |
| `plugins/opentodo/skills/opentodo-mcp/` | Copy of [`skills/opentodo-mcp/SKILL.md`](../../skills/opentodo-mcp/SKILL.md) |
| `plugins/opentodo/skills/opentodo-cli/` | Copy of [`skills/opentodo-cli/SKILL.md`](../../skills/opentodo-cli/SKILL.md) |
| `plugins/opentodo/skills/today/`, `plan-week/` | The task skills `/opentodo:today` and `/opentodo:plan-week` |
| `README.md`, `LICENSE` | What users see on GitHub; AGPL-3.0 |

Edit here, never in the published repository. `make check` (`scripts/deploy/claude-plugin.mjs`) fails when:

- a copied skill differs from its source under `skills/`;
- the MCP skill names a tool the agent tool registry does not offer (`internal/agenttools/testdata/tools_agent_on.golden.json`), an `opentodo://` resource the MCP server does not list, or a prompt it does not offer;
- the manifests miss a required field, or the marketplace entry and the plugin disagree on the name;
- `plugin.json`'s version is not the latest release in CHANGELOG.md;
- a file contains something shaped like a token or a server address.

When Claude Code is installed, also run `claude plugin validate deploy/claude-plugin/upstream` and `claude plugin validate deploy/claude-plugin/upstream/plugins/opentodo`.

## Publishing

After each release the CI job `claude-plugin` (in `.github/workflows/ci.yml`) copies `upstream/` of the tag into `pixari/opentodo-claude`, commits "OpenTodo <version>" and tags `v<version>`. It uses the deploy key in the repository secret `CLAUDE_PLUGIN_DEPLOY_KEY`, which has write access to that one repository. Without the secret the job succeeds and prints these steps instead:

```bash
git clone git@github.com:pixari/opentodo-claude.git /tmp/opentodo-claude
rsync -a --delete --exclude .git deploy/claude-plugin/upstream/ /tmp/opentodo-claude/
cd /tmp/opentodo-claude && git add -A && git commit -m "OpenTodo <version>" && git tag v<version> && git push origin HEAD --tags
```

### Setting up the deploy key (once)

1. `ssh-keygen -t ed25519 -N "" -C "opentodo-claude publish" -f opentodo-claude-key`
2. In `pixari/opentodo-claude` → Settings → Deploy keys → Add deploy key: paste `opentodo-claude-key.pub`, tick **Allow write access**.
3. In `pixari/OpenTodo` → Settings → Secrets and variables → Actions → New repository secret: name `CLAUDE_PLUGIN_DEPLOY_KEY`, value the content of `opentodo-claude-key` (the private key).
4. Delete both key files.
