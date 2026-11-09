# Design

## Context

`MapBlock` reads its items through `useMapItems` (`lib/assistantBlockData.ts`) and hands the items that have coordinates to `LocationMap`. `LocationMap` renders nothing when maps are off, when WebGL is missing, when there are no points, or after `MapView` reports the map unavailable. The location editor already searches addresses through `api.mapSearch`, the server's map proxy.

## Decisions

### D1. Look up at display time, never write

`useMapLookup(items)` lives in `lib/assistantBlockData.ts`. While maps are on and the device is online, it searches every item without coordinates through `searchAddress` (the map proxy) and takes the first result.

**What is searched:** the stored location's own words, the address first and else its name. Never a task's title: that is the person's text, and it isn't a place.

**Session cache, shared by every block:**
- A found point and a miss are kept for the session.
- A failed search (the proxy's rate limit of 30 per minute per user, or the network) is kept for one minute only, so it is asked again later.
- Searches already running are shared, so two blocks never repeat a request.
- At most three run at once, to stay inside the proxy's limit and leave room for the person's own address searches.

**When offline:** nothing is searched. The hook reports `offline` and asks again once the device is back online (`useOnline`).

Saving the found point to the task was rejected because a display action must not change data. That also keeps the op log and sync out of it.

### D2. The reason line

`MapBlock` picks one reason, in order:
1. maps off;
2. still looking;
3. offline, with nothing pinned;
4. a failed search, with nothing pinned;
5. no item has a point;
6. no WebGL;
7. the map could not load.

For WebGL, `hasWebGL` is now exported from `LocationMap` and checked once per session, because every check creates a context. For the last reason, `LocationMap` now also calls the caller's `onUnavailable`.

The "found by address" and "not on the map" marks sit beside the address, never inside the part that gets cut off on narrow screens.

### D3. Instructions

`SystemRules` gains the rules of the spec requirement "Instructions on showing blocks". The device manifest and `prompt.vectors.json` are regenerated, so the on-device loop gets the same text.

## Risks / Trade-offs

- **A wrong first match pins the wrong spot.** The pin is marked "found by address", and the list keeps the stored text.
- **Requests to the map proxy.** These go to a destination the owner already allows, only while maps are on, and are cached for the session.

## Data model, size, interface budget

- **Data:** no change.
- **Size:** a few hundred bytes in the lazy map block chunk.
- **Interface budget:** no new chrome, scroll region or shortcut.
