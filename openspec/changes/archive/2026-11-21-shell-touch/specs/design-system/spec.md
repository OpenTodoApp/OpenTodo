# Spec Delta

## ADDED Requirements

### Requirement: Touch behaves like an app
On a touch screen (a coarse main pointer: the Android and iOS apps, the installed web app, a phone's or tablet's browser) the app SHALL behave as an app made for touch:

- **No browser tap highlight.** Tapping a control SHALL NOT paint the browser's highlight over it; the control's own pressed state is the only feedback, and every control has one: a control without a pressed colour of its own SHALL dim while a finger is on it.
- **Chrome is not text.** A long press SHALL NOT select text in, or lift the system callout from, the app's chrome: every button, tab, menu item, option, switch and disclosure, every navigation landmark (the tab bar, the sidebar's lists, breadcrumbs), the phone bar, the sidebar and a page's header.
- **Content stays text.** Everything else SHALL stay selectable and copyable: the title in the task view, notes, comments, descriptions, the links inside them, and every text field and editable area, including one inside chrome (a title being renamed in a header). The expanded row's notes and facts line stay selectable as before.
- **The page does not move.** The page itself SHALL NOT bounce, show the pull glow or trigger the browser's pull to reload. Scrolling inside lists, sheets, menus and the drawer SHALL be unchanged, the containment of sheets and the drawer SHALL still hold, and a scroller SHALL still receive every touch event when it is at its top or end.
- **Zoom stays.** The app SHALL NOT turn off pinch zoom or text scaling: no `user-scalable=no`, no `maximum-scale`, and no `touch-action` on the page that blocks pinch.

With a mouse or trackpad as the main pointer, selection, callouts and the browser's overscroll (such as a swipe back in history) SHALL stay as they were. This is presentation only: nothing is stored or synced, and it is the same offline. The layout check SHALL fail on any screen or overlay where the page does not end the overscroll chain, zoom is turned off, a visible control or navigation can be text-selected, or a visible field, editable area or comment cannot.

#### Scenario: Long press on a tab
- **WHEN** a person holds a finger on Upcoming in the tab bar on a phone
- **THEN** no word is selected, no callout or selection handles appear, and lifting the finger opens Upcoming

#### Scenario: Copying from a comment
- **WHEN** a person holds a finger on a word in a comment or in a task's notes on a phone
- **THEN** the word is selected with the system's handles and Copy, as in any text

#### Scenario: The task's title
- **WHEN** a task is open on a phone and the person holds a finger on its title
- **THEN** the title's text can be selected and copied

#### Scenario: Pulling the list past its top
- **WHEN** the Inbox is at its top on a phone and the person drags down
- **THEN** the app's bars stay where they are, no glow or bounce of the page shows, and the browser does not reload the app

#### Scenario: A sheet still scrolls by itself
- **WHEN** a long sheet is open on a phone and the person scrolls it to its end and keeps dragging
- **THEN** the sheet stops and the list behind it does not scroll

#### Scenario: Pinch zoom
- **WHEN** a person pinches out on any screen on a phone
- **THEN** the screen zooms in

#### Scenario: A mouse is unchanged
- **WHEN** the app is open at 1280 px with a mouse
- **THEN** a button's label and a page's title can be selected by dragging as before, and the browser's own overscroll gestures work

#### Scenario: A selectable control fails the check
- **WHEN** a button on a screen of the layout check's touch emulation can be text-selected
- **THEN** the check fails naming the screen and the button
