package cli

// The command model (OpenSpec change `agent-ready-cli`, design D3): one table
// describes every command and subcommand with its arguments, flags, whether it
// writes or destroys, dry-run and idempotency-key support and its JSON output.
// Human help (`ot help <command>`) and machine discovery (`ot schema`) are both
// printed from it, and TestSchemaCoversEveryCommandAndFlag fails when a
// command's real flag set and this table disagree.

// argSpec is one positional argument.
type argSpec struct {
	Name       string `json:"name"`
	Required   bool   `json:"required"`
	Repeatable bool   `json:"repeatable"`
}

// flagSpec is one flag. Type is string, bool, int or string_list (repeatable).
type flagSpec struct {
	Name        string   `json:"name"`
	Short       string   `json:"short,omitempty"`
	Type        string   `json:"type"`
	Enum        []string `json:"enum,omitempty"`
	Default     any      `json:"default,omitempty"`
	Description string   `json:"description"`
}

// cmdSpec is one command as `ot schema` lists it. Name is the full command
// ("add", "project add"); the dispatcher runs the first word.
type cmdSpec struct {
	Name           string         `json:"name"`
	Aliases        []string       `json:"aliases,omitempty"`
	Summary        string         `json:"summary"`
	Args           []argSpec      `json:"args"`
	Flags          []flagSpec     `json:"flags"`
	Writes         bool           `json:"writes"`
	Destructive    bool           `json:"destructive"`
	DryRun         bool           `json:"dry_run"`
	IdempotencyKey bool           `json:"idempotency_key"`
	Output         map[string]any `json:"output_schema"`
}

// OutputVersion is the version of the documented --json shapes. Within a
// version fields are only added (design D1).
const OutputVersion = 1

func ref(name string) map[string]any { return map[string]any{"$ref": "#/schemas/" + name} }

func arrayOf(name string) map[string]any {
	return map[string]any{"type": "array", "items": ref(name)}
}

func oneOrMany(name string) map[string]any {
	return map[string]any{"oneOf": []any{ref(name), arrayOf(name)}}
}

var (
	globalFlagSpecs = []flagSpec{
		{Name: "profile", Type: "string", Description: "profile from the config file"},
		{Name: "server", Type: "string", Description: "server URL, overriding the profile and OPENTODO_URL"},
		{Name: "json", Type: "bool", Description: "print only JSON on stdout (documented schemas, output_version 1)"},
		{Name: "dry-run", Type: "bool", Description: "write commands: resolve and validate, print the requests that would be sent, send no write"},
		{Name: "read-only", Type: "bool", Description: "refuse every write command before any request (also OPENTODO_READ_ONLY=1)"},
	}
	yesFlag    = flagSpec{Name: "yes", Short: "y", Type: "bool", Description: "confirm a destructive command (required off a terminal and with --json)"}
	idemFlag   = flagSpec{Name: "idempotency-key", Type: "string", Description: "1-128 characters of [A-Za-z0-9._:-]; running again with the same key returns the same entity instead of creating another"}
	limitFlag  = flagSpec{Name: "limit", Type: "int", Description: "print at most n tasks"}
	taskFields = []flagSpec{
		{Name: "project", Type: "string", Description: "project name or id (edit: none moves to the Inbox)"},
		{Name: "due", Type: "string", Description: "YYYY-MM-DD, today, tomorrow or a weekday (edit: none clears)"},
		{Name: "time", Type: "string", Description: "due time HH:MM"},
		{Name: "priority", Type: "int", Enum: []string{"1", "2", "3", "4"}, Description: "1 (highest) to 4 (lowest)"},
		{Name: "label", Type: "string_list", Description: "label name or id, repeatable (created when missing; edit replaces the list)"},
		{Name: "note", Type: "string", Description: "description"},
	}
	refsArg = []argSpec{{Name: "ref", Required: true, Repeatable: true}}
)

var cmdSpecs = []cmdSpec{
	{Name: "login", Summary: "sign in with email and password and store an API token", Args: []argSpec{{Name: "server-url"}},
		Flags: []flagSpec{{Name: "email", Type: "string", Description: "account email (prompted when omitted)"}}, Writes: true, DryRun: true, Output: ref("auth_result")},
	{Name: "auth set-token", Summary: "store a token created elsewhere in the profile", Args: []argSpec{{Name: "token", Required: true}}, Writes: true, DryRun: true, Output: ref("auth_result")},
	{Name: "auth status", Summary: "show the server, account, token name and scope", Output: ref("auth_status")},
	{Name: "auth logout", Summary: "revoke the stored token on the server and remove it locally", Flags: []flagSpec{yesFlag}, Writes: true, Destructive: true, DryRun: true, Output: ref("auth_result")},
	{Name: "list", Summary: "list tasks (default: all open tasks)", Flags: []flagSpec{
		{Name: "inbox", Type: "bool", Description: "tasks without a project"},
		{Name: "today", Type: "bool", Description: "due today or earlier, overdue first"},
		{Name: "upcoming", Type: "bool", Description: "due after today"},
		{Name: "completed", Type: "bool", Description: "completed tasks, most recent first"},
		{Name: "all", Type: "bool", Description: "open and completed tasks"},
		{Name: "project", Type: "string", Description: "tasks of one project (name or id)"},
		limitFlag,
	}, Output: arrayOf("task")},
	{Name: "today", Summary: "alias for `ot list --today`", Flags: []flagSpec{limitFlag}, Output: arrayOf("task")},
	{Name: "inbox", Summary: "alias for `ot list --inbox`", Flags: []flagSpec{limitFlag}, Output: arrayOf("task")},
	{Name: "upcoming", Summary: "alias for `ot list --upcoming`", Flags: []flagSpec{limitFlag}, Output: arrayOf("task")},
	{Name: "add", Summary: "create a task and print its id", Args: []argSpec{{Name: "title", Required: true, Repeatable: true}},
		Flags: append(append([]flagSpec{}, taskFields...), idemFlag), Writes: true, DryRun: true, IdempotencyKey: true, Output: ref("task")},
	{Name: "edit", Summary: "change a task (values equal to the current ones send nothing)", Args: []argSpec{{Name: "ref", Required: true}},
		Flags: append([]flagSpec{{Name: "title", Type: "string", Description: "new title"}}, taskFields...), Writes: true, DryRun: true, Output: ref("task")},
	{Name: "done", Summary: "complete one or more tasks", Args: refsArg, Writes: true, DryRun: true, Output: oneOrMany("task_result")},
	{Name: "reopen", Summary: "reopen one or more completed tasks", Args: refsArg, Writes: true, DryRun: true, Output: oneOrMany("task_result")},
	{Name: "rm", Summary: "delete one or more tasks (soft delete)", Args: refsArg, Flags: []flagSpec{yesFlag}, Writes: true, Destructive: true, DryRun: true, Output: oneOrMany("task_result")},
	{Name: "project list", Aliases: []string{"project ls"}, Summary: "list projects", Flags: []flagSpec{{Name: "all", Type: "bool", Description: "include archived projects"}}, Output: arrayOf("project")},
	{Name: "project add", Aliases: []string{"project create"}, Summary: "create a project and print its id", Args: []argSpec{{Name: "name", Required: true, Repeatable: true}},
		Flags: []flagSpec{{Name: "color", Type: "string", Description: "colour as #rrggbb (default: derived from the name)"}, idemFlag}, Writes: true, DryRun: true, IdempotencyKey: true, Output: ref("project")},
	{Name: "project rename", Summary: "rename a project", Args: []argSpec{{Name: "ref", Required: true}, {Name: "new-name", Required: true, Repeatable: true}}, Writes: true, DryRun: true, Output: ref("project")},
	{Name: "project archive", Summary: "archive a project, or restore it with --undo", Args: []argSpec{{Name: "ref", Required: true}},
		Flags: []flagSpec{{Name: "undo", Type: "bool", Description: "restore an archived project"}}, Writes: true, DryRun: true, Output: ref("project")},
	{Name: "project rm", Aliases: []string{"project delete"}, Summary: "delete a project (soft delete)", Args: []argSpec{{Name: "ref", Required: true}}, Flags: []flagSpec{yesFlag}, Writes: true, Destructive: true, DryRun: true, Output: ref("project")},
	{Name: "token list", Aliases: []string{"token ls"}, Summary: "list API tokens with their scopes", Output: arrayOf("token")},
	{Name: "token create", Aliases: []string{"token add"}, Summary: "create an API token and print its secret once", Args: []argSpec{{Name: "name", Required: true, Repeatable: true}},
		Flags: []flagSpec{{Name: "scope", Type: "string", Enum: tokenScopes, Default: "full", Description: "token scope: full, read or agent"}}, Writes: true, DryRun: true, Output: ref("token_created")},
	{Name: "token revoke", Aliases: []string{"token rm", "token delete"}, Summary: "revoke an API token", Args: []argSpec{{Name: "id-or-name", Required: true}}, Flags: []flagSpec{yesFlag}, Writes: true, Destructive: true, DryRun: true, Output: ref("token")},
	{Name: "export", Summary: "download the full JSON export", Flags: []flagSpec{{Name: "out", Short: "o", Type: "string", Description: "write to this file instead of stdout"}},
		Output: map[string]any{"anyOf": []any{map[string]any{"type": "object", "description": "the server's export document (format opentodo-export)"}, ref("export_file")}}},
	{Name: "schema", Summary: "print every command, flag, exit code and output schema as JSON (works offline)", Output: map[string]any{"type": "object", "description": "this document"}},
	{Name: "skill", Summary: "print the agent skill file (SKILL.md) embedded in this binary", Output: ref("skill")},
	{Name: "version", Summary: "print the client version", Output: ref("version")},
	{Name: "help", Summary: "show help for a command (--json: same as `ot schema`)", Args: []argSpec{{Name: "command"}}, Output: map[string]any{"type": "object", "description": "with --json: the `ot schema` document"}},
}

func findSpec(name string) *cmdSpec {
	for i := range cmdSpecs {
		if cmdSpecs[i].Name == name {
			return &cmdSpecs[i]
		}
	}
	return nil
}

// exitCodes is the documented exit code contract (design D2).
var exitCodes = []map[string]any{
	{"code": ExitOK, "name": "ok", "meaning": "success, including \"already in that state\"", "agent": "continue"},
	{"code": ExitServer, "name": "server_error", "meaning": "the server refused or failed (validation, conflict, 5xx)", "agent": "read error.code; retry only internal or rate_limited"},
	{"code": ExitUsage, "name": "usage", "meaning": "bad arguments or local validation, including a missing --yes", "agent": "fix the command"},
	{"code": ExitAuth, "name": "auth", "meaning": "authentication or configuration (no profile, revoked token)", "agent": "ask the user to sign in"},
	{"code": ExitUnreachable, "name": "unreachable", "meaning": "the server could not be reached", "agent": "retry later"},
	{"code": ExitNotPermitted, "name": "not_permitted", "meaning": "refused by scope, role, a switch, encryption or read-only mode", "agent": "do not retry; tell the user what to change"},
}

// errorCodes lists the envelope codes ot produces or passes through.
var errorCodes = []map[string]any{
	{"code": "usage", "exit": ExitUsage, "meaning": "bad arguments or an ambiguous reference"},
	{"code": "confirmation_required", "exit": ExitUsage, "meaning": "a destructive command needs --yes off a terminal or with --json"},
	{"code": "auth", "exit": ExitAuth, "meaning": "no profile, no token or an unreadable config file"},
	{"code": "unauthorized", "exit": ExitAuth, "meaning": "the server rejected the token"},
	{"code": "unreachable", "exit": ExitUnreachable, "meaning": "the server could not be reached"},
	{"code": "read_only", "exit": ExitNotPermitted, "meaning": "--read-only or OPENTODO_READ_ONLY refused a write"},
	{"code": "insufficient_scope", "exit": ExitNotPermitted, "meaning": "the token's scope does not allow this"},
	{"code": "forbidden", "exit": ExitNotPermitted, "meaning": "the account's role does not allow this"},
	{"code": "not_permitted", "exit": ExitNotPermitted, "meaning": "an agent token may move to the Trash only tasks it created"},
	{"code": "writes_disabled_by_owner", "exit": ExitNotPermitted, "meaning": "the server owner has not allowed AI assistants to make changes"},
	{"code": "writes_disabled_by_user", "exit": ExitNotPermitted, "meaning": "the user has not allowed AI assistants to make changes"},
	{"code": "encryption_enabled", "exit": ExitNotPermitted, "meaning": "the account is end-to-end encrypted; readable text cannot be written"},
	{"code": "invalid_input", "exit": ExitServer, "meaning": "the server refused a value"},
	{"code": "not_found", "exit": ExitServer, "meaning": "no such entity"},
	{"code": "idempotency_conflict", "exit": ExitServer, "meaning": "the idempotency key was already used for different content"},
	{"code": "rate_limited", "exit": ExitServer, "meaning": "too many requests; retry after a while", "retry": true},
	{"code": "internal", "exit": ExitServer, "meaning": "server error; retry later", "retry": true},
	{"code": "http_<status>", "exit": ExitServer, "meaning": "a non-OpenTodo error response (proxy, wrong URL)"},
}
