//go:build !race

package sync

// raceDetector: the tests run under the race detector (go test -race).
const raceDetector = false
