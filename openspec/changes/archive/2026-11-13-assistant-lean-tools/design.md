# Design

## Decisions

### D1. A meta tool, not a classifier

`propose_changes` (no arguments) is defined in `internal/assistant`. The loop keeps a per-turn flag; once it is set, the tool list of the next `Start` or `Next` includes the write tools. The providers already accept a tool list per request, so the conversation history keeps the earlier tool calls valid.

The device loop mirrors it, and the manifest marks `propose_changes` with kind `meta`.

Choices made while building it:

- **`Conversation.SetTools`** replaces the tools from the next call on, on the server (Anthropic and Chat Completions adapters) and the device (`providers.ts`). Anthropic's strict mode is decided per list, so the lean first rounds can be strict where the full list is not.
- **Which turns are lean:** a turn without a skill and without an open proposal (`leanTurn`). A turn amending an open proposal is already about changes: it offers the write tools and `drop_from_proposal` from its first round. Skills keep their lists.
- **What waits:** every registry write tool and `remember` (it proposes a memory item, a change like any other). The first rounds offer the read tools, the display tools and `propose_changes`.
- **After the call** the list is the first list plus the write tools; `propose_changes` stays offered (a second call answers the same note, so a model that calls it again loses nothing).
- **A write called before `propose_changes`** (a model naming a tool it was not offered) is answered `not_offered` with "call propose_changes first", and plans nothing.
- **Instructions:** a lean turn's system text ends with `LeanNote` ("you start with the read and show tools only … call propose_changes first … never say that you cannot make changes"); the device adds the same note from the manifest, pinned by `prompt.vectors.json`. The tool's description lists the kinds of change.
- **No disclosure change:** the turn sends less, nothing new.

### D2. Measured

`assistant-eval` reports tokens per scenario. The change lands only if every scenario passes and question-only turns use clearly fewer input tokens.

Measured on this change (the request each model call sends, recorded by a proxy in front of the provider, every scenario's first round):

| | Tools | Request | Tool definitions | Input (bytes / 4) |
| --- | --- | --- | --- | --- |
| Before, a turn without a skill | 50 | 57.3 KB | 51.1 KB | ~14,300 tokens |
| After, a turn without a skill | 35 | 33.5 KB | 27.2 KB | ~8,400 tokens |

A question that only reads sends about 42% less input in each round; a change pays one extra round (`propose_changes`) and the full list from then on.

**The pass rates are from a small local model, not a real provider.** No provider key was available, so the suite ran against `qwen2.5:3b` on Ollama (CPU only, 4,096-token context) through the compatible provider. It could not answer at all, before or after: every model call ran past the server's 90-second answer timeout (0 of 25 scenarios before; after, the 20 calls measured all timed out at about 85 seconds, and the run was stopped), and both prompts exceed the model's context. So the pass-rate condition of D2 is not shown yet: the real-provider run (task 1.2) stays open.

## Data model, size, interface budget

None: no data, size or interface changes.

## Risks / Trade-offs

- **The model forgets to call `propose_changes`** and says it cannot change things. The instructions and the tool description make it explicit, and the eval has a scenario for it.
- **The prompt cache.** Anthropic caches tools before the system text: the round after `propose_changes` changes the tools, so it writes a new cache entry instead of reading one. Question turns, the common case, keep their cache.
