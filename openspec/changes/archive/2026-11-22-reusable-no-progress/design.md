# Design

## D1: One rule for "shows progress"

`showsProgress(project)` is false for an area and for a reusable list. The project page (`ProjectHeader`) and the All projects table (`summarizeProjects`) both read it, so they keep showing the same figure, as statistics "Project health" requires. The mode is the synced `reusable` field, so every member's devices agree, offline too, and the figure changes as soon as the mode does. Nothing is stored.

## D2: Still counted in a parent

A folded parent includes its sub-projects' tasks, a reusable list's among them, exactly as it does an area's. Leaving them out there would make a parent's figure depend on its children's modes, a second rule for one number.

## Data model

None.

## Interface budget

Removes an element from the title line of reusable lists; adds nothing.
