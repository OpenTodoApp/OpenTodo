# Proposal

## Why

The phone quick-add sheet's **date tool** was a dead button (GitHub issue [#1386 → #1624](https://github.com/OpenTodoApp/OpenTodo/issues/1624)). A date has no token to start — dates are typed in words ("tomorrow") — so the spec had the date tool only "move the caret to the end of the line", which does nothing visible: tapping it added a space and opened no picker. This removes the dead tool until the phone gets a date picker (a separate proposal, after the freeze). The `natural-language-capture` requirement "Quick add tools on a phone" codified the dead behaviour, so it changes here.

## What Changes

- The phone sheet's tool row no longer shows a date button. The remaining tools (priority, label, estimate, project) and the Notes tool and send button are unchanged, and each still starts its token.
- Typing a date in words still works everywhere, and the date chip still appears when the line sets one — only the dead tool button is gone.

## Capabilities

### Modified Capabilities

- `natural-language-capture`: "Quick add tools on a phone" drops the date tool button.

## Impact

- `web/src/app/quickadd/SheetBar.tsx`: `TOOLS` loses `when`. One test. No parsing, data or API change. A phone date picker is proposed separately.
