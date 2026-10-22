import type { Meta, StoryObj } from '@storybook/react-vite'
import { Avatar } from './Avatar'

// Avatar with and without a profile picture (settings-refresh D10): the picture
// covers the initials in the same circle; a picture that fails shows the initials.
const meta: Meta = { title: 'UI/Avatar' }
export default meta

// A plain silhouette drawn in the image's default ink, so the story needs no network.
const PICTURE = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="24" r="12" opacity=".55"/><path d="M8 64c2-14 12-22 24-22s22 8 24 22z" opacity=".55"/></svg>')}`
const SIZES = ['xs', 'sm', 'md', 'lg'] as const

export const WithAndWithoutPicture: StoryObj = {
  render: () => (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">{SIZES.map((s) => <Avatar key={s} id="u-ada" name="Ada Lovelace" size={s} />)}</div>
      <div className="flex items-center gap-3">{SIZES.map((s) => <Avatar key={s} id="u-ada" name="Ada Lovelace" size={s} src={PICTURE} />)}</div>
      <div className="flex items-center gap-3">{SIZES.map((s) => <Avatar key={s} id="u-grace" name="Grace Hopper" size={s} src="/missing-picture.jpg" />)}</div>
    </div>
  ),
}
