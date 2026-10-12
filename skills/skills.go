// Package skills embeds the agent skill files that ship with OpenTodo
// (OpenSpec change `agent-ready-cli`, design D9). The Markdown under
// opentodo-cli/ is the canonical copy: `ot skill` prints it and the release
// job zips that folder as opentodo-agent-skill.zip.
package skills

import _ "embed"

// OpenTodoCLIName is the skill's name in its frontmatter.
const OpenTodoCLIName = "opentodo-cli"

// OpenTodoCLI is skills/opentodo-cli/SKILL.md.
//
//go:embed opentodo-cli/SKILL.md
var OpenTodoCLI string
