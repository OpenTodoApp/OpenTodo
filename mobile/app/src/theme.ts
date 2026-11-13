// The colours of the first screens, light and dark with the system. The design tokens
// shared with the web app arrive with the UI stack (native-app-everyday).
import { useColorScheme } from 'react-native'

const palette = {
  light: { bg: '#ffffff', text: '#1c1c1e', muted: '#6e6e73', field: '#f2f2f7', accent: '#0a66d8', error: '#c4281c', done: '#2f8f4e' },
  dark: { bg: '#000000', text: '#f5f5f7', muted: '#98989d', field: '#1c1c1e', accent: '#4c9bff', error: '#ff6b5e', done: '#3fae63' },
}

export type Colors = (typeof palette)['light']

export function useColors(): Colors {
  return palette[useColorScheme() === 'dark' ? 'dark' : 'light']
}
