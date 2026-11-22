# Design

## D1: One heading

`CompletedGroup` drops its reusable-list branch, so the list model no longer passes whether the list is reusable. Whether the group is shown at all still comes from `useListModel` (always in a reusable list), so only the words change. The heading is a translated message that already exists in every language.

## Data model

None.

## Interface budget

None: the same row with different words.
