// Development only. The shared library has two modules that import each other
// (recurring.ts and occurrences.ts), which Metro reports as a warning; the warning's
// banner sits over the tab bar and takes the first tap there. Imported first by
// src/setup.ts, so the warning is known before the modules load.
import { LogBox } from 'react-native'

LogBox.ignoreLogs(['Require cycle:'])
