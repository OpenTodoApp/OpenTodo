# Tasks

Backend tasks are verified with `go test ./...`; frontend tasks with `npm test` and `npm run build` in `web/`. `make check` runs before the last task is ticked.

## 1. Skill and shared definitions

- [x] 1.1 Add `capture` to `internal/agenttools/skills.go` (id, name, description, example, instructions per design D7, tools `withRead(...)` plus `create_tasks`, `update_tasks`, `schedule_tasks`, `move_tasks`, `complete_tasks`, `create_project`, `create_label`, result `ResultChanges`). Verified by `skills_test.go`: six ids, `capture` cannot call `trash_tasks`, ids never renamed.
- [x] 1.2 Regenerate the device manifest (`web/src/lib/assistantDevice/manifest.json`) and the prompt vectors so the device loop knows `capture`. Verified by `manifest_test.go` and `prompt.vectors.json` tests staying equal on both sides.
- [x] 1.3 MCP: `capture` appears in `prompts/list` and `prompts/get`. Verified by `internal/mcp/prompts_test.go`.

## 2. Server: images in a turn

- [x] 2.1 `assistant.Message` gains `Images []Image{MediaType, Data}`; the turn handler accepts `images` on the last user message only, checks type, magic bytes, count (4), per-image size (3.75 MB decoded), body (16 MB) and keeps the text limit; errors `413 too_large`, `400 invalid_input` (`images`, `messages`), `422 images_unsupported`. Verified by new handler tests in `internal/httpapi` (each error, the 401 and 409 `encryption_enabled` paths unchanged) and a test that no image bytes reach the logger, the audit log or the usage store.
- [x] 2.2 Anthropic: image content blocks through the SDK. Verified by a provider test against the fake Messages server asserting a base64 image block.
- [x] 2.3 Chat Completions adapter: `image_url` parts with `data:` URLs for OpenAI, Gemini and a compatible endpoint marked `compatible.images`. Verified by provider tests, including the Gemini request shape at `/v1beta/openai/chat/completions` with tools, streaming and an image part (design D11, refs #501).
- [x] 2.4 Owner settings: `compatible.images` (default false) in `PUT/GET /api/v1/settings/assistant`; "Test connection" for a marked compatible endpoint also sends the built-in 64×32 "milk" image. Verified by settings and test-route tests (accepted, refused with the "endpoint refused images" message).
- [x] 2.5 `GET /api/v1/me/assistant` reports `images` for the provider of the next turn (owner, member's own, compatible mark). Verified by a table test over the provider combinations.
- [x] 2.6 Provider refusals of images (400 with an image error from Anthropic, OpenAI, Gemini) map to `images_unsupported`. Verified by provider tests with recorded error bodies.
- [x] 2.7 Disclosure version +1 with "photos you add" in the field list; existing consents stay valid. Verified by a consent test (an existing consent still sends text turns) and the disclosure snapshot.
- [x] 2.8 A 302 in front of the owner test route yields the "rejected before any provider was asked" message for Gemini. Verified by an httpapi test with a redirecting handler (refs #501).

## 3. Web: microphone in the composer

- [x] 3.1 Long-recording mode in `web/src/lib/voice`: continuous browser recognition restarted across segment ends; server recogniser cutting pieces at pauses and at 55 s, sent in order; stop on button, Escape, 8 s silence, 5 min; no spoken-token normalisation. Verified by `dictation.test.ts`/`recognition.test.ts` with `fakeRecognition.ts` (limit, silence, ordering, a failing third piece keeps the first two).
- [x] 3.2 Microphone button in `AssistantComposer.tsx`'s tray, shown only with voice capture on and recognition available; elapsed time "1:24 / 5:00", Stop, announcements "Listening"/"Stopped". Verified by a happy-dom interaction test and a Storybook story (listening, failed piece).

## 4. Web: photos in the composer

- [x] 4.1 Image preparation in `web/src/lib/assistantImages.ts`: accepted types, `createImageBitmap` with orientation, long edge ≤ 1568 px, JPEG 0.85 without metadata, 3.75 MB cap, at most 4. Verified by unit tests with fixture images (rotated JPEG, large PNG, HEIC refused where undecodable, PDF refused).
- [x] 4.2 "Add photo", paste and drop in the composer; thumbnails with remove; first-photo note naming the provider, remembered per device in local storage; hidden when `images` is false. Verified by happy-dom tests and stories at 360 px and 1280 px.
- [x] 4.3 The conversation store keeps "N photos (not kept)" in place of images and never resends them. Verified by `assistantStore.test.ts`.
- [x] 4.4 Server turns send `images` on the last message; `images_unsupported` keeps the message and photos with the explanation. Verified by `assistant.test.ts`.

## 5. Web: on-device assistant

- [x] 5.1 `web/src/lib/assistantDevice/providers.ts` sends image blocks (Anthropic) and image parts (Chat Completions) with the same limits; a refusal says the device's model does not read photos. Verified by `providers.test.ts` (request bodies, refusal) and `loop.test.ts` (a `capture` turn with a photo makes no request to the OpenTodo server).

## 6. Entry point and interface budget

- [x] 6.1 Command palette entry "Ramble into tasks" (no default key), listed only when the assistant is available; opens the page composer or the panel with `capture` and starts listening when voice capture is on. Verified by a palette test and the shortcut registry test (no new binding).
- [x] 6.2 Interface budget check: no chrome above lists, no sidebar destination, no new scroll region; composer tray fits 360 px with 44 px targets. Verified by `make ui-check` and the 360 px story.

## 7. Docs, i18n, changelog

- [x] 7.1 Strings in the six languages (`web/src/locales/*.json`: tray labels, statuses, the first-photo note, errors, the palette entry, the skill's name and description). Verified by `make i18n-check`.
- [x] 7.2 `docs/assistant.md` (a "Ramble and photos" section), `docs/quick-add.md` (pointer for several tasks), `docs/assistant-privacy.md` (photos and ramble audio), `docs/assistant-encrypted.md`, `docs/assistant-skills.md` (`capture`), `docs/assistant-owner-options.md` ("This model reads images"). Verified by `npm run docs:check`.
- [x] 7.3 `docs/api.md`: `images` on the turn route, `images_unsupported`, `compatible.images`, `images` on `GET /api/v1/me/assistant`, the six skills. No new route, so `internal/httpapi/route_matrix_test.go` is unchanged; verified by `go test ./internal/httpapi/`.
- [x] 7.4 CHANGELOG entry under Unreleased mentioning the Gemini request test (refs #501). Verified by `make check`.
