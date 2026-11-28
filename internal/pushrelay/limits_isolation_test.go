package pushrelay

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
	"time"
)

// TestDeviceCountersNeverEvicted: with the device LRU full, a new device is
// refused instead of evicting another device's counters, so a capped device
// stays capped; the next UTC day starts over.
func TestDeviceCountersNeverEvicted(t *testing.T) {
	l := newLimiter(10)
	now := time.Unix(1_800_000_000, 0)
	victim := []byte("victim-token")
	for range DuePerDeviceHour {
		if name, _ := l.takeNoEvict(now, "ddue", victim, dueWindows); name != "" {
			t.Fatalf("victim refused early: %s", name)
		}
	}
	// Valid handles of other tokens fill the LRU (two counters each).
	refused := 0
	for i := range 100 {
		if name, after := l.takeNoEvict(now, "ddue", []byte{byte(i)}, dueWindows); name == "device.full" {
			refused++
			if after < 1 || after > 86400 {
				t.Fatalf("Retry-After %d", after)
			}
		}
	}
	if refused == 0 || l.len() > 10 {
		t.Fatalf("refused %d, held %d", refused, l.len())
	}
	if name, _ := l.takeNoEvict(now, "ddue", victim, dueWindows); name != "device.due.hour" {
		t.Fatalf("the victim's cap after the flood: %q", name)
	}
	if name, _ := l.takeNoEvict(now.Add(24*time.Hour), "ddue", []byte("new"), dueWindows); name != "" {
		t.Fatalf("the next day: %q", name)
	}
}

type okSender struct{ n int }

func (s *okSender) Send(context.Context, Device, string) (Outcome, string) {
	s.n++
	return Delivered, ""
}

// TestAddressFloodKeepsDeviceCaps: garbage wakes from 200,000 distinct
// addresses fill the address counters but cannot evict a device's counters,
// so the per-device cap still holds afterwards (design D6, D13).
func TestAddressFloodKeepsDeviceCaps(t *testing.T) {
	now := time.Unix(1_800_000_000, 0)
	sender := &okSender{}
	ip := "198.51.100.1"
	r := New(Options{Keys: ring(t, testKey(1)), APNs: sender, Now: func() time.Time { return now }, ClientIP: func(*http.Request) string { return ip }})
	key, _ := NewWakeKey()
	reg := `{"token":"` + strings.Repeat("ab", 32) + `","environment":"production","wakeKey":"` + base64.RawURLEncoding.EncodeToString(key) + `"}`
	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest("POST", "/v1/register", strings.NewReader(reg)))
	var out struct{ Handle string }
	_ = json.Unmarshal(w.Body.Bytes(), &out)
	if out.Handle == "" {
		t.Fatalf("register: %d %s", w.Code, w.Body)
	}
	wake := func(body string) int {
		w := httptest.NewRecorder()
		r.ServeHTTP(w, httptest.NewRequest("POST", "/v1/wake", strings.NewReader(body)))
		return w.Code
	}
	ts := now.Unix()
	valid := `{"handle":"` + out.Handle + `","kind":"due","ts":` + strconv.FormatInt(ts, 10) + `,"sig":"` + Sign(key, KindDue, ts, out.Handle) + `"}`
	for i := range DuePerDeviceHour {
		if c := wake(valid); c != 202 {
			t.Fatalf("due %d: %d", i+1, c)
		}
	}
	if c := wake(valid); c != 429 {
		t.Fatalf("5th due: %d", c)
	}
	// 200,000 one-off addresses, each sending a garbage wake.
	before := r.devLim.len()
	for i := range LRUKeys {
		ip = "10." + strconv.Itoa(i>>16&255) + "." + strconv.Itoa(i>>8&255) + "." + strconv.Itoa(i&255)
		if i>>16 > 0 {
			ip = "11." + strconv.Itoa(i>>16&255) + "." + strconv.Itoa(i>>8&255) + "." + strconv.Itoa(i&255)
		}
		if c := wake(`{"handle":"h1.AAAA","kind":"due","ts":1,"sig":"x"}`); c != 401 {
			t.Fatalf("garbage wake %d: %d", i, c)
		}
	}
	if r.devLim.len() != before {
		t.Fatalf("garbage wakes created device counters: %d -> %d", before, r.devLim.len())
	}
	ip = "198.51.100.2"
	if c := wake(valid); c != 429 {
		t.Fatalf("after the address flood the device's 5th due = %d, want 429", c)
	}
	if sender.n != DuePerDeviceHour {
		t.Fatalf("%d pushes reached Apple", sender.n)
	}
}
