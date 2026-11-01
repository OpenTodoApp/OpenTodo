package sync

import (
	gosync "sync"
	"testing"
)

// The quota ledger (issue #676): holds add up per account, a release gives its
// size back once, and a conditional hold checks and holds under one lock.
func TestQuotaHolds(t *testing.T) {
	var q QuotaHolds
	held, release := q.Hold("u", 10)
	if held != 10 {
		t.Fatalf("held %d", held)
	}
	if held, _ := q.Hold("v", 5); held != 5 {
		t.Fatalf("other account: %d", held)
	}
	release()
	release()
	if got := q.Held("u"); got != 0 {
		t.Fatalf("after a double release: %d", got)
	}
	// Ten racing conditional holds of 10 into room for 30: exactly three fit.
	var wg gosync.WaitGroup
	var mu gosync.Mutex
	fitted := 0
	for range 10 {
		wg.Go(func() {
			if q.holdIf("u", 10, func(held int64) bool { return held+10 <= 30 }) {
				mu.Lock()
				fitted++
				mu.Unlock()
			}
		})
	}
	wg.Wait()
	if fitted != 3 || q.Held("u") != 30 {
		t.Fatalf("fitted %d, held %d", fitted, q.Held("u"))
	}
}
