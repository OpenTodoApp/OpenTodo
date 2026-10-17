package sync

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"math/rand/v2"
	"os"
	"slices"
	"strconv"
	"strings"
	"testing"
	"time"
)

// Property test of OpenSpec change test-integrity: devices with skewed clocks
// edit the same fields in random order, exchange at random moments with random
// page sizes, and a project is shared mid-way. Once every device has exchanged
// its outbox, every replica holds the same values as the server, and the
// server's materialized state equals a last-writer-wins replay of its op log.
//
// OPENTODO_PROPERTY_SEED=<n> replays one run; the seed of every run is logged.

// propCell is one field of a replica, with its clock.
type propCell struct {
	value string
	ts    int64
	dev   string
}

// propDevice mirrors the web client's protocol: the clock of web/src/lib/hlc.ts
// (offset towards server time, restart from server time after a clock_skew
// refusal), last-writer-wins for local and pulled ops (applyOps), the restamp
// of refused ops (restampSkewed in clockSkew.ts) and confirmed backfill pages.
type propDevice struct {
	id, user string
	skew     int64 // how far its system clock runs ahead of the server's
	offset   int64
	last     int64
	cells    map[string]propCell // entity/id/field
	outbox   []Op
	cursor   int64
	ack      int64
	seq      int
}

func propKey(entity, id, field string) string { return entity + "/" + id + "/" + field }

func propSplit(k string) (entity, id, field string) {
	p := strings.SplitN(k, "/", 3)
	return p[0], p[1], p[2]
}

func (d *propDevice) hlcNow(now int64) int64 {
	d.last = max(now+d.skew+d.offset, d.last+1)
	return d.last
}

func (d *propDevice) observeServerTime(now, serverTime int64) {
	skew := serverTime - (now + d.skew)
	d.offset = 0
	if skew > 2000 || skew < -2000 {
		d.offset = skew
	}
	if d.last > serverTime+MaxFutureSkewMs {
		d.last = serverTime
	}
}

func (d *propDevice) apply(o Op) {
	k := propKey(o.Entity, o.EntityID, o.Field)
	c, ok := d.cells[k]
	if !ok || Wins(o.TS, o.Device, c.ts, c.dev) {
		d.cells[k] = propCell{value: string(o.Value), ts: o.TS, dev: o.Device}
	}
}

// edit writes fields of one entity as one change: the ops share a timestamp.
func (d *propDevice) edit(now int64, entity, id string, fields map[string]string) {
	ts := d.hlcNow(now)
	names := make([]string, 0, len(fields))
	for f := range fields {
		names = append(names, f)
	}
	slices.Sort(names)
	for _, f := range names {
		d.seq++
		o := Op{ID: fmt.Sprintf("%s-%d", d.id, d.seq), Entity: entity, EntityID: id, Field: f, Value: json.RawMessage(fields[f]), TS: ts, Device: d.id}
		d.apply(o)
		d.outbox = append(d.outbox, o)
	}
}

// knows lists the entities of one kind in the replica.
func (d *propDevice) knows(entity string) []string {
	var out []string
	for k := range d.cells {
		e, id, f := propSplit(k)
		if e == entity && f == "title" && !slices.Contains(out, id) {
			out = append(out, id)
		}
	}
	slices.Sort(out)
	return out
}

type propWorld struct {
	t       *testing.T
	rng     *rand.Rand
	s       *Service
	ctx     context.Context
	now     int64
	devices []*propDevice
	shared  bool
}

// exchange sends the outbox (shuffled, in up to two requests), handles the
// clock refusals like the client and pulls every page with a random size.
func (w *propWorld) exchange(d *propDevice) {
	w.t.Helper()
	sent := d.outbox
	d.outbox = nil
	w.rng.Shuffle(len(sent), func(i, j int) { sent[i], sent[j] = sent[j], sent[i] })
	cut := 0
	if len(sent) > 1 {
		cut = w.rng.IntN(len(sent))
	}
	for _, batch := range [][]Op{sent[:cut], sent[cut:]} {
		if len(batch) == 0 {
			continue
		}
		res, err := w.s.Apply(w.ctx, d.user, batch)
		if err != nil {
			w.t.Fatal(err)
		}
		var refused []Op
		var serverTime int64
		for _, r := range res.Rejected {
			if r.Reason != ReasonClockSkew {
				w.t.Fatalf("%s: unexpected rejection %+v", d.id, r)
			}
			serverTime = r.ServerTime
			for _, o := range batch {
				if o.ID == r.ID {
					refused = append(refused, o)
				}
			}
		}
		if len(refused) == 0 {
			continue
		}
		// hlcClockRefused, then restampSkewed: one new timestamp per old one.
		d.observeServerTime(w.now, serverTime)
		d.last = min(d.last, serverTime)
		slices.SortStableFunc(refused, func(a, b Op) int { return int(a.TS - b.TS) })
		fresh := map[int64]int64{}
		for _, o := range refused {
			ts, ok := fresh[o.TS]
			if !ok {
				ts = d.hlcNow(w.now)
				fresh[o.TS] = ts
			}
			k := propKey(o.Entity, o.EntityID, o.Field)
			if c := d.cells[k]; c.ts == o.TS && c.dev == o.Device {
				c.ts = ts
				d.cells[k] = c
			}
			o.TS = ts
			d.outbox = append(d.outbox, o)
		}
	}
	for range 1000 {
		r, err := w.s.PullWith(w.ctx, d.user, d.cursor, d.id, 1+w.rng.IntN(6), PullOptions{ConfirmBackfill: true, BackfillAck: d.ack})
		if err != nil {
			w.t.Fatal(err)
		}
		for _, o := range r.Ops {
			d.apply(o)
		}
		d.cursor, d.ack = r.Cursor, r.BackfillSeq
		if !r.More {
			d.observeServerTime(w.now, w.now)
			return
		}
	}
	w.t.Fatalf("%s: pull never finished", d.id)
}

func (w *propWorld) step(i int) {
	d := w.devices[w.rng.IntN(len(w.devices))]
	switch r := w.rng.IntN(10); {
	case r < 5:
		var ids []string
		for _, id := range d.knows("task") {
			if d.user == "alice" || id[0] == 'b' || w.shared {
				ids = append(ids, id)
			}
		}
		if len(ids) == 0 {
			return
		}
		id := ids[w.rng.IntN(len(ids))]
		fields := map[string]string{}
		if w.rng.IntN(2) == 0 {
			fields["title"] = strconv.Quote(fmt.Sprintf("%s step %d", d.id, i))
		}
		if len(fields) == 0 || w.rng.IntN(2) == 0 {
			fields["priority"] = strconv.Itoa(1 + w.rng.IntN(4))
		}
		d.edit(w.now, "task", id, fields)
	case r < 9:
		w.exchange(d)
	default:
		w.now += w.rng.Int64N(180_000)
	}
}

func runConvergence(t *testing.T, seed uint64) {
	t.Helper()
	s := newTestService(t)
	w := &propWorld{t: t, rng: rand.New(rand.NewPCG(seed, seed^0x9e3779b97f4a7c15)), s: s, ctx: WithClockSkewRefusal(context.Background()), now: 1_800_000_000_000}
	s.now = func() time.Time { return time.UnixMilli(w.now) }
	for _, u := range []string{"alice", "bob"} {
		if _, err := s.db.Exec(`INSERT INTO users(id,email,name,password_hash,created_at) VALUES(?,?,?,'h',1)`, u, u+"@example.com", u); err != nil {
			t.Fatal(err)
		}
	}
	for _, id := range []string{"A1", "A2", "B1", "B2"} {
		user := "alice"
		if id[0] == 'B' {
			user = "bob"
		}
		// From ten minutes slow to two hours fast; some within the tolerance.
		skew := []int64{0, 1500, -600_000, 240_000, 3_600_000, 7_200_000}[w.rng.IntN(6)]
		w.devices = append(w.devices, &propDevice{id: id, user: user, skew: skew, cells: map[string]propCell{}})
	}
	a1, b1 := w.devices[0], w.devices[2]
	a1.edit(w.now, "project", "p", map[string]string{"name": `"Home"`})
	for i := range 3 {
		a1.edit(w.now, "task", fmt.Sprintf("t%d", i), map[string]string{"title": `"shared"`, "project_id": `"p"`})
		b1.edit(w.now, "task", fmt.Sprintf("b%d", i), map[string]string{"title": `"bob's"`})
	}
	const steps = 240
	for i := range steps {
		if i == steps/2 {
			if _, err := s.AddMember(w.ctx, "alice", "p", "bob", RoleEditor); err != nil {
				t.Fatal(err)
			}
			w.shared = true
		}
		w.step(i)
	}
	// Quiesce: every device exchanges until no outbox is left, then once more
	// so the last uploads reach everyone.
	for round := 0; ; round++ {
		if round > 10 {
			t.Fatal("outboxes never drained")
		}
		w.now += 1000
		pending := false
		for _, d := range w.devices {
			w.exchange(d)
			pending = pending || len(d.outbox) > 0
		}
		if !pending {
			break
		}
	}
	for _, d := range w.devices {
		w.exchange(d)
	}

	// Replay of the server's op log, last writer wins.
	replay := map[string]propCell{}
	rows, err := s.db.Query(`SELECT entity, entity_id, field, value, ts, device FROM ops`)
	if err != nil {
		t.Fatal(err)
	}
	for rows.Next() {
		var e, id, f, v, dev string
		var ts int64
		if err := rows.Scan(&e, &id, &f, &v, &ts, &dev); err != nil {
			t.Fatal(err)
		}
		k := propKey(e, id, f)
		if c, ok := replay[k]; !ok || Wins(ts, dev, c.ts, c.dev) {
			replay[k] = propCell{value: v, ts: ts, dev: dev}
		}
	}
	rows.Close()

	for _, d := range w.devices {
		for k, c := range d.cells {
			entity, id, field := propSplit(k)
			e, err := s.Get(context.Background(), d.user, entity, id)
			if err != nil || e == nil {
				t.Fatalf("seed %d: %s holds %s, the server has none for %s (%v)", seed, d.id, k, d.user, err)
			}
			if got := compactJSON(t, e[field]); got != compactJSON(t, []byte(c.value)) {
				t.Fatalf("seed %d: %s has %s = %s, the server %s", seed, d.id, k, c.value, got)
			}
			if r := replay[k]; compactJSON(t, []byte(r.value)) != compactJSON(t, []byte(c.value)) || r.ts != c.ts || r.dev != c.dev {
				t.Fatalf("seed %d: %s has %s = %s @%d/%s, the replay %s @%d/%s", seed, d.id, k, c.value, c.ts, c.dev, r.value, r.ts, r.dev)
			}
		}
	}
	// Every device of a user holds the same entities, and bob, once a member,
	// holds every field of the shared project.
	for _, d := range w.devices {
		want := len(replay)
		if d.user == "alice" {
			want = 0
			for k := range replay {
				if e, id, _ := propSplit(k); e == "project" || id[0] == 't' {
					want++
				}
			}
		}
		if len(d.cells) != want {
			t.Fatalf("seed %d: %s holds %d fields, want %d", seed, d.id, len(d.cells), want)
		}
	}
}

func compactJSON(t *testing.T, raw []byte) string {
	t.Helper()
	var b bytes.Buffer
	if err := json.Compact(&b, raw); err != nil {
		t.Fatalf("not JSON: %s", raw)
	}
	return b.String()
}

func TestConvergenceProperty(t *testing.T) {
	t.Parallel()
	if v := os.Getenv("OPENTODO_PROPERTY_SEED"); v != "" {
		seed, err := strconv.ParseUint(v, 10, 64)
		if err != nil {
			t.Fatal(err)
		}
		t.Logf("seed %d", seed)
		runConvergence(t, seed)
		return
	}
	base := uint64(time.Now().UnixNano())
	runs := 6
	if testing.Short() {
		runs = 2
	}
	for i := range runs {
		seed := base + uint64(i)
		t.Logf("seed %d (replay with OPENTODO_PROPERTY_SEED=%d)", seed, seed)
		runConvergence(t, seed)
	}
}
