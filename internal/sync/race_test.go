//go:build race

package sync

// raceDetector: the tests run under the race detector (go test -race), which
// makes them many times slower, so wall-clock bounds do not apply.
const raceDetector = true
