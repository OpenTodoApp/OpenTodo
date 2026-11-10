# Proposal: assistant-device-reads

## Why

The server's in-app assistant can read time entries, calendar frames, slots and notes through the shared registry. The on-device assistant, used by accounts with end-to-end encryption, offers only five read tools (`internal/assistant/manifest.go` `deviceTools`). So on encrypted accounts it can't answer "where did my time go?" or "what's in my notes about the move?". The new blocks planned next (time, free time, notes) would silently do nothing there.

## What Changes

- The on-device loop gains the read tools `list_time_entries`, `list_frames`, `list_slots`, `list_notes`, `search_notes` and `get_note`. They read this device's decrypted rows with the server's rules: arguments, untrusted-text marking, paging limits and kept-away projects.
- Each new tool is pinned to the server by shared vectors, like the planners.
- The manifest lists them, and skills that use them offer them on the device too.

## Capabilities

### New Capabilities

### Modified Capabilities

- `in-app-assistant`: a new requirement, "On-device read tools match the server's".

## Out of scope

- New write tools on the device.
- `find_free_time` (`assistant-time-blocks` adds it on both sides).

## Roadmap

A follow-up to `assistant-on-device` (shipped AI row 5).

## Impact

- `internal/assistant/manifest.go` (`deviceTools`), with the manifest and vectors regenerated.
- `web/src/lib/assistantDevice/read.ts`, plus a `readNotes.ts` and a `readTime.ts`.
- New vectors: `read.vectors.json`.
