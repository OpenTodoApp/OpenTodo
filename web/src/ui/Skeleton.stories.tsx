import type { Meta, StoryObj } from '@storybook/react-vite'
import { Skeleton } from './Skeleton'

const meta: Meta = { title: 'UI/Skeleton' }
export default meta

/** Task rows while a list waits for local data. */
export const Rows: StoryObj = { render: () => <div className="max-w-xl"><Skeleton shape="row" count={5} label="Loading tasks" /></div> }

/** Lines of text, for a panel's notes or a comment thread. */
export const Lines: StoryObj = { render: () => <div className="max-w-md"><Skeleton shape="line" count={4} /></div> }

/** Cards, for a settings page. */
export const Cards: StoryObj = { render: () => <div className="max-w-md"><Skeleton shape="card" count={2} /></div> }
