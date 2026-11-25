package pushrelay

import (
	"container/list"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"net/netip"
	"sync"
	"time"
)

// Rate limits (design D6): fixed windows aligned to the clock, counted in an
// LRU of at most LRUKeys keys, in memory only. Keys are HMACs under a salt
// that changes every UTC day, so the counters follow a device token or an
// address without holding either, and cannot be linked from one day to the
// next. A restart forgets everything.

// window is one counter to take: its key, the window length and the limit.
type window struct {
	key   string
	span  int64 // seconds
	limit int
	name  string // the counter line's name of a refusal
}

type counter struct {
	key   string
	start int64 // the window's start, Unix seconds
	n     int
}

type limiter struct {
	mu   sync.Mutex
	max  int
	ll   *list.List // front: most recently used
	m    map[string]*list.Element
	day  int64
	salt []byte
}

func newLimiter(max int) *limiter {
	return &limiter{max: max, ll: list.New(), m: map[string]*list.Element{}, day: -1}
}

// key is the salted, daily-rotated key of a value in a namespace. The caller
// holds mu.
func (l *limiter) keyLocked(now time.Time, ns string, value []byte) string {
	if d := now.Unix() / 86400; d != l.day {
		l.day, l.salt = d, make([]byte, 32)
		_, _ = rand.Read(l.salt)
		// Yesterday's keys can never match again: drop them.
		l.ll.Init()
		clear(l.m)
	}
	m := hmac.New(sha256.New, l.salt)
	m.Write([]byte(ns))
	m.Write([]byte{0})
	m.Write(value)
	return ns + ":" + string(m.Sum(nil)[:16])
}

// take counts one event in every window when all of them have room, and
// otherwise counts nothing and returns the refused window's name and the
// seconds until it ends.
func (l *limiter) take(now time.Time, ns string, value []byte, ws []window) (refused string, retryAfter int64) {
	l.mu.Lock()
	defer l.mu.Unlock()
	return l.takeLocked(now, l.keyLocked(now, ns, value), ws)
}

func (l *limiter) takeLocked(now time.Time, base string, ws []window) (refused string, retryAfter int64) {
	t := now.Unix()
	cs := make([]*counter, len(ws))
	for i, w := range ws {
		start := t - t%w.span
		c := l.getLocked(base + "/" + w.key)
		if c.start != start {
			c.start, c.n = start, 0
		}
		if c.n >= w.limit {
			return w.name, start + w.span - t
		}
		cs[i] = c
	}
	for _, c := range cs {
		c.n++
	}
	return "", 0
}

// takeNoEvict is take for counters that must never be evicted (a device's
// caps): when the windows' counters are new and the LRU has no room for
// them, nothing is counted and the refusal is "device.full" until the UTC
// day ends and the salt, with every key, changes. Fails closed: a phone then
// keeps its own schedule (design D10).
func (l *limiter) takeNoEvict(now time.Time, ns string, value []byte, ws []window) (refused string, retryAfter int64) {
	l.mu.Lock()
	defer l.mu.Unlock()
	base := l.keyLocked(now, ns, value)
	missing := 0
	for _, w := range ws {
		if _, ok := l.m[base+"/"+w.key]; !ok {
			missing++
		}
	}
	if l.ll.Len()+missing > l.max {
		t := now.Unix()
		return "device.full", 86400 - t%86400
	}
	return l.takeLocked(now, base, ws)
}

func (l *limiter) getLocked(key string) *counter {
	if e, ok := l.m[key]; ok {
		l.ll.MoveToFront(e)
		return e.Value.(*counter)
	}
	c := &counter{key: key, start: -1}
	l.m[key] = l.ll.PushFront(c)
	for l.ll.Len() > l.max {
		old := l.ll.Back()
		l.ll.Remove(old)
		delete(l.m, old.Value.(*counter).key)
	}
	return c
}

func (l *limiter) len() int {
	l.mu.Lock()
	defer l.mu.Unlock()
	return l.ll.Len()
}

// addressKey groups a source address: IPv4 as it is, IPv6 per /56.
func addressKey(addr string) []byte {
	a, err := netip.ParseAddr(addr)
	if err != nil {
		return []byte("unknown")
	}
	a = a.Unmap()
	if a.Is4() {
		b := a.As4()
		return b[:]
	}
	p, _ := a.Prefix(IPv6PrefixBits)
	b := p.Addr().As16()
	return b[:]
}

// The windows of each limit.
var (
	refreshWindows = []window{{key: "h", span: 3600, limit: RefreshPerDeviceHour, name: "device.refresh"}}
	dueWindows     = []window{
		{key: "h", span: 3600, limit: DuePerDeviceHour, name: "device.due.hour"},
		{key: "d", span: 86400, limit: DuePerDeviceDay, name: "device.due.day"},
	}
	wakeAddrWindows     = []window{{key: "h", span: 3600, limit: WakesPerAddressHour, name: "address.wake"}}
	registerAddrWindows = []window{{key: "h", span: 3600, limit: RegistersPerAddrHour, name: "address.register"}}
	instanceWindows     = []window{{key: "s", span: 1, limit: WakesPerSecond, name: "instance"}}
)
