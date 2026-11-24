# Design

## D1. One column grid for both kinds of row

A task row is `px-2`, a 16 px leading slot (the fold arrow), a gap and the 20 px checkbox. The sub-project row had no leading slot, so its mark sat in the leading slot's place and every task after it looked indented by one level. The sub-project row takes the same empty leading slot: marks and checkboxes share a column, names and titles share a column, and depth is again the only thing that indents. The row stays a project row (the mark, the name, the subtree's count, the row hover), like the sidebar's.

## D2. A bar only where nothing else ends the group

In a list, a group bar heads everything below it until the next bar. After "Sub-projects", the tasks of a project without sections had no bar of their own, so spacing alone could not end the group. They take a "Tasks" bar with their open count, through the shared `ListGroupHeader`. Like the Sub-projects bar it folds, per project and on this device, so the two bars look and behave alike (a bar without a chevron would start its label 18 px left of the one above). The list draws it by giving the headerless `all` group a heading and a per-project key (`tasks:<project id>`) at render time, so drag and drop, the cursor, the row limit and the sibling positions see the same groups and rows as before. When sections or a grouping are on, the tasks already start under a bar ("No section", a section, a group), so no Tasks bar is added. Apple Notes and Linear do the same: folders or sub-issues as one headed block, the page's own items after it.

## D3. Board and timeline

The board's columns are the project's sections and fill the width; a list of sub-projects above them would push every column down, so the board shows none (as before). The timeline keeps the Sub-projects group above its bars (as before); its bars are not task rows, so no Tasks bar is added.

## Data model

None. Both changes read local data; offline and sync behaviour are those of the projects and tasks they show.

## Interface budget

No chrome above the list's first item changes: the Sub-projects group and the Tasks bar are list content, and only a project with sub-projects shows the second bar. No task property, sidebar destination, scroll region or shortcut is added.
