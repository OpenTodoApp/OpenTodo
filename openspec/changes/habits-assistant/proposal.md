# Proposal

## Why

The effort of logging is the main reason people stop tracking habits (CHI work on self-tracking abandonment), and the research's answer is to log without opening the tracker: by talking, from a phone shortcut, from a wearable through a webhook. OpenTodo already has an assistant, MCP, routines, webhooks, a CLI and Home Assistant, but none of them can do more than complete a habit. Their write tools don't accept `habit`, the current spec says no integration may skip a habit, and the server can't tell a streak from a missed day because habit numbers exist only on the devices. An outside assistant asked "how is running going?" cannot answer.

## What Changes

- **Habit numbers on the server.** A Go port of the habit calculation (scheduled dates, day states, kept, strength, streaks, at risk, back on track), pinned by the same vectors as `web/src/lib/habits.ts`, so the server, every device and every tool agree. It needs no content, so it works on encrypted accounts.
- **MCP and agent tools.** Read tools `list_habits` and `get_habit` (the numbers, the days and the check-in notes); a write tool `log_habit` (done, tiny, skipped or clear, for today or an earlier day, with an optional note); `create_tasks` and `update_tasks` accept `habit`, `habit_tiny` and `habit_anchor`. Same gate, limits, untrusted-text marking and kept-away projects as every tool.
- **A habits route and CLI.** `GET /api/v1/habits`, `GET /api/v1/habits/{id}` and `POST /api/v1/habits/{id}/log`, so a phone shortcut or a script logs a habit in one request; `ot habits`, `ot habits show` and `ot habits log`.
- **Skills.** **Start a habit** turns a sentence into a proposed habit with a tiny version, an anchor and a part of the day (Fogg's method). **How are my habits?** explains the computed numbers and the user's notes and never invents one. **Turn this into tasks** (capture) also proposes check-ins: "ran 5k, skipped reading" becomes two reviewed check-ins.
- **Routines.** A Habits step group: **Find habits** (all, at risk, back on track, streak of at least N) and **Log a habit**, so an evening routine can nudge about a habit missed twice, and a webhook can log a walk.
- **Off means off.** While the Habits preference is off, the in-app assistant offers no habit skill and suggests no habit, and the editor offers no habit step; tools and routes still report and log habits, because the data is still the user's.

Not **BREAKING**: additive tools, fields, routes and skill ids; no new environment variable; no change to the op log format. It reverses one rule of the `habits` spec, "No integration SHALL skip a habit".

Out of scope: proactive messages the user did not ask for; AI that changes a habit without a reviewed proposal in the app; wearable integrations of our own (webhooks and Home Assistant cover them); numbers for targets and amounts (`habit-targets` extends the port).

Builds on `habits-home` (strength, kept, tiny, graduation) and `habit-notes` (check-in notes). Archive after both.

Roadmap: the "Habits area" in ROADMAP.md.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `habits`: numbers on the server, the habits route, the CLI, and integrations that may skip, log tiny and edit past days.
- `mcp-server`: `list_habits`, `get_habit`, `log_habit`, and habit fields in `create_tasks` and `update_tasks`.
- `assistant-skills`: `start-habit`, `habit-check`, and the capture skill logging check-ins.
- `routines`: the Habits step group.

## Impact

- Server: a new `internal/habits` package (the Go port, `docs/contracts.md`); `internal/agenttools` (the three tools, habit fields in create and update, planning `log_habit`); `internal/httpapi` (three routes registered with policies); `internal/cli` (`ot habits`); the skill catalogue and its prompts; the routine catalogue, planner and the Go and TypeScript step type vectors; the v1 surface snapshot.
- Web: the skill list honours the Habits preference; the routine editor's Habits group; the capture proposal shows check-ins.
- Docs: `docs/habits.md`, `docs/api.md`, `docs/mcp.md`, `docs/assistant-skills.md`, `docs/routines.md`, `docs/cli.md`, `docs/contracts.md`, `docs/home-assistant.md` (logging a habit).
- Size: no web first-load change; the server binary grows by the port (well under 100 KB).
