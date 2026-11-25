# Proposal

## Why

The Focus timer's end-of-session sound plays only while the tab is visible. In a hidden tab it waits until the tab is shown again, and the system notification is the only cue (issue #1762). For the most common Pomodoro setup on a computer, the timer in a background tab while a course or a document fills the screen, that means no audible end at all: the operating system suppresses notification banners over fullscreen apps, and the tone plays exactly when the person no longer needs it. Browsers also throttle timers in hidden tabs to about once a minute, so even the notification can arrive up to a minute late.

## What Changes

- **The sound plays at the end in a hidden tab.** In a browser (not in the native apps), a tab that is hidden when a session or break ends plays the chosen sound at the planned end. The Start click already woke the tab's audio, and desktop browsers keep it running in the background; the tone is scheduled on the audio clock, which browsers do not throttle, so it plays on time.
- **Long in the background** repeats about once a second until the tab is shown again or ten repeats have played.
- **The end is noticed on time.** When the scheduled tone starts, the timer reads the clock again, so the done state and the system notification come with the sound, not up to a minute later.
- **Never twice.** Only the device that owns the session rings, as today. On that device one tab rings per session end, and a tone already played in the background is not played again when the tab is shown. Where the tab's audio did not run (no Start in that tab, or a phone browser that suspends background audio), the tone plays when the tab is shown, as today.
- The system notification, the sound setting (Off, Short, Long) and the screen are unchanged.

Not **BREAKING**: no op field, no environment variable, no route.

## Out of scope

- The native apps: they already schedule their own end-of-session notification (focus-live-activity D3); nothing changes there.
- Keeping a hidden tab awake (a silent audio loop, as in the workaround on the issue): it shows a speaker icon on the tab and costs power; the audio clock alone times the sound.
- The task-completion chime, which keeps its own hidden-tab guard (a completion is always triggered by a click in a visible tab).
- A sound for a session another device owns, a volume setting, or other sounds.

## Roadmap

A follow-up of `focus-mode` and `focus-end-alert` (shipped), from issue #1762.

## Capabilities

### Modified Capabilities

- `focus-mode`: "Done state and tone" (the sound in a hidden tab) and "Session end notification" (the hidden-tab scenario).

## Impact

- **Web:** `web/src/lib/focus/tone.ts` (schedule tones on the audio clock, and the Long constants moved from `alert.ts`), `web/src/app/focus/useFocusTimer.ts` (schedule while hidden, wake on the tone, one ring per end across tabs). First load: well under 1 KB gzip.
- **Docs:** `docs/focus-options.md` (sound paragraph).
- No server behaviour, no op schema change, no dependency.
