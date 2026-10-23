# Proposal

## Why

The owner, looking at the pages after list-stays-still: "the project or inbox pages have an apparent limited width and then the header has options in the top right. I don't know how to solve this, but it's not a nice layout."

Two things cause it:

- **The header and the content have different widths on a project.** A project's header spans its 80 rem layout frame, while its list stops at 72 rem. At 1920 px the actions (List/Board/Timeline, Share, Filter, the overflow menu, Help) end 128 px to the right of the rows, floating over empty space.
- **Lists are narrow on a wide screen.** The Inbox, Today and the other list pages are 48 rem wide. At 1920 px, with the frame at the column's left edge since list-stays-still, more than half the window is empty to the right of a narrow column.

## What Changes

- **The header is as wide as the content under it.** The title starts at the content's left edge and the actions end at its right edge, on list pages, a project's list and settings pages. Boards, timelines and calendars keep the whole frame, and their header spans it.
- **Lists are 60 rem wide**, up from 48 rem: the Inbox, Today, Upcoming, labels, filters, Trash, Updates, Help and the other list pages. Settings and forms stay at 42 rem.
- **A project has one 72 rem frame in every layout.** Its list, board and timeline share it, so the header, with its List/Board/Timeline switch, keeps one width and nothing in it moves when the layout changes. A board or timeline wider than 72 rem scrolls sideways inside the frame. Calendars keep the 80 rem frame.
- **The cold-start placeholder** starts at the left edge, where the list will be, instead of being centred.
- **A new e2e check:** the header's actions end at the content's right edge on Inbox, Today and a project's list and board, at 1920 and 2560 px.

Out of scope:
- Saved views with a board or timeline keep the 80 rem layout frame.
- Phone layouts below 768 px, where the page fills the screen and the shell's bar carries the header.
- Row anatomy: how a row uses the wider list (the time column, the trailing counts) is unchanged.
