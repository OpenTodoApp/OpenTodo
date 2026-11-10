package assistant

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"regexp"
	"strings"
	"time"
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
	// MaxBlockDays is the widest range a time or deadlines block covers
	// (assistant-time-blocks).
	MaxBlockDays = 31
	// Free time blocks name stretches of at least this many minutes (default 30).
	defaultFreeMinutes = 30
	maxFreeMinutes     = 12 * 60
	// A follow-ups call's suggestions (assistant-followups): 1 to 3, each at most 60 characters.
	maxFollowups    = 3
	maxFollowupText = 60
)

// The display tools' fixed results, the same on the device (its manifest).
var (
	BlockLimitMessage  = fmt.Sprintf("this answer already shows %d blocks, the most one answer can show; nothing more was shown. Go on in words.", MaxBlocks)
	NotFoundMessage    = "none of the ids was found; nothing was shown. Use only ids from tool results."
	ChoiceAskedMessage = "Asked; the user's answer arrives as their next message. End this answer now."
	// The follow-ups' results (assistant-followups D1).
	FollowupsShownMessage  = "Shown as buttons under your answer; do not repeat them in words."
	FollowupsOnceMessage   = "follow-ups are already shown under this answer; nothing more was shown."
	FollowupsChoiceMessage = "this answer asks a choice, so no follow-ups were shown. End this answer now."
)

// Block kinds, as the stream and the device name them.
const (
	BlockTasks    = "tasks"
	BlockCalendar = "calendar"
	BlockChoice   = "choice"
	BlockMap      = "map"
	BlockNote     = "note"
	BlockProject  = "project"
	// The time blocks of OpenSpec change assistant-time-blocks.
	BlockTime      = "time"
	BlockFreeTime  = "free_time"
	BlockDeadlines = "deadlines"
	// The project view blocks of OpenSpec change assistant-project-blocks.
	BlockBoard    = "board"
	BlockTimeline = "timeline"
	BlockActivity = "activity"
	BlockStats    = "stats"
	BlockTask     = "task"
	BlockHabit    = "habit"
	// Follow-up suggestions (assistant-followups): buttons under the answer, not a framed block.
	BlockFollowups = "followups"
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
	// From and To are a time or deadlines block's days, GroupBy how a time
	// block groups ("project" or "day"), MinMinutes a free time block's shortest stretch.
	From       string `json:"from,omitempty"`
	To         string `json:"to,omitempty"`
	GroupBy    string `json:"group_by,omitempty"`
	MinMinutes int    `json:"min_minutes,omitempty"`
	// SectionID is a board block's one column (assistant-project-blocks); Of
	// says whether an activity block's ID is a "project" or a "task".
	SectionID string `json:"section_id,omitempty"`
	Of        string `json:"of,omitempty"`
	// Suggestions are a follow-ups block's next steps (assistant-followups).
	Suggestions []string `json:"suggestions,omitempty"`
}

func idList(desc string) map[string]any {
	return map[string]any{"type": "array", "minItems": 1, "maxItems": MaxBlockIDs, "description": desc, "items": map[string]any{"type": "string"}}
}

func dateProp(desc string) map[string]any {
	return map[string]any{"type": "string", "pattern": `^\d{4}-\d{2}-\d{2}$`, "description": desc}
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
	// The time blocks (assistant-time-blocks): parameters only, drawn from the device's rows.
	{Name: "show_time", Description: "Show the user's own tracked time on the days from..to (at most 31 days) as bars per project or per day, with each total and the overall total. Use it for questions such as where their time went. Changes nothing.",
		Schema: displayObject([]string{"from", "to", "group_by"}, map[string]any{
			"from":     dateProp("First day (YYYY-MM-DD)."),
			"to":       dateProp("Last day (YYYY-MM-DD), at most 30 days after from."),
			"group_by": map[string]any{"type": "string", "enum": []string{"project", "day"}},
		})},
	{Name: "show_free_time", Description: "Show the user's free time on one day, or the week starting on it: the stretches of at least min_minutes within their working day between calendar events, frames, slots and timed tasks. Use it with find_free_time when asked when they are free. Changes nothing; placing a task is a proposal.",
		Schema: displayObject([]string{"date", "span"}, map[string]any{
			"date":        dateProp("The day (YYYY-MM-DD), or the first day of the week."),
			"span":        map[string]any{"type": "string", "enum": []string{"day", "week"}},
			"min_minutes": map[string]any{"type": "integer", "minimum": 1, "maximum": maxFreeMinutes, "description": "Shortest stretch to show, in minutes. Default: 30."},
		})},
	{Name: "show_deadlines", Description: "Show the user's open tasks with a deadline on the days from..to (at most 31 days) in date order, each with its countdown. Use it for questions about what is due by a date. Changes nothing.",
		Schema: displayObject([]string{"from", "to"}, map[string]any{
			"from": dateProp("First day (YYYY-MM-DD); today for what is coming, earlier to include missed deadlines."),
			"to":   dateProp("Last day (YYYY-MM-DD), at most 30 days after from."),
		})},
	// The project view blocks (assistant-project-blocks): ids and days only, drawn
	// from the device's rows with the app's own views, read-only.
	{Name: "show_board", Description: "Show a project's board read-only: one column of cards, the section_id's or, without it, the first with the others to switch to. Use it for what is in a stage of a project, such as what is in progress. Changes nothing.",
		Schema: displayObject([]string{"id"}, map[string]any{
			"id":         idProp("A project id from tool results."),
			"section_id": idProp("A section id of that project from tool results, for one column."),
		})},
	{Name: "show_timeline", Description: "Show a project's open tasks as bars from their start to their deadline or due day, with today marked. Use it for whether a project is on track. Changes nothing.",
		Schema: displayObject([]string{"id"}, map[string]any{"id": idProp("A project id from tool results.")})},
	{Name: "show_activity", Description: "Show the latest changes and comments (at most 20) of one project or one task, newest first, with who made them. Use it for what happened recently. Name exactly one of project_id and task_id. Changes nothing.",
		Schema: displayObject([]string{}, map[string]any{
			"project_id": idProp("A project id from tool results."),
			"task_id":    idProp("A task id from tool results."),
		})},
	{Name: "show_stats", Description: "Show small number cards: tasks completed on the days from..to (at most 31 days), overdue tasks, the Inbox count and Today against the user's Today limit. Use it for how the user is doing. Changes nothing.",
		Schema: displayObject([]string{"from", "to"}, map[string]any{
			"from": dateProp("First day (YYYY-MM-DD)."),
			"to":   dateProp("Last day (YYYY-MM-DD), at most 30 days after from."),
		})},
	{Name: "show_task", Description: "Show one task in full, read-only: its dates, notes, subtasks and latest comments, with a way to open it. Use it when the user asks about one task. Changes nothing.",
		Schema: displayObject([]string{"id"}, map[string]any{"id": idProp("A task id from tool results.")})},
	{Name: "show_habit", Description: "Show a habit's month grid and its current streak. Use it for how a habit is going. The id must be a task marked habit in tool results. Changes nothing.",
		Schema: displayObject([]string{"id"}, map[string]any{"id": idProp("A habit task id from tool results.")})},
	// Follow-up suggestions (assistant-followups D1): text only, once per answer, never with ask_choice.
	{Name: "suggest_followups", Description: "Offer the user 1 to 3 short next steps as buttons under your answer; tapping one sends its text as their next message. Call it at most once, at the end, only when a next step is likely, and never in an answer that calls ask_choice. Changes nothing.",
		Schema: displayObject([]string{"suggestions"}, map[string]any{
			"suggestions": map[string]any{"type": "array", "minItems": 1, "maxItems": maxFollowups, "description": "1 to 3 steps you can do, each at most 60 characters, written as the user would ask in their language, such as \"Move them to Friday\".",
				"items": map[string]any{"type": "string", "maxLength": maxFollowupText}},
		})},
}

func idProp(desc string) map[string]any {
	return map[string]any{"type": "string", "description": desc}
}

// viewDisplay lists the display tools a turn's view suggests (assistant-project-blocks
// D2): a skill turn offers them with the skill's own.
var viewDisplay = map[string][]string{
	"project": {"show_board", "show_timeline"},
	"today":   {"show_stats", "show_deadlines"},
}

// skillDisplay lists the display tools each skill may use (design D1); the
// skills' registry tools stay in agenttools, which MCP's prompts share.
var skillDisplay = map[string][]string{
	"plan-week":       {"show_calendar", "ask_choice", "show_free_time"},
	"weekly-review":   {"show_stats"},
	"triage-inbox":    {"show_tasks", "ask_choice"},
	"idea-to-project": {"show_project", "ask_choice"},
	"capture":         {"ask_choice"},
	// assistant-in-context.
	"find-slot":    {"show_free_time"},
	"project-next": {"show_board", "show_timeline", "show_tasks"},
	"brief-today":  {"show_calendar", "show_deadlines", "show_stats"},
}

// alwaysDisplay are the display tools every turn offers, a skill's included (assistant-followups).
var alwaysDisplay = []string{"suggest_followups"}

// AlwaysDisplayTools is alwaysDisplay for the device manifest.
func AlwaysDisplayTools() []string { return append([]string{}, alwaysDisplay...) }

func isDisplay(name string) bool {
	for _, d := range DisplayTools {
		if d.Name == name {
			return true
		}
	}
	return false
}

// displayOffered reports whether a turn offers the display tool (assistant-project-blocks
// D2). A turn without a skill offers every one: its registry tools already go past
// the providers' strict-tool limits, so it runs without strict mode either way. A
// skill turn offers the skill's own and those its view suggests, which keeps it lean.
func displayOffered(name string, skill *agenttools.Skill, view string) bool {
	if skill == nil {
		return isDisplay(name)
	}
	for _, n := range append(append(skillDisplay[skill.ID], viewDisplay[view]...), alwaysDisplay...) {
		if n == name {
			return true
		}
	}
	return false
}

// SkillDisplayTools lists a skill's display tools (the device manifest).
func SkillDisplayTools(id string) []string { return append([]string{}, skillDisplay[id]...) }

// ViewDisplayTools is viewDisplay for the device manifest.
func ViewDisplayTools() map[string][]string {
	out := map[string][]string{}
	for v, names := range viewDisplay {
		out[v] = append([]string{}, names...)
	}
	return out
}

// Shower checks the ids a block names: the registry's Shown.
type Shower interface {
	Shown(ctx context.Context, userID, kind string, ids []string) ([]string, error)
	// ShownSection reports whether the section is a live column of the project (a board block).
	ShownSection(ctx context.Context, userID, projectID, sectionID string) (bool, error)
}

// displayTurn is one turn's display state: the blocks shown so far, and
// whether the answer asked a choice or showed its follow-ups.
type displayTurn struct {
	shower    Shower
	userID    string
	shown     int
	choice    bool
	followups bool
	emit      func(Block)
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

// checkRange reads a block's days from..to: two dates in order, at most MaxBlockDays.
func checkRange(from, to string) error {
	f, err1 := time.Parse(time.DateOnly, from)
	l, err2 := time.Parse(time.DateOnly, to)
	if !datePattern.MatchString(from) || !datePattern.MatchString(to) || err1 != nil || err2 != nil {
		return argError("from and to must be YYYY-MM-DD")
	}
	if l.Before(f) {
		return argError("to must not be before from")
	}
	if l.After(f.AddDate(0, 0, MaxBlockDays-1)) {
		return argError(fmt.Sprintf("a block covers at most %d days", MaxBlockDays))
	}
	return nil
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
		From     string   `json:"from"`
		To       string   `json:"to"`
		GroupBy  string   `json:"group_by"`
		Min      *float64 `json:"min_minutes"`
		Section  string   `json:"section_id"`
		Project  string   `json:"project_id"`
		Task     string   `json:"task_id"`
		Suggest  []string `json:"suggestions"`
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
	case "show_time":
		if err := checkRange(a.From, a.To); err != nil {
			return Block{}, err
		}
		if a.GroupBy != "project" && a.GroupBy != "day" {
			return Block{}, argError(`group_by must be "project" or "day"`)
		}
		return Block{Kind: BlockTime, From: a.From, To: a.To, GroupBy: a.GroupBy}, nil
	case "show_free_time":
		if !datePattern.MatchString(a.Date) {
			return Block{}, argError("date must be YYYY-MM-DD")
		}
		if a.Span != "day" && a.Span != "week" {
			return Block{}, argError(`span must be "day" or "week"`)
		}
		least := defaultFreeMinutes
		if a.Min != nil {
			if *a.Min != math.Trunc(*a.Min) || *a.Min < 1 || *a.Min > maxFreeMinutes {
				return Block{}, argError(fmt.Sprintf("min_minutes must be a whole number from 1 to %d", maxFreeMinutes))
			}
			least = int(*a.Min)
		}
		return Block{Kind: BlockFreeTime, Date: a.Date, Span: a.Span, MinMinutes: least}, nil
	case "show_deadlines":
		if err := checkRange(a.From, a.To); err != nil {
			return Block{}, err
		}
		return Block{Kind: BlockDeadlines, From: a.From, To: a.To}, nil
	case "show_board", "show_timeline", "show_task", "show_habit":
		if strings.TrimSpace(a.ID) == "" {
			return Block{}, argError("id is required")
		}
		kinds := map[string]string{"show_board": BlockBoard, "show_timeline": BlockTimeline, "show_task": BlockTask, "show_habit": BlockHabit}
		b := Block{Kind: kinds[name], ID: a.ID}
		if name == "show_board" {
			b.SectionID = strings.TrimSpace(a.Section)
		}
		return b, nil
	case "show_activity":
		p, tk := strings.TrimSpace(a.Project), strings.TrimSpace(a.Task)
		if (p == "") == (tk == "") {
			return Block{}, argError("name exactly one of project_id and task_id")
		}
		if p != "" {
			return Block{Kind: BlockActivity, Of: "project", ID: p}, nil
		}
		return Block{Kind: BlockActivity, Of: "task", ID: tk}, nil
	case "show_stats":
		if err := checkRange(a.From, a.To); err != nil {
			return Block{}, err
		}
		return Block{Kind: BlockStats, From: a.From, To: a.To}, nil
	case "suggest_followups":
		if len(a.Suggest) < 1 || len(a.Suggest) > maxFollowups {
			return Block{}, argError(fmt.Sprintf("suggestions holds 1 to %d steps", maxFollowups))
		}
		b := Block{Kind: BlockFollowups}
		for _, s := range a.Suggest {
			s, err = checkText("each suggestion", s, maxFollowupText, true)
			if err != nil {
				return Block{}, err
			}
			b.Suggestions = append(b.Suggestions, s)
		}
		return b, nil
	}
	return Block{}, argError("unknown display tool")
}

// oneKind is the entity a one-id project view block names (its kind, and Of for activity).
var oneKind = map[string]string{BlockBoard: agenttools.ShownProject, BlockTimeline: agenttools.ShownProject, BlockActivity + "project": agenttools.ShownProject,
	BlockActivity + "task": agenttools.ShownTask, BlockTask: agenttools.ShownTask, BlockHabit: agenttools.ShownHabit}

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
	case BlockBoard, BlockTimeline, BlockActivity, BlockTask, BlockHabit:
		var ids []string
		ids, err = keep(oneKind[b.Kind+b.Of], []string{b.ID})
		asked, found = 1, len(ids)
		if err == nil && found == 1 && b.SectionID != "" {
			// A column of another project, or a gone one, is not found.
			var ok bool
			if ok, err = d.shower.ShownSection(ctx, d.userID, b.ID, b.SectionID); !ok {
				found = 0
			}
		}
	case BlockCalendar, BlockTime, BlockFreeTime, BlockDeadlines, BlockStats:
		asked, found = 1, 1
	case BlockChoice:
		asked, found = len(b.Options), len(b.Options)
	case BlockFollowups:
		asked, found = len(b.Suggestions), len(b.Suggestions)
	}
	return b, asked, found, err
}

// run handles one display call: the checks, the limit, the block, the result.
func (d *displayTurn) run(ctx context.Context, call ToolCall) (string, bool, error) {
	if call.Name == "suggest_followups" {
		return d.followupsCall(call)
	}
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
		d.choice = true
		out["message"] = ChoiceAskedMessage
	}
	return marshal(out), false, nil
}

// followupsCall handles suggest_followups (assistant-followups D1): outside the
// block limit, at most once per answer and never in an answer that asked a choice.
func (d *displayTurn) followupsCall(call ToolCall) (string, bool, error) {
	if d.choice {
		return marshal(map[string]any{"error": "choice_asked", "message": FollowupsChoiceMessage}), true, nil
	}
	if d.followups {
		return marshal(map[string]any{"error": "followups_shown", "message": FollowupsOnceMessage}), true, nil
	}
	b, err := parseBlock(call.Name, call.Args)
	if err != nil {
		return marshal(map[string]any{"error": "invalid_arguments", "message": err.Error()}), true, nil
	}
	d.followups = true
	if d.emit != nil {
		d.emit(b)
	}
	return marshal(map[string]any{"shown": b.Kind, "count": len(b.Suggestions), "message": FollowupsShownMessage}), false, nil
}
