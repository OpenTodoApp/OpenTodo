// Package skills embeds the agent skill files that ship with OpenTodo
// (OpenSpec change `agent-ready-cli`, design D9). The Markdown under
// opentodo-cli/ is the canonical copy: `ot skill` prints it and the release
// job zips that folder as opentodo-agent-skill.zip. opentodo-mcp/ is the skill
// for the MCP server (OpenSpec change `claude-plugin`), zipped as
// opentodo-mcp-skill.zip and copied into the Claude Code plugin under
// deploy/claude-plugin/.
package skills

import _ "embed"

// OpenTodoCLIName is the skill's name in its frontmatter.
const OpenTodoCLIName = "opentodo-cli"

// OpenTodoCLI is skills/opentodo-cli/SKILL.md.
//
//go:embed opentodo-cli/SKILL.md
var OpenTodoCLI string

// OpenTodoMCPName is the MCP skill's name in its frontmatter.
const OpenTodoMCPName = "opentodo-mcp"

// OpenTodoMCP is skills/opentodo-mcp/SKILL.md.
//
//go:embed opentodo-mcp/SKILL.md
var OpenTodoMCP string
