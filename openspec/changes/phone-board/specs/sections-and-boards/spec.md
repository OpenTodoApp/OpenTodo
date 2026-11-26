## ADDED Requirements

### Requirement: A held card scrolls the board
While a card's drag is lifted and the pointer rests within 32 px of the left or right edge of the board, the board SHALL scroll towards that edge while it can. Where the columns snap (below 768 px) it SHALL move to the neighbouring column after the pointer has rested there for 300 ms, and one column further every 700 ms while the pointer stays; a release before that SHALL drop on the column under the pointer without scrolling. Where the columns do not snap it SHALL scroll steadily, faster nearer the edge. While the pointer rests near the top or bottom of a column's cards, that column SHALL scroll its cards the same way the list does. The placeholder SHALL follow the column under the pointer as the board moves, and the column change SHALL NOT be animated when the person asked for reduced motion. This applies to touch, mouse and pen, and only to the board and its columns: no other sideways region scrolls during a drag. Scrolling writes nothing. The drop is the move of "Move tasks between sections": it applies locally at once, works offline, and converges so two devices moving the same task resolve to the newer move; a release outside any column and a cancelled drag write nothing.

#### Scenario: A column off screen on a phone
- **WHEN** a person on a 390 px screen holds a card of the first column, moves it to the right edge and keeps the finger there
- **THEN** the board moves to the second column and then to the third, the placeholder shows in the column under the finger, and releasing over the third column puts the card last in it

#### Scenario: A quick drop on the next column's edge
- **WHEN** a person on a 390 px screen drags a card onto the visible edge of the next column and releases within 300 ms
- **THEN** the card lands in that column and the board has not moved

#### Scenario: The last column
- **WHEN** a held card rests at the right edge while the board shows its last column
- **THEN** the board stays where it is

#### Scenario: A wide board on a desktop
- **WHEN** a person with a mouse drags a card to the right edge of a board with more columns than fit
- **THEN** the board scrolls steadily to the right while the pointer rests there and stops when the pointer leaves the edge

#### Scenario: A long column
- **WHEN** a held card rests near the bottom of a column with more cards than fit
- **THEN** that column's cards scroll up under the card; the page and the other columns stay in place

#### Scenario: Dropped offline after the board scrolled
- **WHEN** a person who is offline drags a card from "Backlog" to the right edge until "Done" is in view and drops it there
- **THEN** the card is last in "Done" at once, and after the device syncs every device shows it there

### Requirement: A board opens at its first column
Below 640 px a board SHALL show its first column when it opens, also when that column arrives after the others. Once the person has pressed, scrolled or chosen a pager dot on the board, it SHALL keep its position when its columns change. This changes no data, so offline behaviour and convergence are unaffected.

#### Scenario: The first column arrives late
- **WHEN** a board on a 390 px screen first shows "Planning" and "Doing", and "No section" then appears in front of them
- **THEN** the board shows "No section", and the first pager dot is current

#### Scenario: After the person moved the board
- **WHEN** a person has swiped to "Doing" and a column then appears in front of the others
- **THEN** the board is not moved back to its start
