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
		{Name: "workspace", Type: "string", Description: "workspace name or id the command acts on (also OPENTODO_WORKSPACE and the profile's workspace; default: the account's default workspace)"},
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
		{Name: "repeat", Type: "string", Description: "recurrence rule in any spelling of the grammar, sent canonical (edit: none clears)"},
		{Name: "origin-url", Type: "string", Description: "http(s) URL the task comes from, sent as its origin; GitHub, GitLab, Jira and Linear issue links give the provider and issue id, derived locally (edit: none clears)"},
		{Name: "deadline", Type: "string", Description: "the day it must be finished by: YYYY-MM-DD, today, tomorrow or a weekday (edit: none clears)"},
		{Name: "start", Type: "string", Description: "someday parks the task; a date (YYYY-MM-DD, today, tomorrow or a weekday) defers it; the due date is kept (edit: none clears)"},
		{Name: "evening", Type: "bool", Description: "put the task in This Evening (edit: --evening=false takes it out)"},
		{Name: "blocked-by", Type: "string_list", Description: "a task this one waits for: id or unique id prefix, repeatable (edit replaces the list; none clears)"},
		{Name: "location", Type: "string", Description: "a saved location's name or id, or lat,lon (edit: none clears)"},
		{Name: "no-default-reminder", Type: "bool", Description: "add no default reminder when the task gets a due date (--remind also leaves it out)"},
	}
	// addOnlyFields are the quick-add flags of `ot add` (quick-add-recurrence D6).
	addOnlyFields = []flagSpec{
		{Name: "remind", Type: "string_list", Description: "reminder without the reminder word: \"30 min before\", \"at 9\", \"tomorrow at 9\" (repeatable)"},
		{Name: "natural", Type: "bool", Description: "parse the title like the app's quick add: dates, #project, @label, p1, +30m, every …, remind me …"},
		{Name: "lang", Type: "string", Description: "languages for --natural and --remind, e.g. de,en (default: the locale; English always)"},
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
		{Name: "someday", Type: "bool", Description: "open tasks parked in Someday (combines with --project)"},
		{Name: "anytime", Type: "bool", Description: "open tasks with no due date, deadline or start (combines with --project)"},
		{Name: "blocked", Type: "bool", Description: "open tasks waiting for an open task (combines with --project)"},
		{Name: "completed-after", Type: "string", Description: "only tasks completed at or after: YYYY-MM-DD (local), an RFC 3339 time or Unix ms"},
		{Name: "completed-before", Type: "string", Description: "only tasks completed before: YYYY-MM-DD (local), an RFC 3339 time or Unix ms"},
		limitFlag,
	}, Output: arrayOf("task")},
	{Name: "today", Summary: "alias for `ot list --today`", Flags: []flagSpec{limitFlag}, Output: arrayOf("task")},
	{Name: "inbox", Summary: "alias for `ot list --inbox`", Flags: []flagSpec{limitFlag}, Output: arrayOf("task")},
	{Name: "upcoming", Summary: "alias for `ot list --upcoming`", Flags: []flagSpec{limitFlag}, Output: arrayOf("task")},
	{Name: "add", Summary: "create a task and print its id", Args: []argSpec{{Name: "title", Required: true, Repeatable: true}},
		Flags: append(append(append([]flagSpec{}, taskFields...), addOnlyFields...), idemFlag), Writes: true, DryRun: true, IdempotencyKey: true, Output: ref("task")},
	{Name: "edit", Summary: "change a task (values equal to the current ones send nothing)", Args: []argSpec{{Name: "ref", Required: true}},
		Flags: append([]flagSpec{{Name: "title", Type: "string", Description: "new title"}}, taskFields...), Writes: true, DryRun: true, Output: ref("task")},
	{Name: "done", Summary: "complete one or more tasks", Args: refsArg, Writes: true, DryRun: true, Output: oneOrMany("task_result")},
	{Name: "reopen", Summary: "reopen one or more completed tasks", Args: refsArg, Writes: true, DryRun: true, Output: oneOrMany("task_result")},
	{Name: "rm", Summary: "delete one or more tasks (soft delete)", Args: refsArg, Flags: []flagSpec{yesFlag}, Writes: true, Destructive: true, DryRun: true, Output: oneOrMany("task_result")},
	{Name: "project list", Aliases: []string{"project ls"}, Summary: "list projects", Flags: []flagSpec{{Name: "all", Type: "bool", Description: "include archived projects"}}, Output: arrayOf("project")},
	{Name: "project add", Aliases: []string{"project create"}, Summary: "create a project and print its id", Args: []argSpec{{Name: "name", Required: true, Repeatable: true}},
		Flags: []flagSpec{{Name: "color", Type: "string", Description: "colour as #rrggbb (default: derived from the name)"}, idemFlag}, Writes: true, DryRun: true, IdempotencyKey: true, Output: ref("project")},
	{Name: "project move", Summary: "move a project to the workspace named by --workspace (only its owner)", Args: []argSpec{{Name: "ref", Required: true}}, Writes: true, DryRun: true, Output: ref("project")},
	{Name: "project rename", Summary: "rename a project", Args: []argSpec{{Name: "ref", Required: true}, {Name: "new-name", Required: true, Repeatable: true}}, Writes: true, DryRun: true, Output: ref("project")},
	{Name: "project archive", Summary: "archive a project, or restore it with --undo", Args: []argSpec{{Name: "ref", Required: true}},
		Flags: []flagSpec{{Name: "undo", Type: "bool", Description: "restore an archived project"}}, Writes: true, DryRun: true, Output: ref("project")},
	{Name: "project rm", Aliases: []string{"project delete"}, Summary: "delete a project (soft delete)", Args: []argSpec{{Name: "ref", Required: true}}, Flags: []flagSpec{yesFlag}, Writes: true, Destructive: true, DryRun: true, Output: ref("project")},
	{Name: "token list", Aliases: []string{"token ls"}, Summary: "list API tokens with their scopes", Output: arrayOf("token")},
	{Name: "token create", Aliases: []string{"token add"}, Summary: "create an API token and print its secret once", Args: []argSpec{{Name: "name", Required: true, Repeatable: true}},
		Flags: []flagSpec{{Name: "scope", Type: "string", Enum: tokenScopes, Default: "full", Description: "token scope: full, read or agent"}}, Writes: true, DryRun: true, Output: ref("token_created")},
	{Name: "token revoke", Aliases: []string{"token rm", "token delete"}, Summary: "revoke an API token", Args: []argSpec{{Name: "id-or-name", Required: true}}, Flags: []flagSpec{yesFlag}, Writes: true, Destructive: true, DryRun: true, Output: ref("token")},
	{Name: "mcp", Summary: "bridge stdio MCP clients to the configured server",
		Flags: []flagSpec{
			{Name: "allow-full-token", Type: "bool", Description: "allow a full-access token instead of requiring a read or agent token"},
			{Name: "decrypt", Type: "bool", Description: "end-to-end encrypted accounts: decrypt results and encrypt written text on this machine with the key stored by `ot encryption unlock`; the AI provider then receives the plaintext"},
		},
		Output: map[string]any{"type": "object", "description": "newline-delimited MCP JSON-RPC responses; notifications produce no output"}},
	{Name: "encryption unlock", Summary: "unwrap the account key with the passphrase (or --recovery key) on this machine and store it owner-only for the profile",
		Flags: []flagSpec{
			{Name: "recovery", Type: "bool", Description: "use the recovery key instead of the passphrase"},
			{Name: "passphrase-file", Type: "string", Description: "read the passphrase or recovery key from this file instead of the terminal"},
		}, Output: ref("encryption_state")},
	{Name: "encryption lock", Summary: "delete the account key stored for the profile", Output: ref("encryption_state")},
	{Name: "encryption status", Summary: "report locked, unlocked, stale or not_encrypted (never key material)", Output: ref("encryption_state")},
	{Name: "vault init", Summary: "make a folder a Markdown vault of the account (a sync device with its state in <dir>/.opentodo/) and write every project file",
		Args:   []argSpec{{Name: "dir", Required: true}},
		Flags:  []flagSpec{{Name: "adopt", Type: "bool", Description: "accept a folder that already holds .md files; they become projects on the first sync"}},
		Writes: true, DryRun: true, Output: ref("vault_report")},
	{Name: "vault sync", Summary: "two-way sync of a vault folder (default .): pull, merge, push the file edits, write the files; --read-only pushes nothing",
		Args: []argSpec{{Name: "dir"}}, Writes: true, DryRun: true, Output: ref("vault_report")},
	{Name: "vault status", Summary: "list the vault files changed since the last sync and the conflict files, without the server",
		Args: []argSpec{{Name: "dir"}}, Output: ref("vault_status")},
	{Name: "vault watch", Summary: "keep a vault in sync until interrupted: the server's live channel and a two-second file poll",
		Args: []argSpec{{Name: "dir"}}, Writes: true, Output: ref("vault_report")},
	{Name: "vault tasknotes", Summary: "link a folder of Obsidian TaskNotes task notes to the vault in --vault (default .): each task note becomes one task, synced by the next vault sync; --off unlinks it",
		Args: []argSpec{{Name: "folder"}},
		Flags: []flagSpec{
			{Name: "vault", Type: "string", Default: ".", Description: "the vault folder"},
			{Name: "off", Type: "bool", Description: "unlink the TaskNotes folder; the notes keep their ids and their tasks stay in the account"},
			{Name: "inside", Type: "bool", Description: "accept a folder inside the vault folder (every machine syncing the vault then needs this ot)"},
		}, Writes: true, DryRun: true, Output: ref("vault_tasknotes")},
	{Name: "time start", Summary: "start tracking time on a task (stops the running entry)", Args: []argSpec{{Name: "ref", Required: true}},
		Flags: []flagSpec{{Name: "note", Type: "string", Description: "note on the entry"}}, Writes: true, DryRun: true, Output: ref("time_entry")},
	{Name: "time stop", Summary: "stop the running time entry", Writes: true, DryRun: true, Output: ref("time_entry")},
	{Name: "time log", Summary: "add a closed time entry: a duration (45m, 1h30, 90) or --from and --to", Args: []argSpec{{Name: "ref", Required: true}, {Name: "duration"}},
		Flags: []flagSpec{
			{Name: "on", Type: "string", Description: "the day: YYYY-MM-DD, today, yesterday or a weekday; a duration on another day than today ends at 17:00"},
			{Name: "from", Type: "string", Description: "start time HH:MM (with --to)"},
			{Name: "to", Type: "string", Description: "end time HH:MM (with --from)"},
			{Name: "note", Type: "string", Description: "note on the entry"},
		}, Writes: true, DryRun: true, Output: ref("time_entry")},
	{Name: "time list", Aliases: []string{"time ls"}, Summary: "list time entries, newest first", Flags: []flagSpec{
		{Name: "task", Type: "string", Description: "entries of one task (id or prefix)"},
		{Name: "from", Type: "string", Description: "first local day: YYYY-MM-DD, today, yesterday or a weekday"},
		{Name: "to", Type: "string", Description: "last local day"},
		{Name: "running", Type: "bool", Description: "only the running entry"},
		{Name: "limit", Type: "int", Description: "print at most n entries"},
	}, Output: arrayOf("time_entry")},
	{Name: "time export", Summary: "download the server's time entries CSV in the local time zone", Flags: []flagSpec{
		{Name: "from", Type: "string", Description: "first local day"},
		{Name: "to", Type: "string", Description: "last local day"},
		{Name: "out", Short: "o", Type: "string", Description: "write to this file instead of stdout"},
	}, Output: map[string]any{"anyOf": []any{map[string]any{"type": "string", "description": "the CSV (with a UTF-8 BOM)"}, ref("export_file")}}},
	{Name: "issues list", Aliases: []string{"issues ls"}, Summary: "list the account's GitHub and GitLab issue connections and their state (never a token)", Output: arrayOf("issue_connection")},
	{Name: "issues sync", Summary: "poll one issue connection now, or every enabled one, and print what changed", Args: []argSpec{{Name: "id"}},
		Writes: true, DryRun: true, Output: arrayOf("issues_run")},
	{Name: "rules list", Aliases: []string{"rules ls"}, Summary: "list the account's automation rules (built in the app)", Output: arrayOf("rule")},
	{Name: "rules enable", Summary: "turn an automation rule on (clears a pause for running too often)", Args: []argSpec{{Name: "id", Required: true}},
		Writes: true, DryRun: true, Output: ref("rule")},
	{Name: "rules disable", Summary: "turn an automation rule off", Args: []argSpec{{Name: "id", Required: true}},
		Writes: true, DryRun: true, Output: ref("rule")},
	{Name: "rules runs", Summary: "print an automation rule's run log, newest first", Args: []argSpec{{Name: "id", Required: true}}, Output: arrayOf("rule_run")},
	{Name: "workspaces", Summary: "list your workspaces (the current one marked)", Output: arrayOf("workspace")},
	{Name: "export", Summary: "download the full JSON export", Flags: []flagSpec{{Name: "out", Short: "o", Type: "string", Description: "write to this file instead of stdout"}},
		Output: map[string]any{"anyOf": []any{map[string]any{"type": "object", "description": "the server's export document (format opentodo-export)"}, ref("export_file")}}},
	{Name: "import", Summary: "import a file into the account (an OpenTodo export, CSV or another app's export) and wait for the job; --dry-run prints the server's preview; --workspace picks the target workspace",
		Args: []argSpec{{Name: "file", Required: true}},
		Flags: []flagSpec{
			{Name: "format", Type: "string", Description: "force a format instead of detecting it (the names `ot import` errors list, such as csv, opentodo or todoist-backup)"},
			{Name: "existing", Type: "string", Enum: []string{"skip", "overwrite"}, Description: "own export: keep or overwrite items that already exist (default skip)"},
			{Name: "duplicates", Type: "string", Enum: []string{"skip", "import"}, Description: "possible duplicates of open tasks: skip them or import them anyway (default skip)"},
			{Name: "time-zone", Type: "string", Description: "IANA time zone for date-times with a zone (default: this machine's)"},
		}, Writes: true, DryRun: true, Output: ref("import_job")},
	{Name: "schema", Summary: "print every command, flag, exit code and output schema as JSON (works offline)", Output: map[string]any{"type": "object", "description": "this document"}},
	{Name: "skill", Summary: "print the agent skill file (SKILL.md) embedded in this binary", Output: ref("skill")},
	{Name: "version", Summary: "print the client version", Output: ref("version")},
	{Name: "completion", Summary: "print the completion script for bash, zsh or fish (works offline)", Args: []argSpec{{Name: "shell", Required: true}},
		Output: map[string]any{"type": "string", "description": "the completion script"}},
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
	{"code": "issues_disabled", "exit": ExitNotPermitted, "meaning": "the server owner has not enabled issue connections"},
	{"code": "connection_stopped", "exit": ExitServer, "meaning": "the issue connection is stopped; replace its token, edit its host or enable it again"},
	{"code": "provider_rate_limited", "exit": ExitServer, "meaning": "the provider's rate limit was reached; polling resumes at the time named", "retry": true},
	{"code": "poll_failed", "exit": ExitServer, "meaning": "an issue poll ran and failed; the reason is in the message"},
	{"code": "invalid_input", "exit": ExitServer, "meaning": "the server refused a value"},
	{"code": "import_failed", "exit": ExitServer, "meaning": "an import job ended failed; its counts say how far it got and undo in the app removes what it wrote"},
	{"code": "not_found", "exit": ExitServer, "meaning": "no such entity"},
	{"code": "idempotency_conflict", "exit": ExitServer, "meaning": "the idempotency key was already used for different content"},
	{"code": "rate_limited", "exit": ExitServer, "meaning": "too many requests; retry after a while", "retry": true},
	{"code": "internal", "exit": ExitServer, "meaning": "server error; retry later", "retry": true},
	{"code": "http_<status>", "exit": ExitServer, "meaning": "a non-OpenTodo error response (proxy, wrong URL)"},
}
