package poll

import (
	"context"
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

func TestEveryRunsFirstPassAtOnce(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	var n atomic.Int32
	Every(ctx, time.Hour, func(context.Context) {
		n.Add(1)
		cancel()
	})
	if n.Load() != 1 {
		t.Fatalf("passes = %d", n.Load())
	}
}
