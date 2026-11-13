## Why

In iOS apps a swipe from the left edge opens the menu when there is one. In OpenTodo's iPhone shell the same swipe went back through the web view's history, which an app should not have, and on the web on a phone it did nothing (GitHub issue 1232).

## What Changes

- On phones, a right swipe from the left edge opens the menu drawer, with the row swipes' numbers (reveal 64 px, flick). Row swipes ignore presses in the 20 px edge strip.
- The iOS shell turns off WebKit's back and forward gestures; screens keep their own back buttons.

## Capabilities

### Modified Capabilities

- `app-shell`: an edge swipe opens the phone drawer.

## Impact

- `web/src/app/edgeSwipe.ts` (new, a few hundred bytes), `rowSwipe.ts`, `Shell.tsx`, `mobile/ios/OpenTodo/ShellView.swift`. No dependency.
- Android keeps the system back gesture, which the system owns at the screen edge. Mobile Safari keeps its own edge gesture in the browser tab; an installed app and the iPhone shell get the menu.
