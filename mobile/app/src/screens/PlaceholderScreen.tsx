// A tab whose screen is still to come (Search: task 5.2): the system's
// background under its title, nothing else.
import { ScrollView } from 'react-native'
import { useColors } from '../theme'

export default function PlaceholderScreen({ testID }: { testID: string }) {
  const c = useColors()
  return <ScrollView contentInsetAdjustmentBehavior="automatic" style={{ backgroundColor: c.bg }} testID={testID} />
}
