## Why

The Precision redesign (round 2, change 10 of 13) gives the assistant a surface of its own: the owner found Linear's agent screen the best part of that product (a calm, centred composer, the context in plain view, a proposal you read like a diff), while OpenTodo's assistant is a narrow side sheet with a plain text field and a separate Ask screen that only hands requests to that sheet. The round-2 mock-ups (`assistant.png`, `assistant-changes.png`) put the conversation on a page, with the composer under the brand mark, the skills and context in a tray, starter cards, and the change set as a card.

## What Changes

- The Ask screen (`/ask`, `g` then `k`) becomes the **Assistant** page and holds the conversation itself: empty, a greeting with the person's first name, the composer in the middle and three starter skills under it; once a conversation runs, the messages fill a centred column and the composer stays at the foot. **History** and **New chat** sit in the header. The sidebar entry and the palette say "Assistant".
- The side sheet stays for asking in place (Shift+I, Ask on Today, Break down from a task); it uses the same parts. Opening the assistant while on the Assistant page opens no sheet: the page takes the request.
- The composer moves onto the shared `ComposerFrame` (task-full-page D6): the field, a tray with the **Skills** menu and a **Context** chip naming what the turn carries (the view or the selected tasks), and the round Send button; Stop replaces Send while an answer streams.
- Starter cards: **Plan my week**, **Triage my inbox**, **Turn an idea into a project**, from the server's skill list; a card puts its skill in the composer. The row can be hidden on the device.
- Messages: the person's message as a quiet bubble at the right, the answer beside the assistant's mark.
- The change set becomes a card: a head ("Proposed changes · 3 of 4 selected", "Nothing changes until you apply"), one row per item with the change in words at the right, and a foot with **Apply 3 changes**, **Discard** and the keys. Behaviour is unchanged: checked by default, stale items unchecked, Enter applies, Esc discards, one-step undo.
- No chat UI library: the parts are our own on the design tokens (design D5 compares Vercel's AI Elements and assistant-ui).

Out of scope: the Go agent loop, the turn route, tools, the review and apply logic, and the conversation store (unchanged); attachments in the composer (the mock-up's paper clip; the assistant takes no files); a structured old → new layout of each change (the change keeps its words); the phone layout of the page beyond what the sheet already does (change 13, precision-phone). Advances the ROADMAP row "Conversational assistant in the app" (`in-app-assistant`).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `in-app-assistant`: the Ask composer requirement becomes the Assistant page; the chat panel shares the page's parts and yields to the page; the change set's presentation; the Skills menu sits in the composer's tray with the context chip.
- `assistant-skills`: which skills are offered as starter cards, and in what order.

## Impact

- Web only: `web/src/app/assistant/` (`AssistantPage.tsx` and `AssistantWelcome.tsx` new; `AskEntry`, `AssistantComposer`, `AssistantPanel`, `AssistantPanelBody`, `AssistantRoot`, `ChangeSetReview`, `useAssistantConversation` changed), `Shell.tsx`, `Sidebar.tsx`, the palette registry and the `go.ask` shortcut text.
- No server, API, sync or op change; no new dependency. Bundle: +3.5 kB gzip in total JS (+6.6 kB raw), all of it in the lazy assistant chunk.
- Strings in five catalogs; the assistant guides; visual baselines for the assistant stories.
