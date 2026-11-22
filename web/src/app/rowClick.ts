export type RowClickIntent = 'select' | 'edit'

/**
 * The browser's double-click interval is not exposed; 500 ms is the longest common
 * default (Windows). A double-click whose first click opened the inline editor is
 * still a double-click on the row (row-click-modes D2).
 */
export const DOUBLE_CLICK_MS = 500
