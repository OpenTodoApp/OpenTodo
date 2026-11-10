package assistant

// Write tools on request (OpenSpec change assistant-lean-tools, D1): a turn
// without a skill and without an open proposal first offers the read and
// display tools and propose_changes. Most questions only read, so their model
// calls carry no write tool definitions; once the model calls propose_changes,
// the next rounds of the turn offer the write tools (and remember) too. A
// skill keeps its own list, and a turn amending an open proposal offers the
// write tools from its first round. propose_changes is in-app only, like the
// display tools: it never reaches the registry or MCP.

// ProposeTool asks for the write tools; it changes nothing.
var ProposeTool = ToolDef{
	Name: "propose_changes",
	Description: "Call this first whenever the user asks for any change: creating, updating, scheduling, moving, completing, reopening or trashing tasks, creating projects or labels, adding comments, or remembering a fact. " +
		"It makes the write tools available from your next step; nothing changes until the user reviews your proposal. Not needed to answer a question.",
	Schema: map[string]any{"type": "object", "additionalProperties": false, "properties": map[string]any{}},
}

// ProposeResult is propose_changes' result.
const ProposeResult = "The write tools are available now. Plan the changes with them in your next step; they are proposed to the user for review, nothing is written yet."

// LeanNote is added to the instructions of a turn that starts without the write tools.
const LeanNote = "\n\nWrite tools: you start with the read and show tools only. When the user asks for any change, call propose_changes first; the write tools then appear in your next step. Never say that you cannot make changes."

// NotOfferedMessage answers a write tool called before propose_changes.
const NotOfferedMessage = "the write tools are not offered yet: call propose_changes first, then call this tool again in your next step."

// offers reports whether the list holds the tool.
func offers(list []ToolDef, name string) bool {
	for _, d := range list {
		if d.Name == name {
			return true
		}
	}
	return false
}

// leanTurn reports whether a turn starts without the write tools: no skill and no open proposal.
func leanTurn(in TurnInput) bool {
	return in.Skill == nil && len(in.Open) == 0
}
