//go:build !race

package calfeed

// raceEnabled is true under `go test -race`; see race_on_test.go.
const raceEnabled = false
