package agenttools

import "fmt"

// Built-in assistant skills (OpenSpec change assistant-skills, design D1, D6):
// named workflows the in-app assistant runs and MCP serves as prompts. A skill
// is data: instructions, the tools it may use (a subset of this registry) and
// the form of its result. Ids are added, never renamed or reused.

// Skill results.
const (
	ResultChanges = "changes" // a proposed change set, reviewed in the app
	ResultAnswer  = "answer"  // a read-only answer
)

// What the user's own text means for a skill.
const (
	SubjectNone      = ""
	SubjectSelection = "selection" // the selected task(s) are the subject
	SubjectPasted    = "pasted"    // the user's text or pasted notes are the material
)

// Skill is one built-in workflow.
type Skill struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description"`
	// Example is a prompt the user could send with this skill.
	Example string `json:"example"`
	// Instructions are appended to the assistant's fixed instructions; they
	// never replace them.
	Instructions string `json:"-"`
	// Tools are the registry tools this skill may use.
	Tools   []string `json:"-"`
	Result  string   `json:"result"`
	Subject string   `json:"subject,omitempty"`
}

// readTools are every read tool; skills that look around use all of them.
var readTools = []string{"today_summary", "list_projects", "list_tasks", "search_tasks", "get_task"}

func withRead(tools ...string) []string { return append(append([]string{}, readTools...), tools...) }

// Skills is the catalogue, in the order the app shows it.
var Skills = []Skill{
	{
		ID: "idea-to-project", Name: "Turn an idea into a project", Result: ResultChanges, Subject: SubjectPasted,
		Description: "Turns an idea or pasted notes into a project with phases and estimated tasks.",
		Example:     "Plan a garden makeover in spring, budget 2000",
		Tools:       []string{"list_projects", "create_project", "create_tasks", "create_label"},
		Instructions: `Turn the user's idea (and any pasted notes) into exactly one new project.
Do it in exactly these steps:
1. Call list_projects, and pick a project name that does not exist yet.
2. Call create_project with that name. Its result has the new project's id.
3. Call create_tasks once with 2 to 6 phases: items with project_id set to the new project's id, each titled after a phase.
4. Call create_tasks once more with the work items, 3 to 20 in total: each with parent_id set to its phase's id and estimate_minutes.
- Use short, concrete task titles that start with a verb. Put details in the description only when they help.
- Add due dates only when the idea names a date or deadline. Add labels only when the user asks for them.
- Do not change existing projects or tasks.
- End with a two-line summary: the project name, the number of phases and tasks, and the total estimate.`,
	},
	{
		ID: "plan-week", Name: "Plan my week", Result: ResultChanges,
		Description: "Proposes due dates and times for your open work within your working hours.",
		Example:     "Plan my week around the Q4 launch",
		Tools:       []string{"list_tasks", "search_tasks", "get_task", "schedule_tasks", "update_tasks"},
		Instructions: `Plan the user's open work over the next 7 days, starting today.
- Read what is due, overdue and in the Inbox with list_tasks (views today, upcoming and inbox), and what the user mentions with search_tasks.
- Call schedule_tasks with a date (YYYY-MM-DD) in the next 7 days for every task you plan: overdue and high-priority tasks first, then the rest. Keep dates that are already set unless the day is over-full or the date has passed.
- Never set a due date to null and never remove a date.
- Respect the working day below: count every task's estimate on the day it is due, including tasks already scheduled there, and never plan more minutes on a day than the day allows. Tasks without an estimate count as 30 minutes; say so in the answer.
- Give times only within the day's start and end, and only when the task needs a slot.
- Do not create, complete or trash tasks.
- End with one line per day: the date, the planned minutes and the tasks.`,
	},
	{
		ID: "weekly-review", Name: "Weekly review", Result: ResultChanges,
		Description: "Walks your inbox, overdue and stale tasks and proposes what to reschedule, move or complete.",
		Example:     "Run my weekly review",
		Tools:       withRead("schedule_tasks", "move_tasks", "complete_tasks", "update_tasks", "trash_tasks"),
		Instructions: `Run a weekly review of the user's tasks, in the three phases of the app's own weekly review (Open Loops).
- Get clear: look at the Inbox with list_tasks (view inbox). Propose move_tasks to put each Inbox task that fits a project there.
- Get current: look at overdue tasks, tasks due in the next 7 days, tasks assigned to someone else or blocked by another task, and each project with list_projects. For an overdue task call schedule_tasks with a new date in the next 7 days, or complete_tasks only when the user said it is done; update_tasks may lower a priority. Name every project that has no task the user can do now, and suggest its next step in words.
- Get creative: mention up to three Someday tasks that might be worth starting now.
- Propose at least one change when anything is overdue. Never propose trashing an existing task; mention it as a candidate instead.
- Keep the proposal within 50 changed items; offer to continue afterwards.
- End with a short summary: what is overdue, what was rescheduled or moved, the projects without a next step, and up to three tasks that deserve attention this week.`,
	},
	{
		ID: "triage-inbox", Name: "Triage my inbox", Result: ResultChanges,
		Description: "Proposes a project, labels, priority and date for each task in your inbox.",
		Example:     "Triage my inbox",
		Tools:       withRead("update_tasks", "move_tasks", "schedule_tasks", "create_label"),
		Instructions: `Triage the user's Inbox.
- Read the Inbox with list_tasks (view inbox) and the projects with list_projects.
- For each Inbox task that fits a project, call move_tasks with that project's id from list_projects. Add a priority, labels or a due date (update_tasks, schedule_tasks) only when the task's text gives a reason. Leave a task in the Inbox when no project fits, and say so.
- Create a label only when several tasks clearly share a theme that no existing label covers.
- Keep the proposal within 50 changed items.
- End with a table-free list: task, where it goes, and why in a few words.`,
	},
	{
		ID: "break-down", Name: "Break this down", Result: ResultChanges, Subject: SubjectSelection,
		Description: "Turns one task into subtasks with estimates.",
		Example:     "Break this task into steps",
		Tools:       []string{"get_task", "create_tasks"},
		Instructions: `Break the user's selected task into subtasks. When no task is selected, ask which one, and propose nothing.
- Read the task with get_task.
- Call create_tasks once with 3 to 10 items, each with parent_id set to the selected task's id (the project is taken from the parent), a short title that starts with a verb, and estimate_minutes.
- Keep the parent task as it is; do not change its title, date or project.
- End with the subtasks as a list and their total estimate.`,
	},
}

// SkillByID returns a built-in skill.
func SkillByID(id string) (Skill, bool) {
	for _, s := range Skills {
		if s.ID == id {
			return s, true
		}
	}
	return Skill{}, false
}

// Allows reports whether the skill may use the named tool.
func (s Skill) Allows(tool string) bool {
	for _, t := range s.Tools {
		if t == tool {
			return true
		}
	}
	return false
}

// WorkdayNote is the plan-week rule with the device's working day (design D2).
func WorkdayNote(startHour, endHour, dayLength int) string {
	return fmt.Sprintf("Working day: from %02d:00 to %02d:00, at most %d minutes of planned work per day. Never plan more than %d minutes on one day, "+
		"counting the estimates of tasks already due that day; tasks without an estimate count as 30 minutes.", startHour, endHour, dayLength, dayLength)
}
