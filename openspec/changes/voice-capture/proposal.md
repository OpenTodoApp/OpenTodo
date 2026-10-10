# Proposal

## Why

Speaking a task is faster than typing it on a phone, while walking, or when hands are busy. Browsers already ship speech recognition behind the Web Speech API, so voice capture can be added without any server component, any audio upload to OpenTodo, or any dependency. Combined with natural-language quick add, a spoken "call the dentist tomorrow at nine, hashtag health" becomes a fully scheduled task. Because browser recognition may rely on a vendor service, the feature has to be strictly opt-in and honest about where audio goes.

## What Changes

- A microphone button in quick add and a keyboard shortcut (`Shift+V` outside text fields; plain `v` already toggles list/board in projects) start dictation; interim words appear in the input as they are recognised and the final transcript is inserted at the caret. The text then flows through the natural-language parser from `nlp-quick-add`, so chips appear exactly as if typed. Nothing is saved until the user presses Enter.
- Spoken attribute words are normalised before parsing per active language: "hashtag work" → `#work`, "label call" → `@call`, "priority one" → `p1`, "three pm" → `3pm`, "thirty minutes" → `+30m`.
- Off by default and per device. Settings shows a switch with a privacy statement: recognition is done by the browser and may send audio to the browser vendor's service; OpenTodo's server never receives audio or transcripts, only the resulting task; on-device recognition is requested when the browser offers it. The switch is unavailable, with an explanation, in browsers without speech recognition.
- Recognition language follows the first active quick-add language and can be overridden in Settings.
- Clear handling of denied microphone permission, no speech, and recognition being unavailable offline; typed capture is never affected.

Out of scope: server-side or self-hosted speech models (would break the "runs on a Raspberry Pi" promise and add large dependencies), voice commands beyond capture ("complete task"), recording or storing audio, dictation into the notes field or the detail panel, wake words, and text-to-speech.

This change advances ROADMAP.md section 2, "Voice capture via the Web Speech API" (`voice-capture`). It depends on `nlp-quick-add` for parsing; without it the transcript is used as a plain title.

No server changes, no new environment variables, no op log changes; nothing is **BREAKING**.

## Capabilities

### New Capabilities
- `voice-capture`: opt-in and availability, the privacy contract (no audio to the server, vendor-service disclosure), the dictation flow into quick add, spoken attribute normalisation, language selection, error handling and keyboard accessibility.

### Modified Capabilities
- none

## Impact

- Client: new `web/src/lib/voice/` (feature detection, recognition session wrapper, per-language spoken-token normalisation tables), microphone button and listening state in `QuickAdd`, `Shift+V` shortcut, Settings section with the privacy statement. Bundle impact about 3.5 KB gzipped in the main bundle plus a 4 KB chunk loaded only when voice capture is on (see design D7); no new dependency. CSP unchanged because the Web Speech API is not a network request made by page code.
- Server: none. Container image and runtime memory unchanged.
- Docs: `docs/quick-add.md` gains a "Voice" section including the privacy statement; README feature list; `SECURITY.md` note on where audio goes.
