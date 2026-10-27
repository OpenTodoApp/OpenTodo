package poll

import (
	"sync/atomic"
	"testing"
	"time"
)

func TestEachBoundsConcurrency(t *testing.T) {
	items := make([]int, 20)
	for i := range items {
		items[i] = i
	}
	var running, peak, sum atomic.Int64
	Each(items, 3, func(n *int) {
		cur := running.Add(1)
		for {
			p := peak.Load()
			if cur <= p || peak.CompareAndSwap(p, cur) {
				break
			}
		}
		time.Sleep(time.Millisecond)
		sum.Add(int64(*n))
		running.Add(-1)
	})
	if peak.Load() > 3 || sum.Load() != 190 {
		t.Fatalf("peak %d, sum %d", peak.Load(), sum.Load())
	}
}
