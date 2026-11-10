package mcp

import (
	"context"
	"crypto/sha256"
	_ "embed"
	"encoding/base64"
	"encoding/json"
	"strings"
	"time"

	"github.com/OpenTodoApp/opentodo/internal/agenttools"
	"github.com/OpenTodoApp/opentodo/internal/assistant"
	"github.com/OpenTodoApp/opentodo/internal/ids"
)

// Blocks for MCP Apps (OpenSpec change mcp-blocks). A client that announces the
// MCP Apps extension is offered show_tasks, show_calendar and show_deadlines
// with the in-app definitions; each names a static view, ui://opentodo/blocks/<kind>,
// that the host renders in its sandboxed frame and hands the call's result
// (design D2, D3). The view holds no content: the rows travel in the result's
// structuredContent, read like the read tools' (D3), and the text the model
// reads names only the kind and count, as in the app.

// AppsExtension is the MCP Apps extension id, AppsMIME its view type.
const (
	AppsExtension = "io.modelcontextprotocol/ui"
	AppsMIME      = "text/html;profile=mcp-app"
	blockURI      = "ui://opentodo/blocks/"
)

// Row caps of a block (D3): the in-app deadlines block lists 20.
const (
	maxCalendarRows  = 50
	maxDeadlinesRows = 20
)

// Client is what the transport knows about the client of one request.
type Client struct {
	// ProtocolVersion is the MCP-Protocol-Version header ("" when absent).
	ProtocolVersion string
	// Apps is true once the client announced MCP Apps (its session id says so, D6).
	Apps bool
	// Decrypting is true for a request from `ot mcp --decrypt` (D4).
	Decrypting bool
}

// blocksFor reports whether the display tools are offered: an Apps client,
// and for an encrypted account only through the decrypting bridge (D4).
func (cl Client) blocksFor(c agenttools.Caller) bool {
	return cl.Apps && (!c.Encrypted || cl.Decrypting)
}

//go:embed blocks/view.html
var viewSource string

// viewCSP is the view's own policy (D2): nothing but its one script and one
// style, by hash, and data: images; no connection, frame, object, base or form.
var viewCSP, viewDoc = buildView(viewSource)

func between(s, open, close string) string {
	i := strings.Index(s, open)
	if i < 0 {
		return ""
	}
	s = s[i+len(open):]
	j := strings.Index(s, close)
	if j < 0 {
		return ""
	}
	return s[:j]
}

func hash(s string) string {
	sum := sha256.Sum256([]byte(s))
	return "'sha256-" + base64.StdEncoding.EncodeToString(sum[:]) + "'"
}

func buildView(src string) (string, string) {
	csp := "default-src 'none'; script-src " + hash(between(src, "<script>", "</script>")) +
		"; style-src " + hash(between(src, "<style>", "</style>")) +
		"; img-src data:; font-src 'none'; media-src 'none'; connect-src 'none'; frame-src 'none'; worker-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'"
	return csp, strings.Replace(src, "{{CSP}}", csp, 1)
}

// blockKinds maps each MCP display tool onto its block kind.
var blockKinds = map[string]string{"show_tasks": assistant.BlockTasks, "show_calendar": assistant.BlockCalendar, "show_deadlines": assistant.BlockDeadlines}

// view returns the document of a block kind's view.
func view(kind string) (string, bool) {
	for _, k := range blockKinds {
		if k == kind {
			return strings.Replace(viewDoc, `data-kind=""`, `data-kind="`+kind+`"`, 1), true
		}
	}
	return "", false
}

// displayDef is a display tool as tools/list shows it to an Apps client.
type displayDef struct {
	Name        string         `json:"name"`
	Title       string         `json:"title"`
	Description string         `json:"description"`
	InputSchema map[string]any `json:"inputSchema"`
	Annotations map[string]any `json:"annotations"`
	Meta        map[string]any `json:"_meta"`
}

var displayTitles = map[string]string{"show_tasks": "Show tasks", "show_calendar": "Show calendar", "show_deadlines": "Show deadlines"}

func displayDefs() []any {
	out := []any{}
	for _, name := range assistant.MCPDisplayTools {
		d, _ := assistant.DisplayTool(name)
		out = append(out, displayDef{Name: d.Name, Title: displayTitles[name], Description: d.Description, InputSchema: d.Schema,
			Annotations: map[string]any{"title": displayTitles[name], "readOnlyHint": true, "openWorldHint": false},
			Meta:        map[string]any{"ui": map[string]any{"resourceUri": blockURI + blockKinds[name]}}})
	}
	return out
}

func (s *Server) toolList(c agenttools.Caller, cl Client) []any {
	out := []any{}
	for _, d := range s.tools.Definitions(c) {
		out = append(out, d)
	}
	if cl.blocksFor(c) {
		out = append(out, displayDefs()...)
	}
	return out
}

// isDisplay reports whether name is one of the MCP display tools.
func isDisplay(name string) bool {
	_, ok := blockKinds[name]
	return ok
}

// BlocksEncryptedMessage refuses a block on the server path of an encrypted account (D4).
const BlocksEncryptedMessage = "This account uses end-to-end encryption, so the server cannot show its content; blocks are shown through `ot mcp --decrypt`, which decrypts them on the user's machine."

// BlockNotFoundMessage is the in-app "not found" result.
var BlockNotFoundMessage = assistant.NotFoundMessage

func errorResult(code, msg string) toolResult {
	payload := map[string]any{"error": code, "message": msg}
	text, _ := json.Marshal(payload)
	return toolResult{Content: []content{{Type: "text", Text: string(text)}}, StructuredContent: payload, IsError: true}
}

// callDisplay runs one display tool for an Apps client (D3, D4, D5); any other
// client reaches the registry, which knows no display tool.
func (s *Server) callDisplay(ctx context.Context, c agenttools.Caller, cl Client, name string, args json.RawMessage) (any, error) {
	if c.Encrypted && !cl.Decrypting {
		return errorResult("encryption_enabled", BlocksEncryptedMessage), nil
	}
	b, err := assistant.ParseDisplayCall(name, args)
	if err != nil {
		return nil, &agenttools.ArgError{Msg: err.Error()}
	}
	out := map[string]any{"kind": b.Kind, "can_complete": c.CanWrite()}
	var rows []agenttools.BlockRow
	asked, more := 1, 0
	switch b.Kind {
	case assistant.BlockTasks:
		asked = len(b.IDs)
		if rows, err = s.tools.BlockTasks(ctx, c.UserID, b.IDs); err != nil {
			return nil, err
		}
		if b.Title != "" {
			out["title"] = b.Title
		}
		if len(rows) == 0 {
			return errorResult("not_found", BlockNotFoundMessage), nil
		}
	case assistant.BlockCalendar:
		days := blockDays(b.Date, b.Span)
		if rows, more, err = s.tools.BlockCalendar(ctx, c.UserID, days, maxCalendarRows); err != nil {
			return nil, err
		}
		out["date"], out["span"], out["days"] = b.Date, b.Span, days
	case assistant.BlockDeadlines:
		if rows, more, err = s.tools.BlockDeadlines(ctx, c.UserID, b.From, b.To, maxDeadlinesRows); err != nil {
			return nil, err
		}
		out["from"], out["to"] = b.From, b.To
	}
	out["tasks"] = rows
	out["more"] = more
	// The model reads the kind and count only (assistant-blocks "A tool result
	// SHALL name the kind and count shown, never content").
	summary := map[string]any{"shown": b.Kind, "count": len(rows) + more}
	if b.Kind == assistant.BlockTasks {
		summary["count"] = len(rows)
		if asked > len(rows) {
			summary["not_found"] = asked - len(rows)
			out["not_found"] = asked - len(rows)
		}
	}
	summary["message"] = "Shown to the user as OpenTodo's " + b.Kind + " block; do not repeat its items in words."
	out["count"] = summary["count"]
	text, _ := json.Marshal(summary)
	return toolResult{Content: []content{{Type: "text", Text: string(text)}}, StructuredContent: out}, nil
}

// blockDays lists a calendar block's days: the day, or seven from it.
func blockDays(date, span string) []string {
	n := 1
	if span == "week" {
		n = 7
	}
	d, err := time.Parse(time.DateOnly, date)
	if err != nil {
		return []string{date}
	}
	out := make([]string, n)
	for i := range out {
		out[i] = d.AddDate(0, 0, i).Format(time.DateOnly)
	}
	return out
}

// blockResources are the views as resources/list shows them to an Apps client.
func blockResources() []map[string]any {
	out := []map[string]any{}
	for _, name := range assistant.MCPDisplayTools {
		kind := blockKinds[name]
		out = append(out, map[string]any{"uri": blockURI + kind, "name": "opentodo-block-" + kind,
			"title": "OpenTodo " + kind + " block", "mimeType": AppsMIME})
	}
	return out
}

// readView answers resources/read of a ui://opentodo/blocks/<kind> view.
func readView(uri string) (any, error) {
	doc, ok := view(strings.TrimPrefix(uri, blockURI))
	if !strings.HasPrefix(uri, blockURI) || !ok {
		return nil, notFound(uri)
	}
	return map[string]any{"contents": []any{map[string]any{"uri": uri, "mimeType": AppsMIME, "text": doc,
		"_meta": map[string]any{"ui": map[string]any{"prefersBorder": true}}}}}, nil
}

// AnnouncesApps reports whether an initialize request's params announce MCP
// Apps with the HTML view type (design Spike: capabilities.extensions).
func AnnouncesApps(params json.RawMessage) bool {
	var p struct {
		Capabilities struct {
			Extensions map[string]struct {
				MimeTypes []string `json:"mimeTypes"`
			} `json:"extensions"`
		} `json:"capabilities"`
	}
	if json.Unmarshal(params, &p) != nil {
		return false
	}
	ext, ok := p.Capabilities.Extensions[AppsExtension]
	if !ok {
		return false
	}
	for _, m := range ext.MimeTypes {
		if m == AppsMIME {
			return true
		}
	}
	return false
}

// SessionHeader is the streamable HTTP transport's session header, and
// BridgeHeader the header `ot mcp --decrypt` sends on every request (D4).
const (
	SessionHeader = "Mcp-Session-Id"
	BridgeHeader  = "OpenTodo-MCP-Bridge"
	appsSession   = "apps."
)

// NewAppsSession is the session id answered to an initialize that announced
// MCP Apps (D6): random, and marked so that later requests carrying it count
// as an Apps client. It is no credential and the server stores nothing.
func NewAppsSession() string { return appsSession + ids.Hex(16) }

// AppsSession reports whether a request's session id marks an Apps client.
func AppsSession(id string) bool {
	return strings.HasPrefix(id, appsSession) && len(id) == len(appsSession)+32
}
