// Jest's stand-ins for the native gesture library: its own mocks (the gesture
// components as plain views), and the swipeable row as a plain view around its row,
// so no test loads the animation runtime. What a swipe does is reached through the
// row's accessibility actions, which call the same handlers.
require('react-native-gesture-handler/jestSetup')

jest.mock('react-native-gesture-handler/ReanimatedSwipeable', () => {
  const React = require('react')
  const { View } = require('react-native')
  const Swipeable = React.forwardRef(({ children, testID }, ref) => {
    React.useImperativeHandle(ref, () => ({ close() {}, openLeft() {}, openRight() {}, reset() {} }))
    return React.createElement(View, { testID }, children)
  })
  return { __esModule: true, default: Swipeable }
})
