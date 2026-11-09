package assistant

import (
	"context"
	"encoding/json"
	"fmt"
	"regexp"
	"strings"
	"unicode/utf8"

	"github.com/OpenTodoApp/opentodo/internal/agenttools"
)

// Display tools (OpenSpec change assistant-generative-ui, design D1, D2): the
// in-app assistant shows the app's own view of tasks, a day or week, places, a
// note or a project in its answer, or asks a choice. A display tool changes
// nothing and never reaches MCP: it is defined here, not in the shared
// registry. The block it streams carries ids and parameters only; the device
// renders the content from its own rows.

// Block limits.
const (
	// MaxBlocks is the most blocks one answer shows.
	MaxBlocks = 4
	// MaxBlockIDs is the most ids one block names.
	MaxBlockIDs      = 20
	maxBlockTitle    = 80
	maxChoiceText    = 200
	maxChoiceOption  = 60
	minChoiceOptions = 2
	maxChoiceOptions = 4
)

// The display tools' fixed results, the same on the device (its manifest).
var (
	BlockLimitMessage  = fmt.Sprintf("this answer already shows %d blocks, the most one answer can show; nothing more was shown. Go on in words.", MaxBlocks)
	NotFoundMessage    = "none of the ids was found; nothing was shown. Use only ids from tool results."
	ChoiceAskedMessage = "Asked; the user's answer arrives as their next message. End this answer now."
)

// Block kinds, as the stream and the device name them.
const (
	BlockTasks    = "tasks"
	BlockCalendar = "calendar"
	BlockChoice   = "choice"
	BlockMap      = "map"
	BlockNote     = "note"
	BlockProject  = "project"
)

// Block is one shown block: its kind and its checked parameters.
type Block struct {
	Kind     string   `json:"kind"`
	IDs      []string `json:"ids,omitempty"`
	Title    string   `json:"title,omitempty"`
	Date     string   `json:"date,omitempty"`
	Span     string   `json:"span,omitempty"`
	Question string   `json:"question,omitempty"`
	Options  []string `json:"options,omitempty"`
	TaskIDs  []string `json:"task_ids,omitempty"`
	PlaceIDs []string `json:"place_ids,omitempty"`
	ID       string   `json:"id,omitempty"`
}

func idList(desc string) map[string]any {
	return map[string]any{"type": "array", "minItems": 1, "maxItems": MaxBlockIDs, "description": desc, "items": map[string]any{"type": "string"}}
}

func displayObject(required []string, props map[string]any) map[string]any {
	return map[string]any{"type": "object", "properties": props, "required": required, "additionalProperties": false}
}

// DisplayTools are the display tools' definitions, the same for the server and the device.
var DisplayTools = []ToolDef{
	{Name: "show_tasks", Description: "Show tasks in your answer as the app's task rows (checkbox, title, dates), in the order given, at this point of the answer. Use it for the tasks you talk about instead of listing them in prose. Changes nothing.",
		Schema: displayObject([]string{"ids"}, map[string]any{
			"ids":   idList("Task ids from tool results, at most 20."),
			"title": map[string]any{"type": "string", "maxLength": maxBlockTitle, "description": "A short heading for the list, at most 80 characters."},
		})},
	{Name: "show_calendar", Description: "Show the user's calendar for one day, or the week starting on that day, with their dated tasks at their times and the planned total. Use it after planning a day or week, or when asked what a day looks like. Changes nothing.",
		Schema: displayObject([]string{"date", "span"}, map[string]any{
			"date": map[string]any{"type": "string", "pattern": `^\d{4}-\d{2}-\d{2}$`, "description": "The day (YYYY-MM-DD), or the first day of the week."},
			"span": map[string]any{"type": "string", "enum": []string{"day", "week"}},
		})},
	{Name: "ask_choice", Description: "Ask the user a question with 2 to 4 answers shown as buttons. Their choice arrives as their next message, so end your answer after calling it. Use it when you need one decision before you can go on. Changes nothing.",
		Schema: displayObject([]string{"question", "options"}, map[string]any{
			"question": map[string]any{"type": "string", "maxLength": maxChoiceText, "description": "The question, at most 200 characters."},
			"options":  map[string]any{"type": "array", "minItems": minChoiceOptions, "maxItems": maxChoiceOptions, "description": "2 to 4 short answers, at most 60 characters each.", "items": map[string]any{"type": "string", "maxLength": maxChoiceOption}},
		})},
	{Name: "show_map", Description: "Show tasks' places and saved places on a map with a list, at this point of the answer. Use it when where things happen matters, for example errands. Changes nothing.",
		Schema: displayObject([]string{}, map[string]any{
			"task_ids":  map[string]any{"type": "array", "maxItems": MaxBlockIDs, "description": "Ids of tasks with a location.", "items": map[string]any{"type": "string"}},
			"place_ids": map[string]any{"type": "array", "maxItems": MaxBlockIDs, "description": "Ids of saved places.", "items": map[string]any{"type": "string"}},
		})},
	{Name: "show_note", Description: "Show a note (its title and the start of its text) with a way to open it. Changes nothing.",
		Schema: displayObject([]string{"id"}, map[string]any{"id": map[string]any{"type": "string", "description": "A note id from tool results."}})},
	{Name: "show_project", Description: "Show a project's outline: its sections and how many open tasks each has, with a way to open it. Changes nothing.",
		Schema: displayObject([]string{"id"}, map[string]any{"id": map[string]any{"type": "string", "description": "A project id from tool results."}})},
}

// skillDisplay lists the display tools each skill may use (design D1); the
// skills' registry tools stay in agenttools, which MCP's prompts share.
var skillDisplay = map[string][]string{
	"plan-week":       {"show_calendar", "ask_choice"},
	"triage-inbox":    {"show_tasks", "ask_choice"},
	"idea-to-project": {"show_project", "ask_choice"},
	"capture":         {"ask_choice"},
}

func isDisplay(name string) bool {
	for _, d := range DisplayTools {
		if d.Name == name {
			return true
		}
	}
	return false
}

// displayOffered reports whether a turn offers the display tool: every one
// without a skill, the skill's own with one.
func displayOffered(name string, skill *agenttools.Skill) bool {
	if skill == nil {
		return isDisplay(name)
	}
	for _, n := range skillDisplay[skill.ID] {
		if n == name {
			return true
		}
	}
	return false
}

// SkillDisplayTools lists a skill's display tools (the device manifest).
func SkillDisplayTools(id string) []string { return append([]string{}, skillDisplay[id]...) }

// Shower checks the ids a block names: the registry's Shown.
type Shower interface {
	Shown(ctx context.Context, userID, kind string, ids []string) ([]string, error)
}

// displayTurn is one turn's display state: the blocks shown so far.
type displayTurn struct {
	shower Shower
	userID string
	shown  int
	emit   func(Block)
}

var datePattern = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}$`)

type argError string

func (e argError) Error() string { return string(e) }

func checkText(field, s string, max int, required bool) (string, error) {
	s = strings.TrimSpace(s)
	if s == "" && required {
		return "", argError(field + " is required")
	}
	if utf8.RuneCountInString(s) > max {
		return "", argError(fmt.Sprintf("%s is longer than %d characters", field, max))
	}
	return s, nil
}

func checkIDs(field string, ids []string, required bool) error {
	if required && len(ids) == 0 {
		return argError(field + " needs at least one id")
	}
	if len(ids) > MaxBlockIDs {
		return argError(fmt.Sprintf("%s holds at most %d ids", field, MaxBlockIDs))
	}
	return nil
}

// parseBlock reads a display call's arguments into a block, before its ids are checked.
func parseBlock(name string, raw json.RawMessage) (Block, error) {
	var a struct {
		IDs      []string `json:"ids"`
		Title    *string  `json:"title"`
		Date     string   `json:"date"`
		Span     string   `json:"span"`
		Question string   `json:"question"`
		Options  []string `json:"options"`
		TaskIDs  []string `json:"task_ids"`
		PlaceIDs []string `json:"place_ids"`
		ID       string   `json:"id"`
	}
	if len(raw) > 0 && string(raw) != "null" {
		if err := json.Unmarshal(raw, &a); err != nil {
			return Block{}, argError("the arguments are not a JSON object of the tool's schema")
		}
	}
	var err error
	switch name {
	case "show_tasks":
		b := Block{Kind: BlockTasks, IDs: a.IDs}
		if a.Title != nil {
			if b.Title, err = checkText("title", *a.Title, maxBlockTitle, false); err != nil {
				return Block{}, err
			}
		}
		return b, checkIDs("ids", a.IDs, true)
	case "show_calendar":
		if !datePattern.MatchString(a.Date) {
			return Block{}, argError("date must be YYYY-MM-DD")
		}
		if a.Span != "day" && a.Span != "week" {
			return Block{}, argError(`span must be "day" or "week"`)
		}
		return Block{Kind: BlockCalendar, Date: a.Date, Span: a.Span}, nil
	case "ask_choice":
		b := Block{Kind: BlockChoice}
		if b.Question, err = checkText("question", a.Question, maxChoiceText, true); err != nil {
			return Block{}, err
		}
		if len(a.Options) < minChoiceOptions || len(a.Options) > maxChoiceOptions {
			return Block{}, argError(fmt.Sprintf("options holds %d to %d answers", minChoiceOptions, maxChoiceOptions))
		}
		for _, o := range a.Options {
			o, err = checkText("each option", o, maxChoiceOption, true)
			if err != nil {
				return Block{}, err
			}
			b.Options = append(b.Options, o)
		}
		return b, nil
	case "show_map":
		if len(a.TaskIDs)+len(a.PlaceIDs) == 0 {
			return Block{}, argError("name at least one task id or place id")
		}
		if len(a.TaskIDs)+len(a.PlaceIDs) > MaxBlockIDs {
			return Block{}, argError(fmt.Sprintf("a map shows at most %d items", MaxBlockIDs))
		}
		return Block{Kind: BlockMap, TaskIDs: a.TaskIDs, PlaceIDs: a.PlaceIDs}, nil
	case "show_note", "show_project":
		if strings.TrimSpace(a.ID) == "" {
			return Block{}, argError("id is required")
		}
		kind := BlockNote
		if name == "show_project" {
			kind = BlockProject
		}
		return Block{Kind: kind, ID: a.ID}, nil
	}
	return Block{}, argError("unknown display tool")
}

// check keeps the ids that name a live, visible entity; found is how many are left.
func (d *displayTurn) check(ctx context.Context, b Block) (Block, int, int, error) {
	keep := func(kind string, ids []string) ([]string, error) {
		if len(ids) == 0 {
			return nil, nil
		}
		return d.shower.Shown(ctx, d.userID, kind, ids)
	}
	var err error
	asked, found := 0, 0
	switch b.Kind {
	case BlockTasks:
		asked = len(b.IDs)
		b.IDs, err = keep(agenttools.ShownTask, b.IDs)
		found = len(b.IDs)
	case BlockMap:
		asked = len(b.TaskIDs) + len(b.PlaceIDs)
		if b.TaskIDs, err = keep(agenttools.ShownTask, b.TaskIDs); err == nil {
			b.PlaceIDs, err = keep(agenttools.ShownPlace, b.PlaceIDs)
		}
		found = len(b.TaskIDs) + len(b.PlaceIDs)
	case BlockNote, BlockProject:
		kind := agenttools.ShownNote
		if b.Kind == BlockProject {
			kind = agenttools.ShownProject
		}
		var ids []string
		ids, err = keep(kind, []string{b.ID})
		asked, found = 1, len(ids)
	case BlockCalendar:
		asked, found = 1, 1
	case BlockChoice:
		asked, found = len(b.Options), len(b.Options)
	}
	return b, asked, found, err
}

// run handles one display call: the checks, the limit, the block, the result.
func (d *displayTurn) run(ctx context.Context, call ToolCall) (string, bool, error) {
	if d.shown >= MaxBlocks {
		return marshal(map[string]any{"error": "block_limit", "message": BlockLimitMessage}), true, nil
	}
	b, err := parseBlock(call.Name, call.Args)
	if err != nil {
		return marshal(map[string]any{"error": "invalid_arguments", "message": err.Error()}), true, nil
	}
	b, asked, found, err := d.check(ctx, b)
	if err != nil {
		return "", true, err
	}
	if found == 0 {
		return marshal(map[string]any{"error": "not_found", "message": NotFoundMessage}), true, nil
	}
	d.shown++
	if d.emit != nil {
		d.emit(b)
	}
	out := map[string]any{"shown": b.Kind, "count": found}
	if asked > found {
		out["not_found"] = asked - found
	}
	if b.Kind == BlockChoice {
		out["message"] = ChoiceAskedMessage
	}
	return marshal(out), false, nil
}
