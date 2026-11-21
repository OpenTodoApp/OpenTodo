# Design

## Context

`focus/tone.ts` already synthesizes a tone with Web Audio. Haptics has a synced Appearance switch and a capability-gated shell bridge. Most individual actions use `completeWithUndo`, but some routes use direct ops and bulk actions use their own apply path. The production Android and iOS apps load the web UI in native shells.

## Goals / Non-Goals

Give the person who completes a task one quiet confirmation. Keep the effect separate from motion, haptic feedback and Focus alerts. Scope phone support to the active Android and iOS shells.

## Decisions

- **One preference.** Follow the existing Haptic feedback pattern with an additive non-content `user_prefs.completion_sound` field and explicit on/off values. Only an exact on value enables sound. Generate the op schema and fixtures through the existing command. Keep the setting keyboard-accessible and announce its state. A synced switch fits the existing Appearance model. Enabling it opts the account in across supported clients, while each client still applies its own mute policy.
- **One cue for a successful UI action.** Put playback behind a small UI-level completion helper. Use the outcome in the single and bulk action paths, including direct UI callers that currently bypass `completeWithUndo`, and retain each path's current write and Undo semantics. Trigger after the successful local result, including a recurring occurrence, with no playback dependency in ops, sync, server, or automation. Prepare browser audio in the eligible user's click, tap or key gesture before awaiting the write. A haptic or animation hook would miss some actions and a task-field observer would also react to sync.
- **Use platform playback.** Web, Android and iOS synthesize the approved 239 ms two-note cue, with a softer decay on the first note and a short chime on the second. A shared set of sample offsets pins the cue across all three implementations. Reuse the Focus Web Audio context and cache the synthesized buffer on first playback. Leave the Focus alert unchanged. No Web Audio context is created for the cue until an opted-in gesture. Failure, lack of activation, or leaving the foreground skips the cue. Ordinary browsers obey browser and system media controls.
- **Use a fixed native capability.** Add an optional bridge method advertised only by a visible mobile shell. Send a fixed request with no task data. Android plays a small synthesized PCM buffer on a system sonification track and releases the track when the activity pauses. It checks the ringer mode on every request and does not take audio focus. iOS synthesizes the cue into memory and plays it in a Silent-aware ambient audio session, skipping playback when the app is using a different audio category. If the cue temporarily switches from Solo Ambient, it restores the prior settings after the player stops, including on failure or interruption. It restores only the settings it still owns. A mobile shell lacking the new capability stays quiet. Retain origin and main-frame restrictions. [iOS ambient audio](https://developer.apple.com/documentation/avfaudio/avaudiosession/category-swift.struct/ambient?changes=_4) · [Android ringer mode](https://developer.android.com/reference/android/media/AudioManager#getRingerMode())
- **Keep the footprint small.** One settings row adds no list chrome, task properties, sidebar destinations, scroll region or shortcut. No new dependency, downloaded asset, server route, or background process. Expect a small client-code delta and negligible idle memory. Measure compressed web assets and shell build deltas at implementation time. Keep the existing bundle limits. Keep browser preparation small enough to respect first-gesture activation. [Chrome autoplay policy](https://developer.chrome.com/blog/autoplay)

## Risks / Trade-offs

- **Audibility is hardware-dependent.** Automated tests verify preference, completion and bridge policy. Verify sound, OS mute/vibrate and coexistence with media on real Android and iOS devices before landing.
- **Rollouts can be independent.** Older shells ignore the new feature. Missing settings default to off, and the opt-in state is the only new synced data. No migration or forced shell upgrade is needed.

## Size impact

Measurements use the same toolchains and version settings on the base and change. The base is upstream main at `95fc08131`.

| Artifact | Base | With sound | Difference |
| --- | ---: | ---: | ---: |
| Web entry, gzip | 132,641 B | 132,671 B | +30 B |
| Web initial load, gzip | 707,967 B | 709,336 B | +1,369 B |
| Linux server with embedded web app | 46,944,416 B | 46,948,512 B | +4,096 B |
| Android debug APK | 4,639,412 B | 4,643,336 B | +3,924 B |

An iOS build and size measurement require Xcode. The two new strings currently use the English source in each catalog pending language review.
