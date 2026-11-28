## Decisions

Store the choice as the additive string field `user_prefs.priority_circle_style` through the existing local-first operation path. Only `outline` opts out of the fills. A missing, empty or unrecognised value reads as Filled. This reuses the account's sync and last-writer-wins semantics. A device-only override would let the same account show a different choice on a phone.

Apply the choice as an attribute on the document root, like the full-title preference. The existing priority-ring table and theme colours supply the same P1/P2 fills and P3/P4 outlines on both layouts. Presentation changes without subscribing every rendered row to preferences. The completed state keeps its own check style.

The setting uses the existing keyboard-accessible segmented control and one row in Appearance. Task-list chrome, property counts, primary destinations, scroll regions and shortcuts stay within their existing budgets. No dependency or new runtime service is added. Verify size with the existing bundle budget.
