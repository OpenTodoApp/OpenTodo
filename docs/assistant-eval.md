---
title: Assistant eval
summary: Recorded scenarios that check how a real model uses the in-app assistant's tools; how to run them, what they cost and when to run them.
audience: developer
section: Internals
specs: []
screens: []
order: 41
---
# Assistant eval

The server's tests check that the [assistant's](assistant.md) tools are allowed and validated. They cannot tell whether a real model uses those tools well. The assistant eval does that: recorded scenarios run against a real provider through the server's own turn route (OpenSpec change `assistant-eval`).

It is not part of CI, because it costs tokens. Run it by hand before a change to the assistant's instructions or tools, and compare the report with the last one.

## Running it

```bash
ASSISTANT_EVAL_PROVIDER=anthropic ASSISTANT_EVAL_KEY=sk-ant-… make assistant-eval
```

| Variable | Meaning |
| --- | --- |
| `ASSISTANT_EVAL_PROVIDER` | `anthropic`, `openai`, `gemini` or `compatible` |
| `ASSISTANT_EVAL_MODEL` | the model id; optional for `anthropic`, which then uses the server's default |
| `ASSISTANT_EVAL_KEY` | the API key; optional for a `compatible` endpoint |
| `ASSISTANT_EVAL_BASE_URL` | a compatible endpoint's base URL, usually ending in `/v1` (Ollama, LM Studio, OpenRouter) |
| `ASSISTANT_EVAL_RUNS` | runs per scenario, 3 by default |
| `ASSISTANT_EVAL_ONLY` | scenario names to run, separated by commas |
| `OUT_DIR` | where the report goes, `eval-report` by default |

Only the script reads these variables; the server gets nothing new. Never commit a key. The key goes to a server on `127.0.0.1` that the script starts, and that server sends it only to the provider.

For each scenario, `scripts/assistant-eval/run.mjs` starts `bin/opentodo` on a temporary data directory. It creates the owner, sets up the assistant with no monthly limit and accepts its terms, then writes the scenario's tasks, projects, labels and notes through the REST API. Each turn goes to `POST /api/v1/assistant/turn`, and the checks read the streamed events: blocks, the change set, the text and the usage. Proposed changes are never applied.

Models vary, so each scenario runs 3 times and passes when at least 2 runs pass. The checks are about tool calls and simple text patterns, never wording.

## The report

`eval-report/report.md` lists each scenario with its runs passed and tokens. For each run it gives the question, the blocks shown, the changes proposed, the answer and every expectation that failed. `report.json` holds the same, with the events of each turn (text clipped). The command exits with 1 when a scenario fails.

## Cost

There are 25 scenarios, and each turn uses about 10,000 to 20,000 tokens, mostly the instructions and tools (read from the provider's cache after the first round); a turn without a skill sends the write tools only after the model asks for them with `propose_changes`, so a question that only reads stays near the lower end. A full run is about 42 turns, so roughly 800,000 tokens. Most of that is cached input, which providers bill at about a tenth; check your provider's prices. Use `ASSISTANT_EVAL_ONLY` and `ASSISTANT_EVAL_RUNS=1` while you work on one behaviour.

## Scenarios

Each scenario is a JSON file in `scripts/assistant-eval/scenarios/`:

- `seed`: `labels`, `projects` (`kept_away` keeps one away from assistants), `sections` (`name`, `project`), `tasks` (`due`, `deadline` and `start` in whole days from today, `time`, `estimate_minutes`, `labels`, `location`, `description`, `project`, `section`, `recurrence`, `habit`) and `notes`, each with a `key`;
- `view`: the view the user asks from (`today` by default; `project` offers the board and timeline to a skill);
- `skill` and `selected`: a [built-in skill](assistant-skills.md) the turn runs and the seed tasks it is about, as an entry in a task's or Today's menu sends them (`find-slot`, `brief-today`);
- `turns`: the user's messages in order, each with an `expect`.

An `expect` can hold:

| Key | Passes when |
| --- | --- |
| `blocks` | a block of that `kind` was shown (`followups` for the suggestions under the answer), with exactly `ids`, or at least `ids_include` and `min_ids`, on `date` or until `to` (days from today), grouped by `group_by`, of the board column `section`, of a `project` or `task` (`of`, activity), or with at least `min_options` |
| `no_tools` | none of these display tools was called (`show_map`, …) |
| `changeset` | a change set was proposed (`true`) or nothing was (`false`) |
| `changes` | the proposed changes of an `entity`, with `fields`, touch exactly `ids`, or at least `min` of them (`create`) |
| `links` | the answer links each task as `[title](?task=<id>)` |
| `text`, `no_text` | the answer matches, or never matches, each pattern (case-insensitive) |
| `no_map_claim` | the answer does not say a map is there unless a map block was shown |
| `never_ids` | these items appear in no block, change or text |

Ids are seed keys. The script maps them to the ids the server created.

Some scenarios are marked `"fake": true`: [scripts/fake-llm.mjs](../scripts/fake-llm.mjs) answers them the way a good model would. Two commands need no key:

```bash
ASSISTANT_EVAL_FAKE=1 node scripts/assistant-eval/run.mjs   # those scenarios, against bin/opentodo
node --test scripts/assistant-eval/*.test.mjs                # the checks on recorded events, no server
```
