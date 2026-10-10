# Design

## Context

Quick add is a controlled input (`web/src/app/QuickAdd.tsx`); `nlp-quick-add` adds a parser and chips driven by the input text; keyboard shortcuts live in the shell and already skip text fields. The Web Speech API (`SpeechRecognition` / `webkitSpeechRecognition`) is available in Chromium-based browsers and Safari, absent in Firefox, and in most engines sends audio to the vendor's service; some engines offer on-device processing. Constraints: no third-party calls from our code, no server audio, opt-in, keyboard-first, no dependency.

## Goals / Non-Goals

**Goals:**
- Dictation that lands in the same text path as typing, so parsing, chips and the op log are reused unchanged.
- Honest, opt-in privacy posture; zero footprint when off.
- Graceful degradation: no API, no permission, no network → typed capture unaffected.

**Non-Goals:**
- Self-hosted speech models, audio storage, voice commands, dictation outside quick add.

## Decisions

### D1. Browser recognition only, behind feature detection
`web/src/lib/voice/recognition.ts` wraps the API: `isSupported()`, `start({lang, onInterim, onFinal, onError})`, `stop()`. Configured with `continuous: false`, `interimResults: true`, `maxAlternatives: 1`, `lang` from D4; on-device processing is requested when the engine exposes a local-processing option, falling back silently otherwise. No audio is touched by our code: the API returns text only.
- Why: zero dependency, zero server work, works on phones where it matters most. A self-hosted model would add hundreds of MB and CPU a Raspberry Pi does not have; rejected.

### D2. Text path reuse
Interim text is rendered into the input as the live value (caret pinned to the end); the final result replaces the interim span and is run through `normalizeSpoken(text, languages, knownLabels)` (D3), then the existing `onChange` → parser → chips pipeline. Saving is the normal Enter handler. Nothing voice-specific reaches `createTask` or the op log; data-model impact is none.

### D3. Spoken token normalisation
Per-language tables in `web/src/lib/voice/spoken/{en,de,fr,it,es,pt}.ts`: trigger words for project (`hashtag`, `projekt`, `progetto`…), label (`label`, `etikett`…), priority words and number words one–four, number words for hours/minutes (0–59) and `am/pm` equivalents, duration phrases ("thirty minutes", "one hour"). Deterministic single pass, longest match first, unknown words untouched. Shares vocabulary files with `nlp-quick-add` where possible to avoid drift; tested with transcripts as fixtures.

### D4. Language
`lang` = first active quick-add language mapped to a BCP-47 tag (`de` → `de-DE`, `en` → `navigator.language` if it starts with `en`, else `en-US`), overridable in Settings (per device, local storage). `language-not-supported` errors trigger a one-time notice and fallback to the browser default.

### D5. Settings and privacy statement
Per-device switch (local storage; never in the op log, so it does not sync). Turning it on opens a confirmation containing the statement from the spec; the wording also lives in `docs/quick-add.md` and `SECURITY.md`. When `isSupported()` is false the switch is disabled with the explanation. Microphone permission is requested only on the first start of dictation, not on enabling.

### D6. UI and shortcuts
Microphone button inside the quick-add form (hidden when off), with `aria-pressed` and a pulsing indicator while listening; a visually hidden `aria-live="polite"` region announces "Listening" / "Stopped" / errors. `v` is added to the shell's shortcut map with the same "not in a text field" guard as other keys, and to the `?` help. Escape stops listening before its existing behaviours.

### D7. Dependencies and footprint
None added. Bundle +~3 KB gzipped (mostly normalisation tables). CSP unchanged: the speech API is browser-internal and not subject to `connect-src`. Server, image and memory unaffected.

## Risks / Trade-offs

- [Audio goes to a browser vendor] → opt-in with explicit statement; on-device requested when available; never on by default; nothing sent by our code.
- [Recognition quality varies by language and accent] → interim display and mandatory Enter keep the user in control; typed correction is always possible.
- [Number words vs. literal titles ("buy two apples")] → normalisation only converts numbers adjacent to time, priority or duration cues; chips expose every interpretation and can be dismissed.
- [Browser without the API] → feature hidden with explanation; no broken button.
- [Shortcut `v` collides with future vim-style bindings] → the `vim-keybindings` change owns remapping; `v` is reserved here and documented.

## Migration Plan

Additive client change; rollback is redeploying the previous web build. No data migration.

## Open Questions

- Whether to offer an optional "auto-save after a pause" mode (off by default) once users have lived with manual confirmation.
- Whether dictation into the notes field is worth the extra surface.
