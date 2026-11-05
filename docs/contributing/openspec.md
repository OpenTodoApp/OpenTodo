---
title: The OpenSpec workflow
summary: When a change needs a proposal, the three commands that plan, build and archive it, and what reviewers check.
audience: developer
section: Contributing
specs: []
screens: []
order: 3
---
# The OpenSpec workflow

OpenTodo's behaviour is written down before it is built, with [OpenSpec](https://github.com/Fission-AI/OpenSpec). The live specs are in `openspec/specs/<capability>/spec.md`; a change in progress is a folder under `openspec/changes/<name>/`.

## When you need a change

| Needs a change | Doesn't |
| --- | --- |
| Anything a user, an API client or another device can notice: a screen, a setting, a route, a field, an error code, a sync rule | A bug fix that restores the specified behaviour |
| A new op field or data format | A refactor with identical behaviour |
| A new background job or outbound request | Docs, translations, tests, dependency updates |

When in doubt, open an issue first and ask.

## The three steps

| Step | With Claude Code | By hand |
| --- | --- | --- |
| Plan | `/opsx:propose "<idea>"` | `npx @fission-ai/openspec@1.13.2 new change <name>`, then write the four files |
| Build | `/opsx:apply` | implement `tasks.md` in order, ticking each `- [x]` |
| Archive | `/opsx:archive` | `npx @fission-ai/openspec@1.13.2 archive <name> --yes` |

A change folder holds:

- `proposal.md`: why, what changes, what is out of scope, the `ROADMAP.md` row it advances.
- `specs/<capability>/spec.md`: the delta. Requirements use SHALL; each has at least one `#### Scenario:` with WHEN and THEN.
- `design.md`: decisions with the alternatives rejected, data model impact, size impact, the interface budget for a screen.
- `tasks.md`: small steps, each naming the test or command that verifies it.

The rules every artifact follows are in `openspec/config.yaml`. Check the whole tree with `make openspec-validate`.

Archiving merges the delta into `openspec/specs/` and moves the folder to `openspec/changes/archive/<date>-<name>/`. It happens in the pull request that finishes the change, together with the `CHANGELOG.md` line and the **Shipped** mark in `ROADMAP.md`.

## What reviewers check

- The spec says what happens offline and how two devices converge, for anything that touches data.
- Every new route has an authentication scenario and an error scenario.
- No write bypasses the op log; no op field is renamed or removed.
- No new mandatory environment variable, no telemetry, no outbound request the user did not configure.
- Size: a new dependency is justified, and the web app's first load stays inside `web/bundle-budget.json`.
- The tasks are done and each one was verified the way it says.
- The user docs in `docs/` describe the new behaviour.
