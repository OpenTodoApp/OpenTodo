---
title: Your first contribution
summary: Clone, run the app, pick a good first issue and ship a copy fix end to end in about 30 minutes.
audience: developer
section: Contributing
specs: []
screens: []
order: 1
---
# Your first contribution

About 30 minutes, from clone to pull request. The example fixes one sentence of the interface; every other change follows the same loop.

## 1. Set up (10 minutes)

You need Go 1.26 or newer, Node 22 or newer and GNU make. Docker is optional.

```sh
git clone https://github.com/<you>/OpenTodo.git   # your fork
cd OpenTodo
make dev
```

`make dev` starts the API on :8080 and the web app with hot reload on <http://localhost:5173>. Open it and create the owner account: the data lives in `./data`, which you can delete to start over.

## 2. Pick an issue (5 minutes)

Issues labelled [`good first issue`](https://github.com/OpenTodoApp/OpenTodo/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22) are small and need no design. Comment on the one you take, so nobody else does.

Copy fixes, a missing translation, a docs correction or a bug with clear steps need no OpenSpec change. A change of behaviour does: see [The OpenSpec workflow](openspec.md).

## 3. Make the change (10 minutes)

Say a button reads "Snooze 10 min" and should read "Snooze for 10 minutes". The English text is the message id:

1. Find it: `git grep -n "'Snooze 10 min'" web/src`.
2. Change the English in the `t('…')` call.
3. Refresh the message list: `node scripts/i18n/extract.mjs --write` (from the repository root).
4. Rename the key in every catalog under `web/src/locales/` (`de.json`, `fr.json`, …). Keep a translation that still fits; otherwise delete the entry and say so in the pull request, so a speaker of that language fills it in. Never paste a machine translation.
5. Check it in the running app, then run `make i18n-check`.

A Go change follows the same loop with `go test ./internal/<package>/`, a docs change with `make docs-check`.

## 4. Check and open the pull request (5 minutes)

```sh
make check          # what CI runs; run at least the part you touched
git switch -c fix/snooze-label
git commit -am "Say how long Snooze lasts"
git push -u origin fix/snooze-label
```

Open the pull request against `main`, fill in the template and link the issue (`Fixes #123`). A screen you changed gets a before and after screenshot (`make screens`, see [Tests and checks](tests-and-checks.md#screens)). The rules for pull requests are in [CONTRIBUTING.md](../../CONTRIBUTING.md#pull-requests).

## Next

- [Architecture tour](architecture-tour.md): one task edit, from the click to the other device.
- [Tests and checks](tests-and-checks.md): what `make check` runs and how to run one test.
