## Why

On a phone, the sidebar drawer keeps the app name, the primary destinations and the "More" group above its one scroller, and the footer below it. With More open (eight more destinations) on a short screen, the part that does not scroll takes almost the whole drawer: at 390×640 the scroller is 8 px tall. A swipe on the drawer then lands on something that cannot scroll, the projects cannot be reached, and the browser scrolls the page behind the drawer instead.

## What Changes

- The More group moves into the sidebar's scroller, as its first group (below the find field when it is open). The app name and the primary destinations stay pinned at the top, the footer at the bottom; the scroller keeps its room whether More is open or closed.
- While the drawer is open below 768 px, the content behind it does not scroll, and a swipe on the scrim does not pan the page.

## Impact

`web/src/app/Sidebar.tsx` (where the More group renders), `web/src/app/Shell.tsx` (the content column and the scrim while the drawer is open). No data, sync or API change; no new strings. From 768 px the sidebar looks the same; More now scrolls with the groups below it and its heading sticks like theirs.
