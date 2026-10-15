# Proposal

## Why

OpenTodo already has a capable in-app assistant:
- your own model and key (Anthropic, OpenAI, Gemini or a local endpoint)
- tools shared with MCP
- every write proposed as a change set you review before it applies, with one-step undo

But it hides behind a header button and `Shift+I`, opens to an empty panel, and accepts only free text. Linear's "Ask Linear" shows how the same engine feels when it's front and centre: a prominent composer, example cards, and **skills**, named workflows such as "Create a new project". People don't discover a side panel, and few know what to ask an empty box. Packaged workflows turn the assistant from a curiosity into something people use weekly. They also pair with the website's planned method guides and templates: "read the weekly review guide, or let the assistant run it for you".

## What Changes

- **"Ask OpenTodo" composer:** a prominent input with a Skills menu and example cards:
  - at the top of the Today view (or as its empty state)
  - on a new **Ask** screen with its own go-to shortcut
  Both open the existing assistant panel, prefilled with the text or the chosen skill. The panel itself gains the same Skills menu.
- **Five built-in skills** (each ends in the existing reviewable change set, or a read-only answer):
  - *Turn an idea into a project*: idea text becomes a project with sections, tasks and estimates.
  - *Plan my week*: proposes due dates and time blocks for open work within the user's working hours.
  - *Weekly review*: walks the inbox, overdue and stale tasks, and proposes rescheduling, trashing or moving, with a summary.
  - *Triage my inbox*: proposes a project, labels, priority and date for each inbox task.
  - *Break this down*: turns one task into subtasks with estimates (also offered from a task's menu).
- **Skills are server-side definitions next to the agent tool registry:** instructions, the tools each may use, the result format and example cards. They run through the same loop, limits, consent, caps and untrusted-text rules as free-text turns.
- **The same skills as MCP prompts.** The MCP server advertises the prompts capability, so Claude Desktop or any MCP client can run "Weekly review" against OpenTodo with the user's agent token and the existing read and write permissions.
- **Pasted text as context.** Text pasted into the composer (notes, an email, a list) is sent as untrusted user-provided data, like email-to-task content, and can seed a skill ("turn this into a project").
- **Quiet when off:**
  - With the assistant disabled (the default) or for an end-to-end encrypted account, members see no composer.
  - Owners see one dismissible "Set up the assistant" line instead.
  - The product stays complete without AI.

## Out of scope

- User-defined skills (for example Markdown skill files synced as an entity). A later change.
- File and image attachments (the paperclip). They wait for an `attachments` capability, and images need models that read them.
- A command palette "Ask" section. The planned `command-palette` change reuses this change's entry point.
- New read tools such as activity summaries ("Catch me up"). This change uses the existing tool registry.
- Any change to how writes are reviewed, applied, undone, limited or audited.

Advances ROADMAP.md "Next: Bring your agent" (in-app assistant), and pairs with the website's `website-content-hub` guides.

## Capabilities

### New Capabilities

- `assistant-skills`: the built-in skill catalogue, what a skill defines (instructions, allowed tools, result format, examples), how a skill run starts and ends, and the MCP prompts that expose the same skills.

### Modified Capabilities

- `in-app-assistant`: the panel gains a Skills menu and opens prefilled from the composer. A composer appears on Today and on an Ask screen only when the assistant is available to the user. Pasted text is handled as untrusted context.
- `mcp-server`: advertises and serves prompts (`prompts/list`, `prompts/get`) for the built-in skills, with the existing authentication and permission rules.
- `web-app`: the Ask screen, its go-to shortcut (`g then a` is already taken; the exact key is chosen in design) and the Today composer.

## Impact

- **Server:** `internal/agenttools` (skill definitions and registry), `internal/assistant` (a turn can name a skill; instructions and tool allow-list applied), `internal/mcp` (prompts capability). One new authenticated route, `GET /api/v1/assistant/skills`, and an optional skill id and working-day context on `POST /api/v1/assistant/turn`. No new environment variable, no outbound host beyond the configured providers.
- **Client:** `web/src/app/assistant/` (Skills menu, prefilled open), a composer component in `web/src/ui` with stories, the Today view, the Ask screen, shortcuts and help.
- **Data:** none. Conversations stay device-local, and change sets apply through `mutateMany()` as today.
- **Docs:** `docs/assistant.md` (skills, composer), `docs/mcp.md` (prompts), keyboard guide.
- **Size:** no dependency. Skill definitions are a few KB of text.
