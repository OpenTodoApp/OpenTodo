//go:build race

package calfeed

// raceEnabled is true under `go test -race` (the nightly CI job), which slows
// CPU-bound code several times over; timing assertions allow for it.
const raceEnabled = true
