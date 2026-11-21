# Proposal

## Why

A short, optional sound gives a person immediate feedback when they finish a task. Issue [#1460](https://github.com/OpenTodoApp/OpenTodo/issues/1460#issuecomment-6923317496) asks for this in the web app and the supported Android and iOS shells.

## What Changes

- Add a **Task completion sound** switch next to **Haptic feedback** in **Settings → Appearance → Theme and density**. It is off by default and follows the account like the other appearance preferences.
- Play one short, locally generated cue after a successful completion action in the foreground. A parent completion or bulk action gets one cue for the action.
- Respect Android silent and vibrate modes and iOS Silent mode in the mobile shells. On the web, use the browser's audio policy and system media controls.
- Focus alerts, haptics, notification sounds, and the paused Expo app are outside this change.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `appearance-preferences`: An independent, offline-editable completion sound preference.
- `task-list-presentation`: A single optional audio cue for local task completion.
- `native-shells`: Optional foreground completion sound through the shell's policy for quiet audio.

## Impact

This follows the `motion-v2` completion feedback work in the UX roadmap. It adds one personal preference and a small optional shell capability. Playback needs no server endpoint, audio download, dependency, or background service.
