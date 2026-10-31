---
title: Show Focus elsewhere
summary: Show the running Focus session on a panel beside the screen, a Home Assistant card, in a terminal or to an AI assistant, without a second timer.
audience: developer
section: Integrations
specs: [focus-mode, time-tracking, mcp-server]
screens: []
order: 33
---
# Show Focus elsewhere

A panel beside the screen, such as a small web page, a [Home Assistant](home-assistant.md#the-focus-session-on-a-dashboard) card or an e-ink display, can show the running session without a timer of its own. It reads [`GET /api/v1/time-entries/running`](api.md#the-running-entry) with a **Read only** [API token](api.md#token-scopes): the task, when the stretch started, the timer, the session number and the planned end. `ot time status` prints the same in a terminal, and an AI assistant reads it from the MCP resource `opentodo://time-entries/running` ([MCP](mcp.md#resources)).

What a panel sees:

- **During a work session**: the task, the start and, for Pomodoro and Countdown, the planned end. Flowtime has no end.
- **On a break or while paused**: nothing running, because no time is logged then. The app's running indicator shows the same.
- **When the session's device is offline**: the last state it synced. Starting, pausing or ending the session reaches the panel when that device syncs again.

Panels should ask every 15 to 30 seconds and count down on their own between two answers. Nothing about the session can be changed from outside.

