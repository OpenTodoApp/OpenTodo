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
Microphone button inside the quick-add form (hidden when off), with `aria-pressed` and a pulsing indicator while listening (hidden under `prefers-reduced-motion`); a visually hidden `aria-live="polite"` region announces "Listening" / "Stopped" / errors. The shortcut is **`Shift+V`**, not `v`: since this design was drafted, `board-view` shipped plain `v` as the list/board toggle in project views, and `vim-keybindings` claims `J`, `K`, `G`, `x`, `o`, `i`, `a`, `d` and `:` (its visual mode is a non-goal, so `V` stays free). The handler is localised in the quick-add component (`web/src/app/useDictation.ts`), registered only by the view's main quick add (`voiceShortcut` prop) and only while voice capture is on, with the same "not in a text field" guard as the shell plus "no dialog open" and "no pending `g`"; the shell only gains the `?` help row. Starting focuses the input with the caret at the end. Escape stops listening before its existing behaviours via a capturing `keydown` listener that exists only while listening, so it runs before the list's Escape (close panel / clear selection) and the input's blur; the microphone button keeps focus in the input (`mousedown` default prevented) so the caret position is kept for insertion.

### D7. Dependencies and footprint
None added. The recognition wrapper, dictation state machine and spoken tables (`web/src/lib/voice/engine.ts` entry) are a separate chunk loaded with `import()` only once voice capture is on: 10.1 KB raw / 4.1 KB gzip. Measured against `main` after merging `vim-keybindings` and `caldav`: the main bundle grows by 2.8 KB gzip (826.0 → 834.9 KB raw; 239,649 → 242,416 bytes at `gzip -9`) for the Settings section and privacy statement, the button and hook, feature detection and settings; CSS grows by 0.4 KB raw / 0.1 KB gzip (the pulse animation and a few utilities). Before `vim-keybindings` shipped the first lazy chunk, Vite's dynamic-import helper added another ~0.7 KB gzip (3.5 KB total then); that helper is now shared. The PWA precache already covers `**/*.js`, so dictation keeps working offline where the engine allows it. CSP unchanged: the speech API is browser-internal and not subject to `connect-src`; the server's `Permissions-Policy` (`camera=(), geolocation=()`) does not restrict the microphone. Server, image and memory unaffected.

### D8. Implementation notes
- Settings live in `localStorage` (`opentodo.voice`), mirroring the quick-add parsing settings (`opentodo.quickadd`), not in the Dexie `meta` table: they are read synchronously on render, are device-local by definition, and no Dexie version change is needed.
- Normalisation reads the time cues ("at" words, hour words, am/pm, "in", hour/day/week/month units, "one" words) from the parser's vocabularies in `web/src/lib/nlp/vocab`, so only spoken-specific words (triggers, number words 0–59, minute units, "and", "for") live in `web/src/lib/voice/spoken/*.ts`. "project <name>" and "at <name>" only convert when the name is an existing project/label, because both words are common in titles; "hashtag" and "label" always convert. Minutes after an hour must be a two-digit value or a zero word ("nine oh five"), so "at nine to ten" is not read as 9:02.
- On-device recognition uses Chromium's `SpeechRecognition.available({langs, processLocally: true})`; `processLocally` is set only when it answers `available`. `install()` is never called (it would make the browser download a model from its vendor on our behalf).
- With `continuous: false` the engine ends on silence. When only interim words were heard and the session ends without a final result, the input goes back to its previous text; errors never clear existing text.
- Real-microphone behaviour could not be verified in CI or in the development container; the browser flows were verified with an injected fake `SpeechRecognition` (Chromium via Playwright) and unit tests.

## Risks / Trade-offs

- [Audio goes to a browser vendor] → opt-in with explicit statement; on-device requested when available; never on by default; nothing sent by our code.
- [Recognition quality varies by language and accent] → interim display and mandatory Enter keep the user in control; typed correction is always possible.
- [Number words vs. literal titles ("buy two apples")] → normalisation only converts numbers adjacent to time, priority or duration cues; chips expose every interpretation and can be dismissed.
- [Browser without the API] → feature hidden with explanation; no broken button.
- [Shortcut collides with existing or future bindings] → `Shift+V` is free in the default layer and in `vim-keybindings`' planned set; the handler is local to quick add, so a later remap touches one hook.

## Migration Plan

Additive client change; rollback is redeploying the previous web build. No data migration.

## Open Questions

- Whether to offer an optional "auto-save after a pause" mode (off by default) once users have lived with manual confirmation.
- Whether dictation into the notes field is worth the extra surface.
