package maps

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"
)

// DefaultCacheBytes is the tile cache cap (design D4).
const DefaultCacheBytes = 200 << 20

// Cache keeps upstream responses (tiles, fonts, sprites, the style) on disk
// under <data>/cache/maps, least recently used first out once the total passes
// the cap. Backups never include it: they archive the database and attachment
// files only.
type Cache struct {
	dir string
	max int64
	now func() time.Time

	mu    sync.Mutex
	total int64
	ready bool
}

// NewCache opens the cache folder (created on first write).
func NewCache(dir string, max int64) *Cache {
	if max <= 0 {
		max = DefaultCacheBytes
	}
	return &Cache{dir: dir, max: max, now: time.Now}
}

// entryMeta is stored next to each body.
type entryMeta struct {
	ContentType string `json:"content_type"`
	Expires     int64  `json:"expires"` // Unix ms
}

// Entry is a cached response.
type Entry struct {
	Body        []byte
	ContentType string
	Fresh       bool
}

func (c *Cache) key(url string) string {
	h := sha256.Sum256([]byte(url))
	k := hex.EncodeToString(h[:])
	return filepath.Join(c.dir, k[:2], k)
}

// Get returns the cached response for url, fresh or stale, or ok=false.
func (c *Cache) Get(url string) (Entry, bool) {
	p := c.key(url)
	body, err := os.ReadFile(p + ".bin")
	if err != nil {
		return Entry{}, false
	}
	var m entryMeta
	raw, err := os.ReadFile(p + ".meta")
	if err != nil || json.Unmarshal(raw, &m) != nil {
		return Entry{}, false
	}
	now := c.now()
	_ = os.Chtimes(p+".bin", now, now) // recently used
	return Entry{Body: body, ContentType: m.ContentType, Fresh: now.UnixMilli() < m.Expires}, true
}

// Put stores a response that stays fresh for ttl, then trims the cache to its cap.
func (c *Cache) Put(url, contentType string, body []byte, ttl time.Duration) error {
	if int64(len(body)) > c.max {
		return nil
	}
	p := c.key(url)
	if err := os.MkdirAll(filepath.Dir(p), 0o750); err != nil {
		return err
	}
	meta, _ := json.Marshal(entryMeta{ContentType: contentType, Expires: c.now().Add(ttl).UnixMilli()})
	old := int64(0)
	if st, err := os.Stat(p + ".bin"); err == nil {
		old = st.Size()
	}
	if err := writeAtomic(p+".bin", body); err != nil {
		return err
	}
	if err := writeAtomic(p+".meta", meta); err != nil {
		return err
	}
	now := c.now()
	_ = os.Chtimes(p+".bin", now, now) // the eviction order is last use
	c.mu.Lock()
	defer c.mu.Unlock()
	if !c.ready {
		c.total = c.scanLocked()
		c.ready = true
	} else {
		c.total += int64(len(body)) - old
	}
	if c.total > c.max {
		c.evictLocked()
	}
	return nil
}

func writeAtomic(path string, data []byte) error {
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, data, 0o640); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}

type cached struct {
	path string
	size int64
	used time.Time
}

func (c *Cache) list() []cached {
	var out []cached
	_ = filepath.WalkDir(c.dir, func(path string, d fs.DirEntry, err error) error {
		if err != nil || d.IsDir() || !strings.HasSuffix(path, ".bin") {
			return nil
		}
		if info, err := d.Info(); err == nil {
			out = append(out, cached{strings.TrimSuffix(path, ".bin"), info.Size(), info.ModTime()})
		}
		return nil
	})
	return out
}

func (c *Cache) scanLocked() int64 {
	var n int64
	for _, e := range c.list() {
		n += e.size
	}
	return n
}

// evictLocked removes the least recently used entries until the cache is at
// most 90 % of its cap, so a busy map does not evict on every tile.
func (c *Cache) evictLocked() {
	entries := c.list()
	sort.Slice(entries, func(i, j int) bool { return entries[i].used.Before(entries[j].used) })
	var total int64
	for _, e := range entries {
		total += e.size
	}
	target := c.max * 9 / 10
	for _, e := range entries {
		if total <= target {
			break
		}
		if err := os.Remove(e.path + ".bin"); err != nil && !errors.Is(err, fs.ErrNotExist) {
			continue
		}
		_ = os.Remove(e.path + ".meta")
		total -= e.size
	}
	c.total = total
}

// Size is the cached bytes (bodies only).
func (c *Cache) Size() int64 {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.scanLocked()
}
