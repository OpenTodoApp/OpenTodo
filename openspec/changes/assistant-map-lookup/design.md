# Design

## Context

`MapBlock` reads its items through `useMapItems` (`lib/assistantBlockData.ts`) and hands the items that have coordinates to `LocationMap`. `LocationMap` renders nothing when maps are off, when WebGL is missing, when there are no points, or after `MapView` reports the map unavailable. The location editor already searches addresses through `api.mapSearch`, the server's map proxy.

## Decisions

### D1. Look up at display time, never write

`useMapLookup(items)` lives in `lib/assistantBlockData.ts`.
- **When it looks up:** while maps are on and the device is online, for every item without coordinates whose `where` or title has text. It calls `searchAddress(query)` and takes the first result.
- **Cache:** an in-memory session cache keyed by the query, which stores misses too, so one block costs at most one request per distinct address and a re-render costs none.
- **Return value:** each item with its coordinates and `approximate: true` when found, plus `pending` while requests are open.

Saving the found point to the task was rejected because a display action must not change data. That also keeps the op log and sync out of it.

### D2. The reason line

`MapBlock` picks one reason, in order:
1. maps off (`useMapsOn`);
2. still looking;
3. no item has a point;
4. no WebGL (`hasWebGL`, now exported by `LocationMap`);
5. the map could not load.

For the last one, `LocationMap` now also calls the caller's `onUnavailable`. The reason uses the meta text style above the list, and the list always stays.

### D3. Instructions

`SystemRules` gains the rules of the spec requirement "Instructions on showing blocks". The device manifest and `prompt.vectors.json` are regenerated, so the on-device loop gets the same text.

## Risks / Trade-offs

- **A wrong first match pins the wrong spot.** The pin is marked "found by address", and the list keeps the stored text.
- **Requests to the map proxy.** These go to a destination the owner already allows, only while maps are on, and are cached for the session.

## Data model, size, interface budget

- **Data:** no change.
- **Size:** a few hundred bytes in the lazy map block chunk.
- **Interface budget:** no new chrome, scroll region or shortcut.
