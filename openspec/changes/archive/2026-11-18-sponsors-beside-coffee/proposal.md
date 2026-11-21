## Why

On 16 November the owner asked for GitHub Sponsors to appear wherever Buy Me a Coffee does. The website and the README offer both. The app offers only Buy Me a Coffee: in the welcome note after the first run, and in Settings → About. Most support arrives through Buy Me a Coffee, so it stays first and stays the button. GitHub Sponsors follows as one quieter text link.

## What Changes

- A text link, "Or sponsor on GitHub", under the Buy Me a Coffee button in the welcome note and in Settings → About's support card. It opens github.com/sponsors/pixari in a new tab and loads nothing into the app.
- The settings search finds it under "sponsor" and "github sponsors", as it already does for the coffee button.
- `docs/feedback-and-support.md` names both.
- No new banner, no new card, no change to the coffee button.

## Capabilities

### Modified Capabilities

- `first-run`: "Welcome note for the owner" adds the GitHub Sponsors link after the coffee button.
- `settings-navigation`: "About section" adds the same link after the coffee button.

## Impact

- `web/src/app/WelcomeDialog.tsx` (a `SponsorLink` beside `CoffeeButton`), `AboutSection.tsx`, `settingsIndex.ts`.
- One new message, in every shipped catalog. The Polish string was added for the completeness check and is flagged for its maintainer (nkkfs) to adjust.
- `docs/feedback-and-support.md`, the welcome note and About tests, and the UI baselines of both screens.
- No op, no data change, and a few bytes on first load.

## Out of scope

- The website and the README, which already offer both.
- Any change to Buy Me a Coffee's button or position.
