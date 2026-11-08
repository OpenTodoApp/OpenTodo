// Whether a row is drawn inside a block of a long list (rowBlocks): the block's lists are
// presentational, so the row names its own role (incremental-list-updates D5).
import { createContext } from 'react'

export const RowBlockContext = createContext(false)
