# Proposal

## Why

Focus works well once it is open, but people cannot find it. In discussion #532 someone set up Pomodoro in Settings and could not find how to start a timer: today Focus opens only with `g` then `Shift+F`, "Focus on this task" in the ⋯ menu of an open task, or by typing `focus` in Search and commands (#543). None of these is visible with a mouse or on a phone, and on Android a long press on a row ticks it instead of offering the task's actions (#535, #553). The research names the small timer comforts that make TickTick's Pomodoro sticky (§1 TickTick, P4.2): "+5 minutes" when a session ends, one-tap custom lengths (40/20/10), and white noise.

## What Changes

- **Focus in the sidebar's More group**, after Statistics, in every "How you work" mode, and promotable to a primary destination from Settings → Appearance like the other More entries. It does not count against the six primary destinations unless promoted.
- **A Focus button in the task panel's header**, beside the ⋯ menu, for an open task the user can edit: one tap instead of two. It is the same action as "Focus on this task".
- **Start focus in the row menu.** The task Actions menu (`.`, the row's More button, a right-click, and the phone selection bar's Actions with exactly one task ticked) offers "Start focus" for one open, editable task. It opens the Focus screen on that task and starts a session in the current mode (Countdown asks for its length first).
- **Long press stays select on phones** (`bulk-actions`). With one task ticked, the selection bar's Actions menu is that task's full row menu, now including Start focus. The long-press haptic tick follows the haptics preference, which it ignores today. The contradiction in `task-list-presentation` ("the row menu stays reachable by … long press") is corrected.
- **+5 min and +15 min** in the done state of a timed work session (Pomodoro or Countdown) continue the same session for that much longer.
- **Countdown presets**: the Countdown length dialog shows up to four preset chips (default 10, 20, 40 minutes), which start a session in one tap. The presets are edited in Settings → General → Focus.
- **Background noise** (opt-in): white, pink or brown noise synthesized on the device with Web Audio while a work session runs. It is off by default, with no audio files and no dependency. The volume is per device.
- `docs/focus.md` "Open it" names the new ways in; the new controls are documented there.

Out of scope: a long press that opens the menu on phones (the maintainer kept long press = select in #553), Live Activities and Dynamic Island (`focus-live-activity`, 0.20), focus tools for agents (`agent-tools-complete`), recorded soundscapes or streaming audio, a new keyboard shortcut, a Focus tab in the phone tab bar, and timer changes for breaks or Flowtime.

Advances ROADMAP-1.0 0.17 "Calm constraints": `focus-everywhere`.

Fixes #543
Fixes #553
Fixes #535

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `focus-mode`: entry points (More group, the panel button, Start focus in the row menu), extending a finished session, Countdown presets, background noise and their preferences; "Focus screen layout" says where Focus sits in the sidebar.
- `action-menus`: the task Actions menu for one task offers Start focus.
- `app-shell`: Focus is listed in the More group and can be promoted.
- `appearance-preferences`: "Sidebar destinations preference" lists Focus among the promotable destinations.
- `bulk-actions`: the long-press tick honours the haptics preference; with one task ticked, Actions is that task's full menu.
- `task-list-presentation`: "Revealed row actions" no longer claims a long press opens the row menu on touch.

## Impact

- **Data model and sync:** additive fields on the synced `user_prefs` row: `focus_presets` (string, comma-separated minutes) and `focus_noise` (string: `''`/`off`, `white`, `pink`, `brown`). They are not content, so they are not encrypted. They converge per field by last-writer-wins and are exported with the other preferences. The noise volume is device storage and is never synced. The `promoted destinations` list gains the id `focus`; older clients ignore it (existing rule).
- **Op schema:** two new fields in `internal/sync/ops.go` `Schema["user_prefs"]`, `web/src/lib/types.ts` and the defaults in `web/src/lib/ops.ts`. No rename and no removal; not **BREAKING**.
- **E2EE:** no user-written text; nothing to add to the content fields.
- **API/CLI/MCP:** no new route. The preferences travel through sync like the other focus fields. Agent and MCP tools are unchanged (`agent-tools-complete` covers a running Focus session later).
- **CalDAV, vault:** none.
- **Native shells:** none; the Android shell keeps passing touches to the web app. The haptic tick goes through the existing web haptics helper.
- **Bundle and binary size:** noise generation is about 1 KB of code in the lazily loaded focus chunk; no audio asset and no dependency. Binary size changes only by the embedded web build.
