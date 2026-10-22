// Lazily loaded part of voice capture (OpenSpec `voice-capture`, D7): the recognition
// session, the dictation state machine and the spoken-token tables. The app imports
// this with `import()` only once voice capture is switched on, so the main bundle
// carries none of it.
export { createDictation } from './dictation'
export { startServerRecognition } from './serverRecognition'
export { normalizeSpoken } from './spoken'
