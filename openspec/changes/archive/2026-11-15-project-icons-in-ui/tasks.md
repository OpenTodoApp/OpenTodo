## 1. Project marks

- [x] 1.1 Carry icon metadata through project pickers and render it with `ProjectMark`. Verify selected values, picker rows, dot fallback and special choices in the picker tests.
- [x] 1.2 Use `ProjectMark` for the existing marks in Archived Projects, Notes, Review, Loop, the Activity Feed, Trash and Quick Add. Verify the affected screens with the web tests and local demo.
- [x] 1.3 Use the configured project icon in List and Board project group headers. Verify that projects without an available icon and the Inbox show no marker.

## 2. Verify

- [x] 2.1 Update the guides and regenerate the docs. Run `make openspec-validate` and `make check`.
- [x] 2.2 Run `make web` and `make bundle-budget` on main and the change under the existing limits. Record the impact and verify the local demo in List and Board.
