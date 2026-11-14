# Proposal

## Why

On a phone the bar above a page holds the menu button, the title and up to four more controls: two actions, the page's "…" menu and Help. At 360 px the title loses: a project reads "Home renova…", the Inbox's lead line "3 to …" (GitHub issue [#1340](https://github.com/OpenTodoApp/OpenTodo/issues/1340), found by the interface audit). Help is the control used least and it sits in every bar.

## What Changes

- **Help moves into the page's menu on a phone.** Below 768 px, on a page whose bar has a "…" menu (the overflow menu or the page's own menu: Inbox, a project, Today, Upcoming, Notes, the calendar, a view), Help is the last item of that menu, after a separator, and the bar shows no Help button. The title gets the 48 px.
- **A page without a menu keeps the button.** Settings, Help and other pages whose bar holds only the menu button, the title and Help keep Help in the bar: the title has room there, and Help stays one tap away.
- **Same Help.** The item is named "Help", opens the same section of the guide for the screen, is reached with the arrow keys like every menu item, and focus returns to the menu's button when the guide closes.
- **Nothing changes from 768 px**: the header keeps its Help button at the right.

Out of scope: moving any other control out of the bar (a long project name is still cut at 360 px beside Filter and Display options; see the design's open question), the titles of task rows (`phone-row-titles`), touch and gesture work (`shell-touch`, `sheet-drag-dismiss`, `pull-to-sync`), and Help in the account menu, the drawer and the command palette, which stay as they are.

Advances the ROADMAP item "Shells that feel native" (the phone reads like an app, not a squeezed desktop page).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `app-shell`: a new requirement for where Help sits in the phone bar.

## Impact

- `web/src/ui/Menu.tsx`, `web/src/ui/overlay/Menu.tsx`: a menu can be given items to draw at its end by what surrounds it.
- `web/src/ui/patterns/PageHeader.tsx` (`PageActions`), `web/src/app/Shell.tsx` (`PhoneBar`): the phone bar hands Help to the menu.
- No data, op, route or setting changes. No new string: "Help" exists in every language. No dependency.
- The phone-width UI screenshots of every page with a menu change (one control fewer in the bar, one item more in the menu).
