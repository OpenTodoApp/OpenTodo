// The app's navigation (native-app-everyday D1, task 1.1): the platform's tab bar with
// five destinations, each with its own native stack and a large title, the Inbox count
// on its tab, and the add button, which opens the capture sheet over whatever is open.
//
// The add button is where each platform puts it (D2): the tab bar's bottom accessory on
// iOS 26, a navigation-bar button before it, a floating button on Android.
import { createNativeBottomTabNavigator } from '@bottom-tabs/react-navigation'
import { DarkTheme, DefaultTheme, NavigationContainer, useNavigation, type NavigationProp } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { useMemo, useRef, type ComponentType } from 'react'
import { Platform, Pressable, StyleSheet, Text, useColorScheme, View } from 'react-native'
import { t } from '@shared/i18n'
import type { SignedIn } from '../auth/account'
import BrowseScreen from '../screens/BrowseScreen'
import CaptureSheet from '../screens/CaptureSheet'
import InboxScreen, { useInbox } from '../screens/InboxScreen'
import PlaceholderScreen from '../screens/PlaceholderScreen'
import ScheduleSheet from '../screens/ScheduleSheet'
import TodayScreen from '../screens/TodayScreen'
import UpcomingScreen from '../screens/UpcomingScreen'
import { useColors } from '../theme'
import { ActionToast, RowActionsProvider } from '../ui/RowActions'

type RootRoutes = { Tabs: undefined; Capture: { from?: string } | undefined; Schedule: { id: string } }
type TabName = 'Today' | 'Inbox' | 'Upcoming' | 'Browse' | 'Search'

const Root = createNativeStackNavigator<RootRoutes>()
const Tabs = createNativeBottomTabNavigator()
const Stack = createNativeStackNavigator()

/** iOS 26 has the tab bar's bottom accessory; earlier versions get a navigation-bar button. */
const ACCESSORY = Platform.OS === 'ios' && Number.parseInt(String(Platform.Version), 10) >= 26

const ICONS: Record<TabName, { sfSymbol: string; android: number }> = {
  Today: { sfSymbol: 'sun.max', android: require('../assets/tab-today.svg') },
  Inbox: { sfSymbol: 'tray', android: require('../assets/tab-inbox.svg') },
  Upcoming: { sfSymbol: 'calendar', android: require('../assets/tab-upcoming.svg') },
  Browse: { sfSymbol: 'folder', android: require('../assets/tab-browse.svg') },
  Search: { sfSymbol: 'magnifyingglass', android: require('../assets/tab-search.svg') },
}
const icon = (tab: TabName) => () => (Platform.OS === 'ios' ? { sfSymbol: ICONS[tab].sfSymbol as never } : ICONS[tab].android)

function useCapture(from?: TabName) {
  const navigation = useNavigation<NavigationProp<RootRoutes>>()
  return () => navigation.navigate('Capture', { from })
}

function AddButton({ from }: { from: TabName }) {
  const c = useColors()
  const open = useCapture(from)
  return (
    <Pressable accessibilityLabel={t('New task')} accessibilityRole="button" hitSlop={12} onPress={open} testID="add">
      <Text style={[styles.plus, { color: c.accent }]}>+</Text>
    </Pressable>
  )
}

/** Android's floating button, over the tab's content. */
function Fab({ from }: { from: TabName }) {
  const c = useColors()
  const open = useCapture(from)
  return (
    <Pressable accessibilityLabel={t('New task')} accessibilityRole="button" onPress={open} style={[styles.fab, { backgroundColor: c.accent }]} testID="add">
      <Text style={styles.fabPlus}>+</Text>
    </Pressable>
  )
}

/** A tab's own stack: its list under a large title, and what is pushed from it. */
function stackOf(name: TabName, title: () => string, Screen: ComponentType) {
  return function TabStack() {
    return (
      <View style={styles.fill}>
        <Stack.Navigator>
          <Stack.Screen
            component={Screen}
            name={`${name}Home`}
            options={{
              title: title(),
              headerLargeTitle: true,
              headerShadowVisible: false,
              headerRight: Platform.OS === 'ios' && !ACCESSORY && name !== 'Search' ? () => <AddButton from={name} /> : undefined,
            }}
          />
        </Stack.Navigator>
        {/* Beside Android's floating button, across the width elsewhere. */}
        <ActionToast right={Platform.OS === 'android' ? 88 : 16} />
        {Platform.OS === 'android' && name !== 'Search' && name !== 'Browse' && <Fab from={name} />}
      </View>
    )
  }
}

function TabsScreen({ signed, onSignOut }: Props) {
  const c = useColors()
  const inbox = useInbox()
  const open = useCapture()
  const stacks = useStacks(signed, onSignOut)
  return (
    <Tabs.Navigator
      renderBottomAccessoryView={ACCESSORY ? () => (
        <Pressable accessibilityLabel={t('New task')} accessibilityRole="button" onPress={open} style={styles.accessory} testID="add">
          <Text style={[styles.accessoryText, { color: c.accent }]}>+  {t('New task')}</Text>
        </Pressable>
      ) : undefined}
      labeled
      tabBarActiveTintColor={c.accent}
    >
      <Tabs.Screen component={stacks.Today} name="Today" options={{ title: t('Today'), tabBarIcon: icon('Today'), tabBarButtonTestID: 'tab-today' }} />
      <Tabs.Screen component={stacks.Inbox} name="Inbox" options={{ title: t('Inbox'), tabBarIcon: icon('Inbox'), tabBarBadge: inbox?.length ? String(inbox.length) : undefined, tabBarButtonTestID: 'tab-inbox' }} />
      <Tabs.Screen component={stacks.Upcoming} name="Upcoming" options={{ title: t('Upcoming'), tabBarIcon: icon('Upcoming'), tabBarButtonTestID: 'tab-upcoming' }} />
      <Tabs.Screen component={stacks.Browse} name="Browse" options={{ title: t('Browse'), tabBarIcon: icon('Browse'), tabBarButtonTestID: 'tab-browse' }} />
      <Tabs.Screen component={stacks.Search} name="Search" options={{ title: t('Search'), tabBarIcon: icon('Search'), role: 'search', tabBarButtonTestID: 'tab-search' }} />
    </Tabs.Navigator>
  )
}

/** The five stacks, made once per signed-in account: a new component each render would remount a tab. */
function useStacks(signed: SignedIn, onSignOut: () => void): Record<TabName, ComponentType> {
  const signOut = useRef(onSignOut)
  signOut.current = onSignOut
  return useMemo(() => ({
    Today: stackOf('Today', () => t('Today'), TodayScreen),
    Inbox: stackOf('Inbox', () => t('Inbox'), InboxScreen),
    Upcoming: stackOf('Upcoming', () => t('Upcoming'), UpcomingScreen),
    Browse: stackOf('Browse', () => t('Browse'), () => <BrowseScreen onSignOut={() => signOut.current()} signed={signed} />),
    Search: stackOf('Search', () => t('Search'), () => <PlaceholderScreen testID="search" />),
  }), [signed])
}

interface Props {
  signed: SignedIn
  onSignOut(): void
}

export default function RootNavigation(props: Props) {
  const dark = useColorScheme() === 'dark'
  const c = useColors()
  const base = dark ? DarkTheme : DefaultTheme
  const theme = { ...base, colors: { ...base.colors, primary: c.accent, background: c.bg, card: c.bg, text: c.text, border: c.field } }
  return (
    <RowActionsProvider>
    <NavigationContainer theme={theme}>
      <Root.Navigator>
        <Root.Screen name="Tabs" options={{ headerShown: false }}>{() => <TabsScreen {...props} />}</Root.Screen>
        <Root.Screen
          name="Capture"
          options={{ headerShown: false, presentation: 'formSheet', sheetAllowedDetents: [0.5, 1], sheetGrabberVisible: true, sheetCornerRadius: 16 }}
        >
          {({ route }) => <CaptureSheet from={route.params?.from} />}
        </Root.Screen>
        <Root.Screen
          name="Schedule"
          options={{ headerShown: false, presentation: 'formSheet', sheetAllowedDetents: [0.4], sheetGrabberVisible: true, sheetCornerRadius: 16 }}
        >
          {({ route }) => <ScheduleSheet id={route.params.id} />}
        </Root.Screen>
      </Root.Navigator>
    </NavigationContainer>
    </RowActionsProvider>
  )
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  plus: { fontSize: 30, fontWeight: '300', lineHeight: 32 },
  fab: { alignItems: 'center', borderRadius: 16, bottom: 16, elevation: 4, height: 56, justifyContent: 'center', position: 'absolute', right: 16, width: 56 },
  fabPlus: { color: '#ffffff', fontSize: 30, fontWeight: '300', lineHeight: 34 },
  accessory: { alignItems: 'center', flex: 1, justifyContent: 'center' },
  accessoryText: { fontSize: 17, fontWeight: '600' },
})
