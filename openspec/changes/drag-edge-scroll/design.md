## Context

`lib/dnd.ts` arms a touch hold after 350 ms and lifts the drag on the next move. To stop the page scrolling under the finger, each press added a non-passive `touchmove` listener on `window` from its `pointerdown`. iOS WebKit decides whether a touch can be blocked from the listeners present when the touch starts, so on an iPhone a listener added by the press is ignored and the page moves with the finger. Nothing scrolled a list at its edges during a drag.

## Decisions

**D1. One standing touchmove listener.** The module installs one non-passive `touchmove` listener on `window` when it loads on a touch device (or at the first hold elsewhere). It prevents the default only while a hold is armed or a touch drag is lifted, counted by a module counter that each hold and each lift takes and gives back once. A touch that is not held still scrolls as before. The cost is that a touch scroll's first move waits for the main thread; every row press already added such a listener, so on a list nothing changes.

**D2. Edge scrolling.** While a drag is lifted, a pointer within 48 px (at most a quarter of the scroller's height) of the top or bottom of a scroller whose box holds it (the main content, `[data-main-scroller]`, or the sidebar's list, `[data-sidebar-scroll]`, measured inside the viewport; found by geometry, not by the element under the pointer, so the selection bar or the add button floating over the list's bottom edge does not hide it; of nested scrollers, the inner one while it can still move that way) scrolls it by up to 16 px a frame, more the nearer the edge. Each step re-reads the target under the pointer, so the drop line follows the rows passing under a still finger. It stops at the scroller's end, when the pointer leaves the edge, and when the drag ends. It applies to every pointer; reduced motion doesn't stop it, because it moves the list the person asked to move, not an animation.

Alternative rejected: `touch-action: none` on every row. It would stop a list being scrolled by a finger on its rows.

## Interface budget

No chrome, property, destination, scroll region or shortcut changes.

## Risks

Not tried on iOS hardware here: the WebKit behaviour in D1 is documented (WebKit bug 184250) and the fix follows it, but it needs a check on an iPhone, in the installed web app and the iOS app.
