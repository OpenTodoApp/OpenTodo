## Context

See proposal.md for why. Today the assistant's state lives in `useAssistantConversation` (thread on the device, consent, composer draft, skill and pasted text, the streamed turn, the review), rendered by `AssistantPanel` inside `AssistantSheet` (overlay module) from the lazy assistant chunk (`AssistantRoot`). The Ask screen (`AskEntry.tsx`, main chunk) only collects a request through `AskComposer` and calls `openAssistantWith`, which opens the sheet. The task page (task-full-page D6) added `ComposerFrame` for the assistant to adopt.

## Goals / Non-Goals

**Goals:** one conversation in two hosts (page and sheet) from the same parts; the mock-ups' empty state, tray, messages and change-set card; keep every behaviour of review, apply, undo, consent, offline and encryption; stay inside the lazy chunk; no dependency.

**Non-Goals:** sharing one live conversation between a mounted sheet and the page at the same time (only one is ever mounted, D1); history as a sidebar; message editing, regenerating or branching; file attachments.

## Decisions

**D1. The page is a second host, not a new state.** `AssistantPage` (lazy, default export of its own module in the assistant chunk) calls `useAssistantConversation` with no view context and renders the body and the composer in a page. `AskScreen` renders it when the assistant is available, and the unavailable notices otherwise. `AssistantRoot` gets `onPage` from the shell: while the route is `/ask` an open request closes at once and focuses the page's composer, so the page's composer takes the prefill (`useAssistantPrefill` is a shared store) and Shift+I, Ask in the command bar and Break down never stack a sheet on the page. Both hosts read the same threads from the device, so leaving the page and pressing Shift+I continues the latest thread. Alternative: retire the sheet and always navigate to the page. Rejected for now: the sheet keeps the place you asked from (its view is the context), which is what "Ask" on Today and Break down rely on; recorded as a question for the owner.

**D2. Empty state.** `AssistantWelcome`: the brand mark (`BrandMark`, mono, from `brand.svg` as round-2 decision 8 asks) as a 160 px watermark at 7 % opacity on the page and a 24 px mark in the sheet; the greeting by the device's hour ("Good morning/afternoon/evening, {first name}.", no name → without it) and "What should we sort out?"; one line on review-before-apply; the composer (page only); "Start from a skill" with up to three cards and a × that hides them on the device (`localStorage`, read and written in try/catch; a private window shows them again). The empty state replaces the old example list.

**D3. Composer on the frame.** `Composer` renders `ComposerFrame`: above the field the chosen skill and pasted text (unchanged), the textarea (the frame strips its border), the tray (a labelled **Skills** menu button with its name visible, then the context chip), Stop in the frame's `end` slot while streaming, and the frame's round Send (`aria-label` "Send", tooltip with Enter). The context chip names the selection when a prefill carries one ("1 selected task"), else the sheet's view (Today, Upcoming, Inbox, This project, This view), else nothing; it is information, not a control: the turn already sends exactly that context. The prefilled selection is now state as well as a ref so the chip can render it without reading a ref during render.

**D4. Change-set card.** Same props and keys as before. Head: pencil icon, "Proposed changes", "{checked} of {count} selected", "Nothing changes until you apply". Rows: checkbox and title (muted when unchecked), shared/stale badges, the change lines at the right from a 28 rem card width (`@container/review`), under the title below it. Foot: **Apply n changes** (plural, with a check icon; disabled at 0), **Discard**, and "Enter applies, Esc discards. Each change shows in its task's history." with keycaps. The result keeps the summary and Undo in one quiet row. Answers and the card are indented under the assistant's mark; the person's messages are a bubble at the right.

**D5. No chat UI kit.** Compared against AGENTS.md rule 6:

| | Vercel AI Elements | assistant-ui | Our parts |
|---|---|---|---|
| What it is | shadcn registry: components copied in, on Radix primitives, `cn()` (clsx + tailwind-merge), shadcn CSS variables | `@assistant-ui/react` runtime and primitives, Radix, zustand; markdown via `@assistant-ui/react-markdown` (react-markdown, remark) | `ComposerFrame`, `Menu`, `Markdown`, overlay, tokens we have |
| Fit with our stream | built for the AI SDK's `useChat` and message parts; our stream is our own NDJSON events | `ExternalStoreRuntime` can wrap our hook, but the change set, consent and stale handling are custom tool UI anyway | direct |
| Tokens and lint | shadcn variables (`--background`, `--primary`) beside `--ot-*`; raw palette classes the ui-lint forbids | its own class names and theming | `--ot-*` only |
| Bundle (gzip, estimate) | `Response` uses Streamdown (Shiki, KaTeX, Mermaid): hundreds of kB unless trimmed; plus Radix pieces | roughly 40–80 kB for runtime, primitives and markdown | +3.5 kB measured |

Both kits solve streaming, branching, editing and attachments, none of which this change needs, and neither touches what makes our assistant ours (proposal review, consent, offline history). We build the surface ourselves; if a later change wants branching or attachments, assistant-ui's external-store runtime is the one to revisit.

**D6. Names.** The page, the sidebar entry, the palette command and the `go.ask` text say "Assistant"; the route stays `/ask` and the Help screen id stays `ask`, so links and docs anchors keep working. "New" becomes "New chat".

**Interface budget.** The page adds no chrome row to lists. Scroll regions: the content only (the foot composer is sticky, not a scroller). The header has two visible actions (History, New chat). No new shortcut.

**Bundle.** Measured with `npm run build` on this branch and on its base: total JS 7,815,161 → 7,821,751 bytes (+6.6 kB raw), gzip 2,338,084 → 2,341,635 bytes (+3.5 kB). The page is its own 1.4 kB-gzip chunk; the sheet's chunk carries the shared parts.

## Risks / Trade-offs

- Two hosts of one conversation could diverge if both were mounted. → Only one is (D1); both reload the latest thread from the device on mount.
- The context chip reads like a picker in the mock-up. → It is plain text with no hover or focus; making it a picker (choose a project or view as context) is a later change and a question for the owner.
- The greeting uses the device's clock and the account name, both local; no request.
- Starters hidden with × stay hidden only on that device. → Matches the other per-device dismissals; the Skills menu always lists every skill.

## Migration Plan

Web only. Old `/ask` links open the page. Rollback is a revert.
