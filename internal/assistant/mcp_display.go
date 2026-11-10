package assistant

import "encoding/json"

// MCPDisplayTools are the display tools MCP offers to a client that announces
// the MCP Apps extension (OpenSpec change mcp-blocks, design Spike): the three
// a routine's AI step also gets, with the same definitions.
var MCPDisplayTools = []string{"show_tasks", "show_calendar", "show_deadlines"}

// ParseDisplayCall checks a display call's arguments exactly as an in-app
// turn does, before its ids are checked (mcp-blocks D3). A failure is an
// argument error whose message the caller can hand back to the model.
func ParseDisplayCall(name string, raw json.RawMessage) (Block, error) {
	return parseBlock(name, raw)
}

// DisplayTool returns a display tool's definition by name.
func DisplayTool(name string) (ToolDef, bool) {
	for _, d := range DisplayTools {
		if d.Name == name {
			return d, true
		}
	}
	return ToolDef{}, false
}
