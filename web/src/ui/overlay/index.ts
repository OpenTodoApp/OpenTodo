// The one overlay module (OpenSpec change `mobile-layout`). Every menu, popover,
// picker, dialog and toast goes through it; see CONTRIBUTING.md. It lives in the
// design system (OpenSpec change `web-layering`), so primitives such as the
// Combobox and ConfirmDialog use it without importing from src/app.
export { Dialog } from './Dialog'
export { playExit } from './exit'
export { Menu } from './Menu'
export { Popover } from './Popover'
export { ToastRegion, useToastClearance } from './Toasts'
export { place } from './position'
export { overlayDepth, trapTab, useOverlayDepth, useFinePointer, useWide, watchVisualViewport } from './stack'
export { isolate, useOverlay } from './useOverlay'
export { useBackToClose } from './useBackToClose'
