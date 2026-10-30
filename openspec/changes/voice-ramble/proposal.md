# Proposal

## Why

People capture in bursts: walking back from a meeting, driving, standing at a whiteboard. Todoist answered this with Ramble (January 2026, "listens to unstructured spoken thoughts while walking or driving and extracts or updates multiple structured tasks") and Task Capture (2026, "scan notes, photos, and files for action items"); the research names a multi-task voice brain dump and a photo of meeting notes, reviewed as one batch before anything is saved, as the 0.20 capture feature (research Phase 3 item 4, gap analysis P3.4).

OpenTodo has every piece but the join. Dictation exists, but only in quick add and only as **one** task (`voice-capture` "Dictation into quick add"; `useDictation` is used only by `QuickAdd.tsx`). The assistant already turns pasted text into a reviewable change set (`in-app-assistant` "Pasted text is untrusted context", "Reviewable change sets"), and runs on the person's own device for encrypted accounts (`in-app-assistant` "On-device assistant for encrypted accounts"). What is missing: a microphone in the assistant composer, a way to give it a photo, and a skill whose whole job is "turn this into tasks and show me before you save".

Issue #501 (Gemini "Test connection" answering `unknown API route`) matters here because a ramble is only as good as the provider behind it. The diagnosis shipped in Unreleased (a request a reverse proxy rewrote now says so: `in-app-assistant` "A refused test request says so"); this change adds a Gemini end-to-end check with images to the provider tests, so the provider a ramble most often uses on a free key is covered, and leaves the issue open until the reporter confirms.

## What Changes

- **A microphone in the assistant composer.** On the Assistant page and in the panel, with voice capture available on the device, a microphone button records a ramble of up to 5 minutes with the recogniser the device already uses ("This browser" or "This server's speech service", `voice-capture`). The transcript lands in the composer as editable text; nothing is sent until the person sends it.
- **A photo in the assistant composer.** A "Add photo" button (and paste or drop of an image) attaches up to 4 images to the next message: notes, a whiteboard, a printed agenda. Images are scaled down on the device, sent with that one turn, held only in memory on the server, and never stored, synced or kept in the device's conversation.
- **A built-in skill `capture` ("Turn this into tasks").** It reads the ramble or the photo, checks existing projects, labels and open tasks, and proposes **one change set**: new tasks with title, project, section, labels, due, priority and estimate where the material says so, and changes to existing tasks only when the material names them ("the dentist call moved to Friday"). The review card, apply, offline apply and one-step undo are the existing ones; nothing is written without confirmation.
- **One entry point outside the assistant**: the command palette's "Ramble into tasks" opens the panel with `capture` chosen and the microphone listening. No new keyboard shortcut, no new sidebar destination, nothing in quick add.
- **Providers that read images**: Anthropic (image blocks), OpenAI and Gemini (Chat Completions image parts). An OpenAI-compatible endpoint reads images only when the owner ticks "This model reads images"; "Test connection" checks it with a small built-in image. The on-device assistant for encrypted accounts sends images the same way, from the device.
- **Turn route limits**: images travel beside the text, at most 4 per turn and 16 MB per request; the 256 KB text limit is unchanged.
- **#501**: a Gemini request test (tools, streaming and an image part) against a fake server at Google's OpenAI-compatible path, so a regression in the Gemini adapter fails CI.

Not **BREAKING**: no op schema change, no new environment variable, no new route; the turn route accepts an additive field.

## Out of scope

- Live, continuous listening that edits tasks while the person is still speaking (Todoist's real-time Ramble). A ramble is recorded, transcribed, then sent once.
- PDFs, documents and screenshots of other apps as "files to scan"; only images.
- Storing the photo as an attachment of the created tasks (the person can attach it from the task afterwards, with the existing attachments).
- Wear OS, Apple Watch and the iOS Action Button; `apple-shortcuts` covers Siri and Shortcuts dictation into quick add.
- On-device speech-to-text models in the browser (Whisper in WebAssembly): bundle size, see design D2.
- Automatic application of a ramble's proposal ("No change without approval", anti-roadmap).

ROADMAP-1.0 item advanced: 0.20 "Everywhere" → `voice-ramble`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `voice-capture`: dictation is no longer quick-add only; a longer recording mode feeds the assistant composer, with the same recognisers, statements and errors.
- `in-app-assistant`: the composer gains the microphone and photos, the turn route accepts images, providers declare whether they read images, and the on-device assistant sends images from the device.
- `assistant-skills`: the catalogue gains `capture`.

## Impact

- **Data model, sync, op schema**: none. The created and changed tasks are ordinary ops applied with `mutateMany()` and device `assistant:<device-id>`, so they work offline once proposed and converge like any edit.
- **E2EE**: no new content field. For encrypted accounts the ramble runs through the on-device assistant: the transcript and images go from the device to the person's own provider, never to the OpenTodo server; with "This server's speech service" chosen the existing statement already says the server and the speech service read the audio while the request runs.
- **API**: `POST /api/v1/assistant/turn` accepts `images` on the last user message (additive); new error `images_unsupported`; `GET /api/v1/assistant/skills` lists `capture`. The owner's assistant settings gain `compatible.images` (boolean). `docs/api.md` updated; no new route, so the route matrix is unchanged.
- **MCP / CLI**: `capture` is served as an MCP prompt like every skill (text only: an MCP client brings its own images). No CLI change.
- **CalDAV, vault**: none.
- **Size**: no dependency. Image scaling uses the browser's `createImageBitmap` and a canvas. Web bundle about +6 KB gzipped (composer controls, long-recording mode, image preparation); server binary unchanged within noise.
- **Outbound**: unchanged hosts. Images go only to the provider that already receives the turn.

Relates to #501
