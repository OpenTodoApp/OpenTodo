## ADDED Requirements

### Requirement: The graph of all notes
The Notes page's Graph mode SHALL fill the page's content area beside the sidebar, without a dialog, with every note the Notes list shows (standalone notes, project notes and task notes of the current workspace) as a node and one line for every linked pair of shown items, whichever direction the link goes. Tasks and projects that a shown note links to and that have no note SHALL be drawn as smaller, hollow secondary nodes, shown by default and hidden with "Tasks and projects without notes" in the page's menu. Notes with no link SHALL be hidden by default and shown with "Notes without links" in the page's menu, placed around the linked picture. Only items the device can read SHALL be drawn. Each node SHALL be coloured by its project's colour and shaped by its kind (a standalone note, a task note, a project note), so colour is never the only signal. Hiding or showing nodes SHALL move no other node.

#### Scenario: Notes and their links
- **WHEN** the note "Trip" links to the note "Packing list" and to the task "Book ferry", which has no note, and the user opens Notes in Graph mode
- **THEN** "Trip" and "Packing list" are nodes joined by a line, and "Book ferry" is a secondary node joined to "Trip"

#### Scenario: Hide secondary nodes
- **WHEN** the user turns off "Tasks and projects without notes"
- **THEN** "Book ferry" and its line are not drawn, and "Trip" and "Packing list" stay where they were

#### Scenario: No access
- **WHEN** a note links to another member's personal note the device does not hold
- **THEN** no node and no line is drawn for it

### Requirement: Navigating the graph
The graph SHALL pan by dragging, by two-finger scroll and by one finger on a touch screen; SHALL zoom with the mouse wheel, a pinch and the + and − controls and keys, around the pointer or the fingers; and SHALL offer Fit, which shows every visible node. Hovering or focusing a node SHALL light it, its neighbours and the lines between them, show its full title and dim the rest. Clicking a node SHALL open it while the graph stays on screen: a standalone note or a task in the side pane from 1024 px, a project with its note; Escape SHALL close the side pane. A double click or Space SHALL centre a node: the view moves to it and the items within the chosen depth (1, 2 or 3 links, 2 by default) stay lit while the rest dims; Backspace SHALL return to the previous centre and clearing the centre SHALL light everything again. In Graph mode the page's search field SHALL find notes with the list's search: the matches stay lit, and Enter or Down SHALL move the view to the next match and focus it, Shift+Enter or Up to the previous one. Moving the view SHALL use the app's motion and SHALL be immediate when the user prefers reduced motion.

#### Scenario: Open beside the graph
- **WHEN** the user on a 1440 px screen clicks the node "Packing list"
- **THEN** the note opens in the side pane and the graph stays visible beside it, and Escape closes the pane

#### Scenario: Centre with a depth
- **WHEN** the user double-clicks "Trip" with depth 1
- **THEN** the view moves to "Trip", "Trip" and the items linked with it stay lit, and the rest is dimmed

#### Scenario: Back to the previous centre
- **WHEN** the user has centred "Trip", then "Packing list", and presses Backspace
- **THEN** "Trip" is the centre again

#### Scenario: Find a note
- **WHEN** the user types `ferry` in the search field in Graph mode and presses Enter
- **THEN** the notes matching `ferry` stay lit, the view moves to the first of them and it is focused

#### Scenario: Reduced motion
- **WHEN** reduced motion is on and the user presses Enter in the search field
- **THEN** the view jumps to the match without animation

### Requirement: Topics in the graph
In Graph mode the chips of the page's search field (`in:`, `label:`, `kind:` and the others of `notes-space`) SHALL set the graph's topic: every note the list would leave out under those chips SHALL be dimmed, not hidden or moved, a secondary node SHALL be lit when a note of the topic links with it, and the view SHALL fit the topic's nodes when the chips change. A task note SHALL match by its task's project and labels, a project note by its project and a standalone note by its own project and labels, as in the list. The chips SHALL be the ones the list uses, kept on the device.

#### Scenario: A project as the topic
- **WHEN** the user in Graph mode adds the chip `in:Holidays`
- **THEN** the notes in "Holidays" (task notes of its tasks, its project note and standalone notes in it) stay lit, every other node is dimmed in its place, and the view fits the lit nodes

#### Scenario: A label as the topic
- **WHEN** the user adds the chip `label:reading`
- **THEN** the standalone notes and task notes with the label stay lit in their projects' colours and the rest is dimmed

### Requirement: A graph that stays put
The graph's layout SHALL be deterministic: the same notes and links SHALL give the same picture on any device starting without stored positions. The positions SHALL be kept on the device and reused on the next visit. When the device holds positions for most of the nodes, a new node SHALL be placed near the nodes it links with while every other node keeps its place, and a removed node SHALL disappear without moving the others. Nothing SHALL move at rest.

#### Scenario: Same picture
- **WHEN** the user opens the graph twice with no change in between
- **THEN** every node is in the same place both times

#### Scenario: A new note changes the picture locally
- **WHEN** the user writes a new note linking to "Trip" and returns to the graph
- **THEN** the new note is drawn near "Trip" and no other node has moved

### Requirement: The graph at scale
The graph SHALL draw on a canvas without an element per node, SHALL show labels by level of detail (always for the hovered, focused, centred and found nodes and their neighbours), SHALL lay out in short slices so the page keeps responding, and SHALL stay within the `notes-graph` and `notes-graph-frame` performance budgets on the notes fixture. At 2,000 notes and 5,000 links it SHALL lay out in a bounded number of steps, draw a bounded number of labels per frame and stay usable.

#### Scenario: Notes fixture
- **WHEN** the nightly benchmark opens `/notes?view=graph` on the notes fixture and zooms with the wheel
- **THEN** the first paint and the 95th percentile of a zoom frame are within their budgets

#### Scenario: Large graph
- **WHEN** a workspace has 2,000 notes and 5,000 links
- **THEN** the layout finishes in its fixed number of steps and at most 150 labels are drawn in a frame

### Requirement: The graph from the keyboard and screen readers
The graph SHALL be a focusable region named "Graph of notes" with a description of its keys. With focus in it, the arrow keys SHALL move to the linked node in that direction, else to the nearest node in that direction; the focused node SHALL be announced with its title, its kind and its number of links; Enter SHALL open it; Space SHALL centre it; Backspace SHALL return to the previous centre; + and − SHALL zoom; 0 SHALL fit; Escape SHALL close the side pane, else clear the centre; `/` SHALL go to the search field. The List mode SHALL be the equivalent of the graph. Every control SHALL have an accessible name and every string SHALL be translated in the app's languages.

#### Scenario: Walk by keyboard
- **WHEN** a screen reader user tabs into the graph, presses Right and then Enter
- **THEN** a node is announced as for example "Trip, note, 3 links", and Enter opens it

### Requirement: The graph on a phone
Below 768 px the graph SHALL fill the space between the page's header row and the tab bar; one finger SHALL pan, two SHALL pinch to zoom; a first tap on a node SHALL light it and its neighbours and show its title, and a second tap SHALL open it as its page, from which Back returns to the graph as it was. The controls SHALL be Fit and the depth control.

#### Scenario: Tap twice
- **WHEN** the user on a 390 px phone taps "Packing list" once and then again
- **THEN** the first tap lights it and its neighbours, the second opens the note as its page, and Back shows the graph as it was

### Requirement: The graph drawn on the device
The graph SHALL be built from the device's local data and link index only, SHALL work offline and on an unlocked encrypted account, and SHALL make no request. A change arriving by sync while the graph is shown (a note, a link, a title, a project) SHALL update it in place without moving the view. Its code SHALL be loaded when Graph mode is first shown and SHALL not be part of the app's first load. Nothing about the graph SHALL be synced: its preferences and positions are kept on the device.

#### Scenario: Offline and encrypted
- **WHEN** an encrypted account is unlocked on an offline device and the user opens the graph
- **THEN** the graph is drawn and no request is made

#### Scenario: A note arrives by sync
- **WHEN** another device adds a note linking to "Trip" while this device shows the graph, and this device syncs
- **THEN** the note appears near "Trip" and the view does not move

#### Scenario: First load
- **WHEN** the web app is built
- **THEN** the graph's code is not in the first load measured against the bundle budget

### Requirement: Open in graph
The Connections dialog SHALL offer Open in graph when its centre is a node of the graph; choosing it SHALL close the dialog and open the Notes page in Graph mode centred on that item.

#### Scenario: From Connections
- **WHEN** the user opens the connections of "Trip" and chooses Open in graph
- **THEN** the dialog closes and the graph opens centred on "Trip"
