package vault

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"time"
)

// Request is one `POST /api/v1/sync` exchange (docs/sync.md "Exchange").
type Request struct {
	Device      string   `json:"device"`
	Cursor      int64    `json:"cursor"`
	Ops         []Op     `json:"ops"`
	Features    []string `json:"features,omitempty"`
	BackfillAck int64    `json:"backfillAck,omitempty"`
}

// Reply is the server's answer.
type Reply struct {
	Ops         []Op         `json:"ops"`
	Cursor      int64        `json:"cursor"`
	HasMore     bool         `json:"hasMore"`
	ServerTime  int64        `json:"serverTime"`
	Generation  string       `json:"generation"`
	Rejected    []Rejection  `json:"rejected"`
	Memberships []Membership `json:"memberships"`
	Purged      []Purged     `json:"purged"`
	BackfillSeq int64        `json:"backfillSeq,omitempty"`
	Applied     int          `json:"applied"`
	Duplicates  int          `json:"duplicates"`
}

// Rejection is a refused op.
type Rejection struct {
	ID         string `json:"id"`
	Reason     string `json:"reason"`
	ServerTime int64  `json:"serverTime,omitempty"`
}

// Membership names a shared project the account belongs to.
type Membership struct {
	ProjectID string `json:"projectId"`
}

// Purged is an entity the server removed from the log.
type Purged struct {
	Entity   string `json:"entity"`
	EntityID string `json:"entityId"`
}

// Transport sends one exchange. The CLI implements it over HTTP with the
// profile's token; tests run it against an in-process server.
type Transport interface {
	Exchange(ctx context.Context, req Request) (Reply, error)
}

// features are the protocol additions the vault handles.
var features = []string{"clock_skew", "backfill_ack"}

// clock stamps the vault's ops: strictly increasing, following the server's
// clock (docs/sync.md "Clocks").
type clock struct {
	st  *State
	now func() time.Time
}

func (c clock) next() int64 {
	t := c.now().UnixMilli() + c.st.Offset
	if t <= c.st.Clock {
		t = c.st.Clock + 1
	}
	c.st.Clock = t
	return t
}

// observe adopts the server's clock after an exchange: an offset when the skew
// is over two seconds, and a stored clock more than five minutes ahead is
// brought back.
func (c clock) observe(serverTime int64) {
	if serverTime <= 0 {
		return
	}
	skew := serverTime - c.now().UnixMilli()
	if skew > 2000 || skew < -2000 {
		c.st.Offset = skew
	} else {
		c.st.Offset = 0
	}
	if c.st.Clock > serverTime+5*60*1000 {
		c.st.Clock = serverTime
	}
}

// opID derives an op's id from what it changes (design D6): a retried push
// after a crash carries the same ids, which the server counts as duplicates.
func opID(device, entity, id, field, base string, value []byte) string {
	h := sha256.New()
	fmt.Fprintf(h, "%s\x00%s\x00%s\x00%s\x00%s\x00", device, entity, id, field, base)
	h.Write(value)
	sum := h.Sum(nil)
	return "v-" + hex.EncodeToString(sum[:20])
}

// pull exchanges with an empty batch until the server has nothing more,
// folding every op into the app store.
func (e *engine) pull(ctx context.Context) error {
	for {
		rep, err := e.t.Exchange(ctx, Request{Device: e.st.Device, Cursor: e.st.Cursor, Ops: []Op{}, Features: features, BackfillAck: e.st.BackfillAck})
		if err != nil {
			return err
		}
		if e.generation(rep) {
			continue
		}
		e.absorb(rep)
		if !rep.HasMore {
			return nil
		}
	}
}

// generation compares the server's log generation (docs/sync.md "Log
// generation"): after a restore the vault pulls again from zero and re-sends
// every field it knows with the clock it had, as devices do. It reports
// whether the exchange must be repeated.
func (e *engine) generation(rep Reply) bool {
	if rep.Generation == "" || e.st.Generation == "" || rep.Generation == e.st.Generation {
		if e.st.Generation == "" {
			e.st.Generation = rep.Generation
		}
		return false
	}
	e.st.Generation = rep.Generation
	e.st.Cursor = 0
	e.st.BackfillAck = 0
	for entity, byID := range e.base {
		for id, row := range byID {
			for field, f := range row {
				e.reseed = append(e.reseed, Op{ID: opID(e.st.Device, entity, id, field, "reseed:"+rep.Generation, f.V), Entity: entity, EntityID: id, Field: field, Value: f.V, TS: f.TS, Device: f.D})
			}
		}
	}
	e.app = Store{}
	e.rep.warn("the server was restored from a backup; the vault is syncing again from the start")
	return true
}

// absorb folds a reply into the app store and the state.
func (e *engine) absorb(rep Reply) {
	for _, op := range rep.Ops {
		e.app.Apply(op)
	}
	for _, p := range rep.Purged {
		e.app.Purge(p.Entity, p.EntityID)
	}
	if rep.BackfillSeq > 0 {
		e.st.BackfillAck = rep.BackfillSeq
	} else {
		e.st.Cursor = rep.Cursor
	}
	shared := make([]string, 0, len(rep.Memberships))
	for _, m := range rep.Memberships {
		shared = append(shared, m.ProjectID)
	}
	e.st.Shared = shared
	e.clk.observe(rep.ServerTime)
}

// push sends ops in batches, re-stamping ops refused for clock skew and
// re-sending them with the same ids (docs/sync.md "Clocks"). Other refusals
// are reported; the server's value travels back in the reply.
func (e *engine) push(ctx context.Context, ops []Op) error {
	for len(ops) > 0 {
		n := len(ops)
		if n > 500 {
			n = 500
		}
		batch := ops[:n]
		ops = ops[n:]
		for attempt := 0; ; attempt++ {
			rep, err := e.t.Exchange(ctx, Request{Device: e.st.Device, Cursor: e.st.Cursor, Ops: batch, Features: features, BackfillAck: e.st.BackfillAck})
			if err != nil {
				return err
			}
			e.absorb(rep)
			var skewed []Op
			byID := map[string]Op{}
			for _, op := range batch {
				byID[op.ID] = op
			}
			for _, r := range rep.Rejected {
				op, ok := byID[r.ID]
				if !ok {
					continue
				}
				if r.Reason == "clock_skew" {
					skewed = append(skewed, op)
					continue
				}
				e.rep.warn("the server refused the %s of %s %s (%s)", op.Field, op.Entity, short(op.EntityID), r.Reason)
				e.refused[op.ID] = true
			}
			for rep.HasMore {
				if rep, err = e.t.Exchange(ctx, Request{Device: e.st.Device, Cursor: e.st.Cursor, Ops: []Op{}, Features: features, BackfillAck: e.st.BackfillAck}); err != nil {
					return err
				}
				e.absorb(rep)
			}
			if len(skewed) == 0 || attempt >= 3 {
				break
			}
			// Ops that shared a timestamp share the new one.
			stamps := map[int64]int64{}
			for i, op := range skewed {
				ts, ok := stamps[op.TS]
				if !ok {
					ts = e.clk.next()
					stamps[op.TS] = ts
				}
				skewed[i].TS = ts
				e.stamped[op.ID] = ts
			}
			batch = skewed
		}
	}
	return nil
}

func short(id string) string {
	if len(id) > 8 {
		return id[:8]
	}
	return id
}
