# Proposal: assistant-map-lookup

## Why

The assistant's map block (`assistant-generative-ui`) can pin only places that have coordinates. Many locations don't:
- a name or address typed as text;
- a saved place stored without a point;
- locations written by the assistant, imports or CalDAV.

For those, the block silently showed only its list. Meanwhile the model said "I've shown them on the map", and it repeated the call when the user said it hadn't appeared. A real-model test found this right after release.

## What Changes

- **Lookup for missing points.** While maps are on, the map block finds a place that has a name or an address but no coordinates through the server's existing address search (the map proxy), and pins the first match.
  - Pins found this way are marked "found by address" in the list.
  - Nothing is written: the task and the place keep their stored location.
  - Results are kept in memory on the device for the session.
- **The block says why there is no map**: maps are off, nothing could be found by address, the browser cannot draw maps, or the map could not load. It never falls back silently.
- **Stricter fixed instructions** for the assistant, on the server and on the device:
  - Never claim how a block looks or that a map appeared.
  - Don't call the same display tool again after the user says a block didn't show.
  - Show two or more specific tasks with `show_tasks` instead of a list.
  - Don't restate what a block shows.
- No **BREAKING** change: no op field, route, environment variable or new outbound destination. The address search already goes through the server's map proxy.

## Capabilities

### New Capabilities

### Modified Capabilities

- `assistant-blocks`:
  - "Map block" looks up missing points and explains a missing map.
  - "Task links in answers" gains the stricter instructions on blocks.

## Out of scope

- Saving the found coordinates onto the task or place. A **Find on map** action in the task panel could do that explicitly later.
- Lookups in the task panel's location preview and in the proposal's map shape.

## Roadmap

This is a follow-up to `assistant-generative-ui`, under the shipped AI row 3 of `ROADMAP.md`.

## Impact

- **Web:**
  - `lib/assistantBlockData.ts`: the lookup hook and its session cache.
  - `app/assistant/blocks/MapBlock.tsx`: approximate pins and the reason line.
  - `app/locations/LocationMap.tsx`: exposes whether WebGL is available and reports when the map is unavailable.
- **Server:**
  - `internal/assistant/loop.go` (`SystemRules`).
  - The regenerated device manifest and prompt vectors.
- **No new dependency.**
