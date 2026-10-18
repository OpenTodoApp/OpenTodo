## ADDED Requirements

### Requirement: The design system stands alone

The shared building blocks in `web/src/ui`, overlays (dialogs, menus, popovers, toasts) included, SHALL NOT depend on any screen in `web/src/app`, so every primitive can be built, tested and shown in the workbench without the screens. Screens SHALL import shared UI, overlays included, through the `web/src/ui` barrel. The lint run of `make check` SHALL fail when a file under `web/src/ui` imports from `web/src/app`. This is a code-structure rule: it changes nothing a user sees, works the same offline, and has no effect on sync.

#### Scenario: A primitive imports a screen module

- **WHEN** a file under `web/src/ui` imports anything from `web/src/app`
- **THEN** the lint run fails and names the import

#### Scenario: Primitives use overlays from the design system

- **WHEN** the Combobox, ConfirmDialog, AskComposer or PageHeader opens a popover, dialog or menu
- **THEN** it uses the overlay module in `web/src/ui/overlay` and behaves as before on every screen size
