// Package perf holds the server half of the nightly time benchmark of the
// performance budgets (OpenSpec change performance-10k, design D3). Its tests
// only build with the perf tag:
//
//	make perf            # or
//	go test -tags perf -count=1 -timeout 30m ./internal/perf/...
//
// They start the built server (bin/opentodo) on copies of the perfseed
// fixture, measure every server budget of scripts/perf/budgets.json five
// times and fail when a median exceeds its budget. Nothing here is linked into
// the server.
package perf
