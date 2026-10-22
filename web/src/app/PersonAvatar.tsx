// An account's Avatar with its profile picture when this device knows one
// (OpenSpec change settings-refresh, design D10): every place that draws a
// person's initials uses it, so a picture shows everywhere at once.
import { useAvatarSrc } from '../lib/avatars'
import { Avatar, type AvatarProps } from '../ui'

export function PersonAvatar(props: Omit<AvatarProps, 'src'>) {
  return <Avatar {...props} src={useAvatarSrc(props.id)} />
}
