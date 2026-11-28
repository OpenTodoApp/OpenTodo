## Decisions

1. Forward the existing list title action to the shared row swipe handler. Reusing the existing title editor keeps focus, Save, Cancel and offline edits consistent with **Edit** in the row menu, which also gives users a way to edit without swiping.
2. Keep the established gesture thresholds. Releasing between 48 and 95 CSS pixels toward the start edits the title. At 96 pixels the action switches to Schedule. A distinct theme tint, icon and label fit inside the revealed edge without adding a permanent row control. The gesture mirrors in right-to-left layouts as before.
3. Keep the existing guards for editable rows and selection. Phone rows outside the list only get the edit action if their caller supplies it.

## Impact

No new data fields, settings, network calls or dependencies. Saving still uses the existing task title operation, with the same offline and sync behaviour. Both cues use existing translations, theme tokens and icons.
