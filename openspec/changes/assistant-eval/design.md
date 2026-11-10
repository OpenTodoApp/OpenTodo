# Design

## Context

`scripts/fake-llm.mjs` scripts a provider for the docs screenshots and the layout check. That proves the plumbing, not the model. The turn route streams `status`, `text`, `block`, `changeset`, `usage` and `done` events, which carry everything an eval needs to check.

## Decisions

### D1. Drive the real route against a throwaway server

The eval starts `bin/opentodo` on a temporary data directory, the same way the layout check does. It creates the owner, configures the assistant from `ASSISTANT_EVAL_PROVIDER`, `_MODEL` and `_KEY` (plus `_BASE_URL` for a compatible endpoint), consents, seeds the scenario through the REST API, and posts the turn.

This tests exactly what users run: the server's instructions, tools and checks. A Go harness calling `Loop.Run` directly was rejected: it would skip the route and the provider wiring.

### D2. Scenarios as data

Each scenario is a JSON file in `scripts/assistant-eval/scenarios/`:
- `seed`: tasks, projects, places, notes;
- `turns`: the user's messages, for multi-turn cases such as a complaint;
- `expect`: tool calls with their kind and id sets, tools that must not be called, text patterns that must not appear, whether a change set is expected.

There are about 12 to start. Each scenario runs 3 times by default (`ASSISTANT_EVAL_RUNS`), because models vary; it passes when at least 2 of the 3 runs pass.

### D3. Report

`eval-report/report.md` and `report.json` hold, per scenario: the runs, the events (text clipped), tokens, and which expectation failed. The exit code is non-zero when any scenario fails.

## Risks / Trade-offs

- **Flaky models.** Majority voting over runs, and expectations about tool calls rather than wording.
- **Cost.** About 12 scenarios × 3 runs × roughly 20k tokens each. The README states the expected cost per run.

## Migration Plan

None: it is tooling only.
