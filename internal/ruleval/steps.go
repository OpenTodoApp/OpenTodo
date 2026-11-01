package ruleval

// Routine steps (OpenSpec change routines-engine, design D3 and D4): the step
// table, the shape check of a rule's `steps` value and the type checker. The
// web client has the same table and checker in web/src/lib/rules/steps.ts;
// both run web/src/lib/rules/steps.vectors.json.

// Type is the type of a step's output or of a value a step input accepts.
type Type string

// The step types. Lines is a list of Text; None is "no output".
const (
	TText    Type = "text"
	TTask    Type = "task"
	TTasks   Type = "tasks"
	TProject Type = "project"
	TDate    Type = "date"
	TNumber  Type = "number"
	TLines   Type = "lines"
	TNone    Type = "none"
)

// Lit is the literal shape an input accepts.
type Lit string

// Literal shapes (design D3).
const (
	LitNone      Lit = ""          // a reference only
	LitText      Lit = "text"      // a string, or {"format": template}
	LitNumber    Lit = "number"    // a finite number
	LitDate      Lit = "date"      // YYYY-MM-DD, "today", "tomorrow" or {"in_days": n}
	LitProject   Lit = "project"   // {"project": id}
	LitTask      Lit = "task"      // {"task": id}
	LitLines     Lit = "lines"     // a list of strings
	LitBool      Lit = "bool"      // true or false
	LitEnum      Lit = "enum"      // one of Input.Enum
	LitID        Lit = "id"        // an id string
	LitIDs       Lit = "ids"       // a list of id strings
	LitActions   Lit = "actions"   // a rule's actions, with energy and trash
	LitCondition Lit = "condition" // a rule's condition
	LitCompare   Lit = "compare"   // {">": 10}, {"empty": true}, {"contains": "x"}
	LitPeriod    Lit = "period"    // today, this_week, last_week, this_month or {from, to}
	LitWhere     Lit = "where"     // a condition (tasks) or {contains|not_contains: text} (lines)
)

// Input is one named input of a step kind.
type Input struct {
	Name string `json:"name"`
	// Accepts lists the types a reference may have; empty for a literal-only input.
	Accepts []Type `json:"accepts"`
	// Lit is the literal shape; LitNone for a reference-only input.
	Lit      Lit      `json:"literal,omitempty"`
	Enum     []string `json:"enum,omitempty"`
	Required bool     `json:"required,omitempty"`
	// Max bounds a text literal (characters) or a number literal.
	Max int `json:"max,omitempty"`
	// Content marks an input whose value is user-written text (design D9).
	Content bool `json:"content,omitempty"`
}

// Groups of the step catalogue, in the editor's order.
const (
	GroupTasks    = "tasks"
	GroupProjects = "projects"
	GroupText     = "text"
	GroupLogic    = "logic"
	GroupTime     = "time"
	GroupComms    = "communication"
	// GroupAI holds Ask AI and Summarise (routines-ai-step D1).
	GroupAI = "ai"
)

// Needs of a step beyond automations.enabled (design D15).
const (
	NeedsEmail        = "email"
	NeedsWebhook      = "webhook"
	NeedsTimeTracking = "time_tracking"
	NeedsFocus        = "focus"
	NeedsShared       = "shared"
	// NeedsAI: the assistant usable by the user with consent for routines
	// (routines-ai-step D1, D10).
	NeedsAI = "ai"
)

// StepKind is one row of the step catalogue (design D4).
type StepKind struct {
	Kind   string  `json:"kind"`
	Group  string  `json:"group"`
	Inputs []Input `json:"inputs"`
	// Out is the output type; SameAs names the input whose type the output takes.
	Out    Type   `json:"output"`
	SameAs string `json:"same_as,omitempty"`
	// OneOf lists input sets of which exactly one must be given.
	OneOf [][]string `json:"one_of,omitempty"`
	// Content: the step always reads or writes user-written text.
	Content bool `json:"content"`
	// Needs names what the step needs beyond the automations switch.
	Needs string `json:"needs,omitempty"`
	// Blocks names the step's blocks (if: then, otherwise; repeat: do).
	Blocks []string `json:"blocks,omitempty"`
	// Tool is the agent tool registry tool the step is planned through.
	Tool string `json:"tool,omitempty"`
}

var (
	anyList = []Type{TTasks, TLines}
	textIn  = []Type{TText}
	// aiContext is what an Ask AI step may read (routines-ai-step D1).
	aiContext = []Type{TText, TLines, TTasks, TProject}
)

func in(name string, accepts []Type, lit Lit) Input {
	return Input{Name: name, Accepts: accepts, Lit: lit}
}

func req(i Input) Input { i.Required = true; return i }

func content(i Input) Input { i.Content = true; return i }

func bound(i Input, n int) Input { i.Max = n; return i }

func enum(name string, values ...string) Input { return Input{Name: name, Lit: LitEnum, Enum: values} }

// Bounds of a routine (design D3 and D6).
const (
	MaxSteps       = 20
	MaxBlockDepth  = 3
	MaxStepsBytes  = 32 * 1024
	MaxStepIDLen   = 8
	MaxListItems   = 500
	MaxTextBytes   = 64 * 1024
	MaxTemplate    = 4000
	MaxNotifyText  = 300
	MaxSubject     = 120
	MaxEmailText   = 20000
	MaxStopReason  = 200
	MaxIterations  = 500
	MaxFocusTasks  = 3
	MaxLiteralText = 20000
	// AI steps (routines-ai-step D1).
	MaxAISteps       = 3
	MaxAIInstruction = 2000
)

// Steps is the step catalogue, grouped and ordered as the editor shows it.
var Steps = []StepKind{
	// Tasks
	{Kind: "find_tasks", Group: GroupTasks, Out: TTasks, OneOf: [][]string{{"query", "view", "condition"}},
		Inputs: []Input{content(bound(in("query", nil, LitText), 1000)), content(in("view", nil, LitID)), in("condition", nil, LitCondition), bound(in("limit", nil, LitNumber), MaxListItems)}},
	{Kind: "create_tasks", Group: GroupTasks, Out: TTasks, Content: true, Tool: "create_tasks", OneOf: [][]string{{"text", "title"}},
		Inputs: []Input{content(in("text", []Type{TText, TLines}, LitText)), content(bound(in("title", textIn, LitText), 500)),
			in("project", []Type{TProject}, LitProject), in("section", nil, LitID), in("due", []Type{TDate}, LitDate),
			bound(in("priority", []Type{TNumber}, LitNumber), 4), in("labels", nil, LitIDs), enum("energy", "deep", "medium", "low")}},
	{Kind: "change_tasks", Group: GroupTasks, Out: TTasks, SameAs: "", Tool: "update_tasks",
		Inputs: []Input{req(in("tasks", []Type{TTasks}, LitNone)), req(in("set", nil, LitActions))}},
	{Kind: "add_comment", Group: GroupTasks, Out: TNone, Content: true, Tool: "add_comment",
		Inputs: []Input{req(in("task", []Type{TTask}, LitTask)), req(content(bound(in("text", textIn, LitText), MaxComment)))}},
	{Kind: "get_task", Group: GroupTasks, Out: TTask,
		Inputs: []Input{req(in("task", []Type{TTask}, LitTask))}},
	// Projects
	{Kind: "find_project", Group: GroupProjects, Out: TProject, Content: true,
		Inputs: []Input{req(content(bound(in("name", textIn, LitText), 120)))}},
	{Kind: "create_project", Group: GroupProjects, Out: TProject, Content: true, Tool: "create_project",
		Inputs: []Input{req(content(bound(in("name", textIn, LitText), 120))), in("parent", []Type{TProject}, LitProject), in("color", nil, LitID), in("icon", nil, LitID)}},
	{Kind: "update_project", Group: GroupProjects, Out: TProject, Tool: "update_project",
		Inputs: []Input{req(in("project", []Type{TProject}, LitProject)), content(bound(in("name", textIn, LitText), 120)), in("color", nil, LitID), in("icon", nil, LitID), in("archived", nil, LitBool)}},
	{Kind: "create_sections", Group: GroupProjects, Out: TNone, Content: true, Tool: "create_sections",
		Inputs: []Input{req(in("project", []Type{TProject}, LitProject)), req(content(in("names", []Type{TLines}, LitLines)))}},
	{Kind: "create_labels", Group: GroupProjects, Out: TNone, Content: true, Tool: "create_label",
		Inputs: []Input{req(content(in("names", []Type{TLines}, LitLines)))}},
	{Kind: "favourite", Group: GroupProjects, Out: TNone, Tool: "set_favourite",
		Inputs: []Input{req(in("project", []Type{TProject}, LitProject)), req(in("on", nil, LitBool))}},
	{Kind: "project_from_template", Group: GroupProjects, Out: TProject, Content: true,
		Inputs: []Input{req(in("template", nil, LitID)), req(in("start", []Type{TDate}, LitDate)), content(bound(in("name", textIn, LitText), 120))}},
	// Notes and text
	{Kind: "note_text", Group: GroupText, Out: TText, Content: true,
		Inputs: []Input{req(in("of", []Type{TTask, TProject}, LitNone))}},
	{Kind: "append_to_note", Group: GroupText, Out: TNone, Content: true, Tool: "append_to_note",
		Inputs: []Input{req(in("of", []Type{TTask, TProject}, LitNone)), req(content(in("text", textIn, LitText)))}},
	{Kind: "clear_note", Group: GroupText, Out: TNone, Content: true,
		Inputs: []Input{req(in("of", []Type{TTask, TProject}, LitNone))}},
	{Kind: "split_lines", Group: GroupText, Out: TLines, Content: true,
		Inputs: []Input{req(in("text", textIn, LitText))}},
	{Kind: "join", Group: GroupText, Out: TText, Content: true,
		Inputs: []Input{req(in("lines", []Type{TLines}, LitLines)), bound(in("separator", nil, LitText), 20)}},
	{Kind: "format", Group: GroupText, Out: TText, Content: true,
		Inputs: []Input{req(content(bound(in("template", nil, LitText), MaxTemplate)))}},
	{Kind: "replace", Group: GroupText, Out: TText, Content: true,
		Inputs: []Input{req(in("text", textIn, LitText)), req(content(bound(in("find", nil, LitText), 500))), content(bound(in("with", nil, LitText), 500)), in("case", nil, LitBool)}},
	// Lists and logic
	{Kind: "filter", Group: GroupLogic, Out: TNone, SameAs: "list",
		Inputs: []Input{req(in("list", anyList, LitNone)), req(in("where", nil, LitWhere))}},
	{Kind: "sort", Group: GroupLogic, Out: TNone, SameAs: "list",
		Inputs: []Input{req(in("list", anyList, LitNone)), req(enum("by", "due", "deadline", "priority", "created", "title", "text")), enum("direction", "asc", "desc")}},
	{Kind: "take", Group: GroupLogic, Out: TNone, SameAs: "list",
		Inputs: []Input{req(in("list", anyList, LitNone)), req(bound(in("n", nil, LitNumber), MaxListItems)), enum("from", "start", "end")}},
	{Kind: "count", Group: GroupLogic, Out: TNumber,
		Inputs: []Input{req(in("list", anyList, LitNone))}},
	{Kind: "if", Group: GroupLogic, Out: TNone, Blocks: []string{"then", "otherwise"},
		Inputs: []Input{req(in("value", []Type{TNumber, TText, TDate, TTasks, TLines, TTask, TProject}, LitNone)), req(in("is", nil, LitCompare))}},
	{Kind: "repeat", Group: GroupLogic, Out: TNone, Blocks: []string{"do"},
		Inputs: []Input{req(in("list", anyList, LitNone))}},
	{Kind: "stop", Group: GroupLogic, Out: TNone,
		Inputs: []Input{bound(in("reason", nil, LitText), MaxStopReason)}},
	// Time and focus
	{Kind: "start_timer", Group: GroupTime, Out: TNone, Needs: NeedsTimeTracking, Tool: "start_timer",
		Inputs: []Input{req(in("task", []Type{TTask}, LitTask))}},
	{Kind: "stop_timer", Group: GroupTime, Out: TNone, Needs: NeedsTimeTracking, Tool: "stop_timer"},
	{Kind: "tracked_time", Group: GroupTime, Out: TNumber, Needs: NeedsTimeTracking,
		Inputs: []Input{req(in("period", nil, LitPeriod)), in("project", []Type{TProject}, LitProject)}},
	{Kind: "set_focus", Group: GroupTime, Out: TNone, Needs: NeedsFocus,
		Inputs: []Input{req(in("tasks", []Type{TTasks}, LitNone))}},
	// Communication
	{Kind: "notify", Group: GroupComms, Out: TNone, Content: true,
		Inputs: []Input{req(content(bound(in("text", textIn, LitText), MaxNotifyText))), in("task", []Type{TTask}, LitTask)}},
	{Kind: "webhook", Group: GroupComms, Out: TNone, Needs: NeedsWebhook,
		Inputs: []Input{req(in("webhook_id", nil, LitID)), content(bound(in("text", textIn, LitText), MaxLiteralText)), in("tasks", []Type{TTasks}, LitNone)}},
	{Kind: "email_me", Group: GroupComms, Out: TNone, Content: true, Needs: NeedsEmail,
		Inputs: []Input{req(content(bound(in("subject", textIn, LitText), MaxSubject))), req(content(bound(in("text", textIn, LitText), MaxEmailText)))}},
	// AI (routines-ai-step D1): one provider call without tools; the answer is text.
	{Kind: "ask_ai", Group: GroupAI, Out: TText, Content: true, Needs: NeedsAI,
		Inputs: []Input{req(content(bound(in("instruction", nil, LitText), MaxAIInstruction))),
			in("context", aiContext, LitNone), in("context2", aiContext, LitNone), in("context3", aiContext, LitNone), enum("answer", "text", "lines")}},
	{Kind: "summarise", Group: GroupAI, Out: TText, Content: true, Needs: NeedsAI,
		Inputs: []Input{req(in("text", []Type{TText, TLines, TTasks}, LitNone)), enum("length", "short", "medium")}},
	{Kind: "email_members", Group: GroupComms, Out: TNone, Content: true, Needs: NeedsShared,
		Inputs: []Input{req(content(bound(in("subject", textIn, LitText), MaxSubject))), req(content(bound(in("text", textIn, LitText), MaxEmailText)))}},
}

// IsAI reports an AI step kind (routines-ai-step D1).
func IsAI(kind string) bool { return kind == "ask_ai" || kind == "summarise" }

// HasAI reports whether a routine holds an AI step.
func HasAI(steps []Step) bool {
	found := false
	Walk(steps, func(s *Step) { found = found || IsAI(s.Kind) })
	return found
}

// StepKindOf returns a kind's row.
func StepKindOf(kind string) (*StepKind, bool) {
	for i := range Steps {
		if Steps[i].Kind == kind {
			return &Steps[i], true
		}
	}
	return nil, false
}

func (k *StepKind) input(name string) (*Input, bool) {
	for i := range k.Inputs {
		if k.Inputs[i].Name == name {
			return &k.Inputs[i], true
		}
	}
	return nil, false
}

// TriggerOutput is the type the reference "trigger" has (design D3): the task
// for event, due and overdue triggers and for a manual run; for a schedule the
// matching open tasks when the routine has a condition, the firing day otherwise.
func TriggerOutput(kind string, hasCondition bool) Type {
	if kind == Schedule {
		if hasCondition {
			return TTasks
		}
		return TDate
	}
	return TTask
}
