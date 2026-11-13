// The app's root (OpenSpec change native-app-foundation, task 4.4): the account kept
// on this phone if there is one, otherwise the server screen and sign-in. A grant that
// ends on the server (revoked in the sessions list, signed out everywhere) brings the
// app back to the server screen with nothing of the account left.
import { useEffect, useMemo, useState } from 'react'
import { View } from 'react-native'
import { platform } from '@shared/platform'
import { restore, sendSignOuts, signOut, type SignedIn } from './auth/account'
import { accountDeps, signInDeps } from './auth/native'
import AccountScreen from './screens/AccountScreen'
import ServerScreen from './screens/ServerScreen'
import { useColors } from './theme'

export default function App() {
  const c = useColors()
  // undefined until the Keychain answered; null without an account.
  const [signed, setSigned] = useState<SignedIn | null | undefined>(undefined)
  const deps = useMemo(() => accountDeps(() => setSigned(null)), [])

  useEffect(() => {
    void restore(deps).then(setSigned, () => setSigned(null))
    // A sign-out made offline reaches its server at the next start or reconnection.
    const send = () => { void sendSignOuts(deps).catch(() => undefined) }
    send()
    return platform.network.onOnline(send)
  }, [deps])

  if (signed === undefined) return <View style={{ flex: 1, backgroundColor: c.bg }} />
  if (!signed) return <ServerScreen account={deps} onSignedIn={setSigned} sheet={signInDeps} />
  return <AccountScreen onSignOut={() => signOut(signed, deps).finally(() => setSigned(null))} signed={signed} />
}
