// Package calsynctest is an in-process CalDAV server for VEVENT calendars,
// for calendar sync tests (OpenSpec change calendar-two-way): well-known
// discovery, a principal, a calendar home, PROPFIND, calendar-query,
// calendar-multiget, sync-collection (unless turned off), and conditional PUT,
// GET and DELETE. It is never linked into the server.
package calsynctest

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"sync"

	"github.com/OpenTodoApp/opentodo/internal/caldav"
)

// Object is one stored calendar object.
type Object struct {
	Data string
	ETag string
}

// Calendar is one collection.
type Calendar struct {
	Name     string
	Color    string
	Comps    []string // VEVENT by default
	ReadOnly bool
	TimeZone string // IANA, sent as calendar-timezone
	objects  map[string]*Object
	// log records changes for sync-collection: seq → member, deleted.
	log []change
}

type change struct {
	seq     int
	member  string
	deleted bool
}

// Server is the fake account.
type Server struct {
	*httptest.Server
	// User and Password are the Basic credentials; Bearer, when set, is the
	// accepted bearer token instead.
	User, Password, Bearer string
	// NoSyncToken turns sync-collection and sync tokens off.
	NoSyncToken bool
	// NoETagOnPut answers PUT without an ETag header.
	NoETagOnPut bool
	// Prefix is where the account lives ("/dav" by default).
	Prefix string

	mu        sync.Mutex
	cals      map[string]*Calendar
	seq       int
	Requests  map[string]int
	etagCount int
}

// New starts a server with one calendar "work" holding events.
func New() *Server {
	s := &Server{User: "me", Password: "app-pass", Prefix: "/dav", cals: map[string]*Calendar{}, Requests: map[string]int{}}
	s.Server = httptest.NewServer(http.HandlerFunc(s.serve))
	s.AddCalendar("work", &Calendar{Name: "Work", Color: "#3366CCFF"})
	return s
}

// AddCalendar adds a collection under the home.
func (s *Server) AddCalendar(id string, c *Calendar) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if len(c.Comps) == 0 {
		c.Comps = []string{"VEVENT"}
	}
	c.objects = map[string]*Object{}
	s.cals[id] = c
}

// RemoveCalendar deletes a collection.
func (s *Server) RemoveCalendar(id string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.cals, id)
}

// Home is the calendar home's address; CalendarURL a calendar's.
func (s *Server) Home() string { return s.URL + s.Prefix + "/calendars/me/" }

// CalendarURL is a calendar's address.
func (s *Server) CalendarURL(id string) string { return s.Home() + id + "/" }

func (s *Server) nextETag(data string) string {
	s.etagCount++
	sum := sha256.Sum256([]byte(data))
	return `"` + hex.EncodeToString(sum[:4]) + "-" + strconv.Itoa(s.etagCount) + `"`
}

func (s *Server) record(c *Calendar, member string, deleted bool) {
	s.seq++
	c.log = append(c.log, change{seq: s.seq, member: member, deleted: deleted})
}

// Put stores an object as the user's calendar app would (a change made in
// the calendar), returning its ETag.
func (s *Server) Put(cal, member, data string) string {
	s.mu.Lock()
	defer s.mu.Unlock()
	c := s.cals[cal]
	o := &Object{Data: data, ETag: s.nextETag(data)}
	c.objects[member] = o
	s.record(c, member, false)
	return o.ETag
}

// Delete removes an object as the user's calendar app would.
func (s *Server) Delete(cal, member string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	c := s.cals[cal]
	delete(c.objects, member)
	s.record(c, member, true)
}

// Get returns a stored object ("" when missing).
func (s *Server) Get(cal, member string) string {
	s.mu.Lock()
	defer s.mu.Unlock()
	if o := s.cals[cal].objects[member]; o != nil {
		return o.Data
	}
	return ""
}

// Members lists a calendar's object names.
func (s *Server) Members(cal string) []string {
	s.mu.Lock()
	defer s.mu.Unlock()
	var out []string
	for m := range s.cals[cal].objects {
		out = append(out, m)
	}
	sort.Strings(out)
	return out
}

// Count returns how many requests of a method were served.
func (s *Server) Count(method string) int {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.Requests[method]
}

func (s *Server) authorized(r *http.Request) bool {
	if s.Bearer != "" {
		return r.Header.Get("Authorization") == "Bearer "+s.Bearer
	}
	u, p, ok := r.BasicAuth()
	return ok && u == s.User && p == s.Password
}

func (s *Server) serve(w http.ResponseWriter, r *http.Request) {
	s.mu.Lock()
	s.Requests[r.Method]++
	s.mu.Unlock()
	if r.URL.Path == "/.well-known/caldav" {
		http.Redirect(w, r, s.Prefix+"/", http.StatusMovedPermanently)
		return
	}
	if !s.authorized(r) {
		w.Header().Set("WWW-Authenticate", `Basic realm="fake"`)
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	body, _ := io.ReadAll(r.Body)
	s.mu.Lock()
	defer s.mu.Unlock()
	path := strings.TrimPrefix(r.URL.Path, s.Prefix)
	switch {
	case path == "/" || path == "":
		s.root(w, r)
	case path == "/principals/me/":
		s.principal(w, r)
	case path == "/calendars/me/":
		s.home(w, r)
	default:
		rest := strings.TrimPrefix(path, "/calendars/me/")
		cal, member, _ := strings.Cut(rest, "/")
		c := s.cals[cal]
		if c == nil || rest == path {
			http.NotFound(w, r)
			return
		}
		if member == "" {
			s.collection(w, r, cal, c, body)
			return
		}
		m, _ := url.PathUnescape(member)
		s.object(w, r, c, cal, m, body)
	}
}

func multistatus(w http.ResponseWriter, inner string) {
	w.Header().Set("Content-Type", "application/xml; charset=utf-8")
	w.WriteHeader(http.StatusMultiStatus)
	fmt.Fprintf(w, `<?xml version="1.0" encoding="utf-8"?><d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:cs="http://calendarserver.org/ns/" xmlns:ic="http://apple.com/ns/ical/">%s</d:multistatus>`, inner)
}

func response(href, props string) string {
	return `<d:response><d:href>` + caldav.Esc(href) + `</d:href><d:propstat><d:prop>` + props + `</d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>`
}

func (s *Server) root(w http.ResponseWriter, r *http.Request) {
	if r.Method != "PROPFIND" {
		http.Error(w, "no", http.StatusMethodNotAllowed)
		return
	}
	multistatus(w, response(s.Prefix+"/", `<d:current-user-principal><d:href>`+s.Prefix+`/principals/me/</d:href></d:current-user-principal>`))
}

func (s *Server) principal(w http.ResponseWriter, r *http.Request) {
	multistatus(w, response(s.Prefix+"/principals/me/", `<c:calendar-home-set><d:href>`+s.Prefix+`/calendars/me/</d:href></c:calendar-home-set>`+
		`<d:current-user-principal><d:href>`+s.Prefix+`/principals/me/</d:href></d:current-user-principal>`))
}

func (s *Server) calProps(id string, c *Calendar) string {
	comps := ""
	for _, n := range c.Comps {
		comps += `<c:comp name="` + n + `"/>`
	}
	priv := `<d:privilege><d:read/></d:privilege>`
	if !c.ReadOnly {
		priv += `<d:privilege><d:write/></d:privilege>`
	}
	p := `<d:resourcetype><d:collection/><c:calendar/></d:resourcetype><d:displayname>` + caldav.Esc(c.Name) + `</d:displayname>` +
		`<c:supported-calendar-component-set>` + comps + `</c:supported-calendar-component-set><d:current-user-privilege-set>` + priv + `</d:current-user-privilege-set>` +
		`<ic:calendar-color>` + c.Color + `</ic:calendar-color><cs:getctag>` + s.ctag(c) + `</cs:getctag>`
	if c.TimeZone != "" {
		p += `<c:calendar-timezone>BEGIN:VCALENDAR&#13;
BEGIN:VTIMEZONE&#13;
TZID:` + c.TimeZone + `&#13;
END:VTIMEZONE&#13;
END:VCALENDAR</c:calendar-timezone>`
	}
	if !s.NoSyncToken {
		p += `<d:sync-token>` + s.token(c) + `</d:sync-token>`
	}
	return p
}

func (s *Server) ctag(c *Calendar) string {
	if len(c.log) == 0 {
		return "ctag-0"
	}
	return "ctag-" + strconv.Itoa(c.log[len(c.log)-1].seq)
}

func (s *Server) token(c *Calendar) string {
	n := 0
	if len(c.log) > 0 {
		n = c.log[len(c.log)-1].seq
	}
	return "http://fake.example/sync/" + strconv.Itoa(n)
}

func (s *Server) home(w http.ResponseWriter, r *http.Request) {
	inner := response(s.Prefix+"/calendars/me/", `<d:resourcetype><d:collection/></d:resourcetype>`)
	if r.Header.Get("Depth") == "1" {
		ids := make([]string, 0, len(s.cals))
		for id := range s.cals {
			ids = append(ids, id)
		}
		sort.Strings(ids)
		for _, id := range ids {
			inner += response(s.Prefix+"/calendars/me/"+id+"/", s.calProps(id, s.cals[id]))
		}
	}
	multistatus(w, inner)
}

func (s *Server) collection(w http.ResponseWriter, r *http.Request, id string, c *Calendar, body []byte) {
	base := s.Prefix + "/calendars/me/" + id + "/"
	switch r.Method {
	case "PROPFIND":
		inner := response(base, s.calProps(id, c))
		if r.Header.Get("Depth") == "1" {
			for _, m := range sortedMembers(c) {
				inner += response(base+url.PathEscape(m), `<d:getetag>`+caldav.Esc(c.objects[m].ETag)+`</d:getetag><d:resourcetype/>`)
			}
		}
		multistatus(w, inner)
	case "REPORT":
		s.report(w, base, c, body)
	default:
		http.Error(w, "no", http.StatusMethodNotAllowed)
	}
}

func sortedMembers(c *Calendar) []string {
	out := make([]string, 0, len(c.objects))
	for m := range c.objects {
		out = append(out, m)
	}
	sort.Strings(out)
	return out
}

func objectProps(o *Object) string {
	return `<d:getetag>` + caldav.Esc(o.ETag) + `</d:getetag><c:calendar-data>` + caldav.Esc(o.Data) + `</c:calendar-data>`
}

func (s *Server) report(w http.ResponseWriter, base string, c *Calendar, body []byte) {
	root, err := caldav.ParseXML(bytes.NewReader(body))
	if err != nil || root == nil {
		http.Error(w, "bad xml", http.StatusBadRequest)
		return
	}
	inner := ""
	switch {
	case root.Is(caldav.NSCalDAV, "calendar-query"):
		for _, m := range sortedMembers(c) {
			inner += response(base+url.PathEscape(m), objectProps(c.objects[m]))
		}
	case root.Is(caldav.NSCalDAV, "calendar-multiget"):
		for _, h := range root.Children {
			if !h.Is(caldav.NSDAV, "href") {
				continue
			}
			p, _ := url.PathUnescape(strings.TrimSpace(h.Text))
			m := strings.TrimPrefix(p, base)
			if o := c.objects[m]; o != nil {
				inner += response(base+url.PathEscape(m), objectProps(o))
			} else {
				inner += `<d:response><d:href>` + caldav.Esc(strings.TrimSpace(h.Text)) + `</d:href><d:status>HTTP/1.1 404 Not Found</d:status></d:response>`
			}
		}
	case root.Is(caldav.NSDAV, "sync-collection") && !s.NoSyncToken:
		s.syncReport(w, base, c, strings.TrimSpace(nodeText(root.Child(caldav.NSDAV, "sync-token"))))
		return
	default:
		http.Error(w, "unsupported report", http.StatusForbidden)
		return
	}
	multistatus(w, inner)
}

func nodeText(n *caldav.Node) string {
	if n == nil {
		return ""
	}
	return n.Text
}

func (s *Server) syncReport(w http.ResponseWriter, base string, c *Calendar, token string) {
	since := -1 // no token: every member
	if token != "" {
		n, err := strconv.Atoi(strings.TrimPrefix(token, "http://fake.example/sync/"))
		if err != nil || !strings.HasPrefix(token, "http://fake.example/sync/") {
			w.Header().Set("Content-Type", "application/xml")
			w.WriteHeader(http.StatusForbidden)
			fmt.Fprint(w, `<?xml version="1.0"?><d:error xmlns:d="DAV:"><d:valid-sync-token/></d:error>`)
			return
		}
		since = n
	}
	inner := ""
	if since < 0 {
		for _, m := range sortedMembers(c) {
			inner += response(base+url.PathEscape(m), `<d:getetag>`+caldav.Esc(c.objects[m].ETag)+`</d:getetag>`)
		}
	} else {
		last := map[string]bool{}
		var order []string
		for _, ch := range c.log {
			if ch.seq <= since {
				continue
			}
			if _, ok := last[ch.member]; !ok {
				order = append(order, ch.member)
			}
			last[ch.member] = ch.deleted
		}
		for _, m := range order {
			if o := c.objects[m]; o != nil {
				inner += response(base+url.PathEscape(m), `<d:getetag>`+caldav.Esc(o.ETag)+`</d:getetag>`)
			} else {
				inner += `<d:response><d:href>` + caldav.Esc(base+url.PathEscape(m)) + `</d:href><d:status>HTTP/1.1 404 Not Found</d:status></d:response>`
			}
		}
	}
	multistatus(w, inner+`<d:sync-token>`+s.token(c)+`</d:sync-token>`)
}

func (s *Server) object(w http.ResponseWriter, r *http.Request, c *Calendar, id, member string, body []byte) {
	o := c.objects[member]
	switch r.Method {
	case http.MethodGet:
		if o == nil {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("ETag", o.ETag)
		w.Header().Set("Content-Type", "text/calendar")
		_, _ = io.WriteString(w, o.Data)
	case http.MethodPut:
		if c.ReadOnly {
			http.Error(w, "read-only", http.StatusForbidden)
			return
		}
		if !precondition(w, r, o) {
			return
		}
		n := &Object{Data: string(body), ETag: s.nextETag(string(body))}
		c.objects[member] = n
		s.record(c, member, false)
		if !s.NoETagOnPut {
			w.Header().Set("ETag", n.ETag)
		}
		if o == nil {
			w.WriteHeader(http.StatusCreated)
		} else {
			w.WriteHeader(http.StatusNoContent)
		}
	case http.MethodDelete:
		if o == nil {
			http.NotFound(w, r)
			return
		}
		if !precondition(w, r, o) {
			return
		}
		delete(c.objects, member)
		s.record(c, member, true)
		w.WriteHeader(http.StatusNoContent)
	default:
		http.Error(w, "no", http.StatusMethodNotAllowed)
	}
}

// precondition applies If-None-Match: * and If-Match.
func precondition(w http.ResponseWriter, r *http.Request, o *Object) bool {
	if r.Header.Get("If-None-Match") == "*" && o != nil {
		w.WriteHeader(http.StatusPreconditionFailed)
		return false
	}
	if m := r.Header.Get("If-Match"); m != "" && (o == nil || m != o.ETag) {
		w.WriteHeader(http.StatusPreconditionFailed)
		return false
	}
	return true
}
