// The app's root (OpenSpec change native-app-foundation, task 4.4): the account kept
// on this phone if there is one, otherwise the server screen and sign-in. A grant that
// ends on the server (revoked in the sessions list, signed out everywhere) brings the
// app back to the server screen with nothing of the account left. Signed in, the app
// syncs and shows its tabs (native-app-everyday).
import { useEffect, useMemo, useState } from 'react'
import { View } from 'react-native'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { bootLanguage } from '@shared/i18n'
import { platform } from '@shared/platform'
import { restore, sendSignOuts, signOut, type SignedIn } from './auth/account'
import { accountDeps, signInDeps } from './auth/native'
import RootNavigation from './navigation/Root'
import ServerScreen from './screens/ServerScreen'
import { startAccountSync } from './sync'
import { useColors } from './theme'

export default function App() {
  const c = useColors()
  // undefined until the Keychain answered; null without an account.
  const [signed, setSigned] = useState<SignedIn | null | undefined>(undefined)
  const deps = useMemo(() => accountDeps(() => setSigned(null)), [])

  useEffect(() => {
    // The device's language first, so the first screen is drawn in it.
    void bootLanguage().then(() => restore(deps)).then(setSigned, () => setSigned(null))
    // A sign-out made offline reaches its server at the next start or reconnection.
    const send = () => { void sendSignOuts(deps).catch(() => undefined) }
    send()
    return platform.network.onOnline(send)
  }, [deps])

  // Sync runs while an account is signed in; sign-out and an ended grant stop it (src/auth/native.ts).
  const session = signed?.session
  useEffect(() => { if (session) startAccountSync(session) }, [session])

  if (signed === undefined) return <View style={{ flex: 1, backgroundColor: c.bg }} />
  if (!signed) return <ServerScreen account={deps} onSignedIn={setSigned} sheet={signInDeps} />
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <RootNavigation onSignOut={() => { void signOut(signed, deps).finally(() => setSigned(null)) }} signed={signed} />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}
