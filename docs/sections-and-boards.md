---
title: Sections and boards
summary: Split a project into stages with sections, and switch it to a board to move cards between columns by drag or keyboard.
audience: user
section: Guides
specs: [sections-and-boards]
screens: []
order: 30
card: board
---
# Sections and boards

Sections divide a project into parts, like "Planning", "In progress" and "Waiting", or "Kitchen", "Bathroom" and "Garden". The same project can be shown as a list with headings, as a board with one column per section, or as a timeline of its dates.

## Add a section

Open a project and select **+ Add section** at the bottom of the list. Type a name and press <kbd>Enter</kbd>. You can add the next one straight away.

<picture><source srcset="images/project-list-dark.webp" media="(prefers-color-scheme: dark)"><img src="images/project-list-light.webp" alt="A project in list layout with the section headings Planning and In progress, each with a task count and a plus button."></picture>

Each heading shows how many open tasks it holds. Tasks without a section are listed first under **No section**.

## Add tasks to a section

Select the **+** on a section heading and type: the task goes straight into that section. You can also open any task and choose a **Section** in its panel.

## Rename, reorder or delete a section

Use the **⋯** menu on a section heading (or press <kbd>.</kbd> with the heading focused):

- **Rename** (<kbd>F2</kbd>)
- **Move** it up or down (left or right on the board). At the first or last place the option is unavailable and says why.
- **Delete section…** asks first and says how many open tasks move to **No section**. The tasks aren't deleted.

Fold a section with the small arrow next to its name. Folding is remembered on that device only.

## Switch to a board

At the top of the project, choose **Board** (or press <kbd>v</kbd>). Each section becomes a column, with **No section** first. <kbd>v</kbd> cycles through **List**, **Board** and **Timeline**; you can also choose one directly.

<picture><source srcset="images/board-dark.webp" media="(prefers-color-scheme: dark)"><img src="images/board-light.webp" alt="The Q4 launch project as a board with the columns No section, Backlog, This week and Review."></picture>

The choice is remembered for each project on each device. Your laptop can show "Q4 launch" as a board while your phone shows it as a list. On a narrow screen the board scrolls sideways.

## Move cards between columns

- **Drag** a card to another column, or to a place within a column. On a touch screen, press and hold the card first.
- **Keyboard:** select a card and press <kbd>Shift</kbd>+<kbd>→</kbd> or <kbd>Shift</kbd>+<kbd>←</kbd>. The card stays selected, so you can keep moving it.
- **Panel:** open the task and pick another **Section**.

Moving with the keyboard or the panel puts the card at the bottom of the new column.

## See a project on a timeline

Choose **Timeline** at the top of the project (or press <kbd>v</kbd> until it shows). Each open task is a row, in list order under its sections and with subtasks indented. Its bar runs from its start to its due date or deadline, whichever is later; a task with a single date gets a one-day bar. A thin mark shows the due day inside a longer bar, a flag shows the deadline, and a deadline that has passed turns the bar red. Tasks with no dates, or parked in Someday, wait under **Unscheduled** at the end.

- **Drag a bar** to move all its dates by the same number of days. The due time stays the same.
- **Drag the left or right end** to set the start or the deadline. If the task has none yet, one is created.
- **Drag an unscheduled task** from its name onto a day to give it that due date.
- **Keyboard:** select a task with <kbd>j</kbd> and <kbd>k</kbd>, then <kbd>←</kbd> and <kbd>→</kbd> move its dates a day. <kbd>Shift</kbd>+<kbd>←</kbd> and <kbd>Shift</kbd>+<kbd>→</kbd> move its deadline, starting from the due date when it has none. <kbd>Enter</kbd> opens it.
- **Days** and **Weeks** change the scale. <kbd>[</kbd> and <kbd>]</kbd> move the visible range, and <kbd>t</kbd> comes back to today.

When one task [waits for another](tasks-and-projects.md#wait-for-another-task) in the same project, an arrow joins them and the waiting task is dimmed until the other is done. Moving a task never moves the tasks that wait for it. Viewers of a shared project see the timeline but can't change dates. On a phone the task names stay in place while the dates scroll sideways, and you press and hold a bar to drag it.

## Get around the board with the keyboard

| Key | Does |
| --- | --- |
| <kbd>h</kbd> / <kbd>l</kbd> or <kbd>←</kbd> / <kbd>→</kbd> | Jump to the previous or next column |
| <kbd>j</kbd> / <kbd>k</kbd> | Move up and down within a column |
| <kbd>Shift</kbd>+<kbd>←</kbd> / <kbd>Shift</kbd>+<kbd>→</kbd> | Move the selected card to the previous or next column |
| <kbd>a</kbd> | Add a task to the selected card's column |
| <kbd>Enter</kbd> | Open the card |

## Good to know

- Moving a task to another project removes it from its section, because sections belong to one project.
- If someone deletes a section while you were moving a task into it on another device, the task ends up under **No section**. Nothing is lost.
- Sections are part of the export and come back when you import it.

## Ideas for sections

- A simple flow: **To do**, **Doing**, **Done**.
- By place: **Kitchen**, **Bathroom**, **Garden** for a renovation.
- By week: **This week**, **Next week**, **Later** for a launch plan.
