// Development only. A warning's banner sits over the tab bar and takes the taps there,
// so the two that every run produces are silenced: the shared library's two modules that
// import each other (recurring.ts and occurrences.ts), and Expo's tools not reaching the
// development server from an emulator. Imported first by src/setup.ts, so they are known
// before the modules load.
import { LogBox } from 'react-native'

LogBox.ignoreLogs(['Require cycle:', 'Cannot connect to Expo CLI'])
