// Package graphtest is an in-process fake of the parts of Microsoft's
// identity platform and Microsoft Graph that calendar sync uses (OpenSpec
// change outlook-calendar-sync): the token endpoint (codes, rotating refresh
// tokens, revoked grants, a refused client secret), /me, the mailbox time
// zone, calendars, calendarView and calendarView/delta (paged, with removed
// events and expiring delta links), events with ETags, If-Match, extended
// properties and transactionId, and throttling. It is never linked into the
// server.
package graphtest

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/OpenTodoApp/opentodo/internal/zoned"
)

// DT is Graph's dateTimeTimeZone.
type DT struct {
	DateTime string `json:"dateTime"`
	TimeZone string `json:"timeZone"`
}

// Event is one stored event.
type Event struct {
	ID, Calendar, ETag string
	Subject, Body      string
	Start, End         DT
	IsAllDay           bool
	// TaskID is the value of OpenTodo's extended property, "" without it.
	TaskID        string
	TransactionID string
	Modified      time.Time
}

// Calendar is one calendar of the account.
type Calendar struct {
	ID, Name, Color string
	CanEdit         bool
}

type change struct {
	seq int
	id  string
}

// Server is the fake tenant and mailbox.
type Server struct {
	*httptest.Server
	// Client is the accepted app registration.
	ClientID, ClientSecret string
	// Code is the accepted authorization code.
	Code string
	// Address and MailboxZone describe the account.
	Address, MailboxZone string
	// RefuseClient answers every token request with an expired client secret;
	// Revoked refuses refresh tokens with invalid_grant; NoRotate keeps the
	// refresh token instead of issuing a new one.
	RefuseClient, Revoked, NoRotate bool
	// ExpireDeltas answers every stored delta link with 410.
	ExpireDeltas bool
	// PageSize bounds the events of one page (default 50).
	PageSize int
	// Property is the extended property id OpenTodo marks events with.
	Property string
	// Now stamps changes (defaults to time.Now).
	Now func() time.Time

	mu        sync.Mutex
	cals      map[string]*Calendar
	order     []string
	events    map[string]*Event
	log       map[string][]change // calendar → changes
	seq       int
	tokens    map[string]bool // access tokens issued
	refresh   map[string]bool
	issued    int
	throttle  int
	skip      int
	race      bool
	throttleS int
	retry     string
	loseNext  int
	requests  []string
	prefers   []string
	refreshes int
}

// New starts a fake with one writable calendar "cal-work" named "Calendar".
func New() *Server {
	s := &Server{ClientID: "ms-client", ClientSecret: "ms-secret", Code: "the-code", Address: "me@outlook.com",
		MailboxZone: "W. Europe Standard Time", PageSize: 50,
		Property: "String {6f1c1c9e-2c8b-4d0e-9a51-6f70656e746f} Name opentodoTaskId",
		cals:     map[string]*Calendar{}, events: map[string]*Event{}, log: map[string][]change{},
		tokens: map[string]bool{}, refresh: map[string]bool{}}
	s.AddCalendar(&Calendar{ID: "cal-work", Name: "Calendar", Color: "#3366cc", CanEdit: true})
	mux := http.NewServeMux()
	mux.HandleFunc("POST /{tenant}/oauth2/v2.0/token", s.token)
	mux.HandleFunc("GET /v1.0/me", s.guard(s.me))
	mux.HandleFunc("GET /v1.0/me/mailboxSettings/timeZone", s.guard(s.zone))
	mux.HandleFunc("GET /v1.0/me/calendars", s.guard(s.calendars))
	mux.HandleFunc("GET /v1.0/me/calendars/{cal}/calendarView/delta", s.guard(s.delta))
	mux.HandleFunc("GET /v1.0/me/calendars/{cal}/calendarView", s.guard(s.view))
	mux.HandleFunc("POST /v1.0/me/calendars/{cal}/events", s.guard(s.create))
	mux.HandleFunc("GET /v1.0/me/events/{id}", s.guard(s.get))
	mux.HandleFunc("PATCH /v1.0/me/events/{id}", s.guard(s.patch))
	mux.HandleFunc("DELETE /v1.0/me/events/{id}", s.guard(s.remove))
	s.Server = httptest.NewServer(mux)
	return s
}

// GraphBase is the fake's Graph v1.0 address.
func (s *Server) GraphBase() string { return s.URL + "/v1.0" }

func (s *Server) now() time.Time {
	if s.Now != nil {
		return s.Now()
	}
	return time.Now()
}

// AddCalendar adds a calendar.
func (s *Server) AddCalendar(c *Calendar) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, ok := s.cals[c.ID]; !ok {
		s.order = append(s.order, c.ID)
	}
	s.cals[c.ID] = c
}

// RemoveCalendar deletes a calendar and its events.
func (s *Server) RemoveCalendar(id string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.cals, id)
	for k, e := range s.events {
		if e.Calendar == id {
			delete(s.events, k)
		}
	}
}

// SetCanEdit changes whether a calendar can be written.
func (s *Server) SetCanEdit(id string, can bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if c := s.cals[id]; c != nil {
		c.CanEdit = can
	}
}

// Throttle answers the next n Graph requests with status (429 or 503) and
// the Retry-After value.
func (s *Server) Throttle(n, status int, retryAfter string) {
	s.ThrottleAfter(0, n, status, retryAfter)
}

// ThrottleAfter lets the next k Graph requests through, then throttles n.
func (s *Server) ThrottleAfter(k, n, status int, retryAfter string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.skip, s.throttle, s.throttleS, s.retry = k, n, status, retryAfter
}

// RaceNextPatch changes the next patched event just before the patch arrives,
// as an edit in Outlook at the same moment would.
func (s *Server) RaceNextPatch() {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.race = true
}

// LoseCreates stores the next n created events but answers 504, as if the
// answer was lost on the way.
func (s *Server) LoseCreates(n int) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.loseNext = n
}

// Requests returns "METHOD path?query" of every Graph request so far.
func (s *Server) Requests() []string {
	s.mu.Lock()
	defer s.mu.Unlock()
	return append([]string(nil), s.requests...)
}

// Count counts the Graph requests whose "METHOD path?query" starts with prefix.
func (s *Server) Count(prefix string) int {
	n := 0
	for _, r := range s.Requests() {
		if strings.HasPrefix(r, prefix) {
			n++
		}
	}
	return n
}

// CountContaining counts the Graph requests that contain sub.
func (s *Server) CountContaining(sub string) int {
	n := 0
	for _, r := range s.Requests() {
		if strings.Contains(r, sub) {
			n++
		}
	}
	return n
}

// Prefers returns the Prefer headers seen.
func (s *Server) Prefers() []string {
	s.mu.Lock()
	defer s.mu.Unlock()
	return append([]string(nil), s.prefers...)
}

// Refreshes counts refresh-token grants.
func (s *Server) Refreshes() int {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.refreshes
}

// ValidRefresh reports whether a refresh token is accepted.
func (s *Server) ValidRefresh(tok string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.refresh[tok]
}

// Add stores an event someone made in Outlook and returns its id.
func (s *Server) Add(e Event) string {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.store(&e)
}

func (s *Server) store(e *Event) string {
	if e.ID == "" {
		s.issued++
		e.ID = fmt.Sprintf("AAMkAGI2-ev%04d=", s.issued)
	}
	if e.Modified.IsZero() {
		e.Modified = s.now()
	}
	s.seq++
	e.ETag = fmt.Sprintf(`W/"DwAAABYAAA%d"`, s.seq)
	s.events[e.ID] = e
	s.log[e.Calendar] = append(s.log[e.Calendar], change{seq: s.seq, id: e.ID})
	return e.ID
}

// Change edits an event as Outlook would (a new ETag and modification time).
func (s *Server) Change(id string, f func(e *Event)) {
	s.mu.Lock()
	defer s.mu.Unlock()
	e := s.events[id]
	if e == nil {
		return
	}
	f(e)
	e.Modified = s.now()
	s.store(e)
}

// Delete removes an event as Outlook would.
func (s *Server) Delete(id string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.drop(id)
}

func (s *Server) drop(id string) {
	e := s.events[id]
	if e == nil {
		return
	}
	delete(s.events, id)
	s.seq++
	s.log[e.Calendar] = append(s.log[e.Calendar], change{seq: s.seq, id: id})
}

// Events returns a calendar's events by start.
func (s *Server) Events(cal string) []Event {
	s.mu.Lock()
	defer s.mu.Unlock()
	var out []Event
	for _, e := range s.events {
		if e.Calendar == cal {
			out = append(out, *e)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Start.DateTime+out[i].ID < out[j].Start.DateTime+out[j].ID })
	return out
}

// ByTask returns the events carrying a task's property.
func (s *Server) ByTask(taskID string) []Event {
	s.mu.Lock()
	defer s.mu.Unlock()
	var out []Event
	for _, e := range s.events {
		if e.TaskID == taskID {
			out = append(out, *e)
		}
	}
	return out
}

// ---- token endpoint ----

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func (s *Server) issue(rotate string) map[string]any {
	s.issued++
	access := fmt.Sprintf("access-%d", s.issued)
	s.tokens[access] = true
	out := map[string]any{"access_token": access, "token_type": "Bearer", "expires_in": 3600, "scope": "Calendars.ReadWrite"}
	if rotate != "" && s.NoRotate {
		return out
	}
	r := fmt.Sprintf("refresh-%d", s.issued)
	s.refresh[r] = true
	out["refresh_token"] = r
	return out
}

func (s *Server) token(w http.ResponseWriter, r *http.Request) {
	_ = r.ParseForm()
	s.mu.Lock()
	defer s.mu.Unlock()
	f := r.PostForm
	if s.RefuseClient || f.Get("client_id") != s.ClientID || f.Get("client_secret") != s.ClientSecret {
		writeJSON(w, 401, map[string]any{"error": "invalid_client", "error_description": "AADSTS7000222: The provided client secret keys for app are expired.",
			"error_codes": []int{7000222}})
		return
	}
	switch f.Get("grant_type") {
	case "authorization_code":
		if f.Get("code") != s.Code || f.Get("code_verifier") == "" || f.Get("redirect_uri") == "" {
			writeJSON(w, 400, map[string]any{"error": "invalid_grant", "error_description": "AADSTS70000: The provided authorization code is invalid."})
			return
		}
		writeJSON(w, 200, s.issue(""))
	case "refresh_token":
		s.refreshes++
		if s.Revoked || !s.refresh[f.Get("refresh_token")] {
			writeJSON(w, 400, map[string]any{"error": "invalid_grant", "error_description": "AADSTS70008: The refresh token has expired or was revoked."})
			return
		}
		writeJSON(w, 200, s.issue(f.Get("refresh_token")))
	default:
		writeJSON(w, 400, map[string]any{"error": "unsupported_grant_type"})
	}
}

// ---- Graph ----

func graphError(w http.ResponseWriter, status int, code string) {
	writeJSON(w, status, map[string]any{"error": map[string]string{"code": code, "message": code}})
}

// guard checks the bearer token, records the request and throttles.
func (s *Server) guard(h func(w http.ResponseWriter, r *http.Request)) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		s.mu.Lock()
		u, _ := url.QueryUnescape(r.URL.RequestURI())
		s.requests = append(s.requests, r.Method+" "+u)
		s.prefers = append(s.prefers, strings.Join(r.Header.Values("Prefer"), ", "))
		ok := s.tokens[strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")]
		throttled := false
		switch {
		case s.skip > 0:
			s.skip--
		case s.throttle > 0:
			s.throttle--
			throttled = true
		}
		status, retry := s.throttleS, s.retry
		s.mu.Unlock()
		if !ok {
			graphError(w, 401, "InvalidAuthenticationToken")
			return
		}
		if throttled {
			w.Header().Set("Retry-After", retry)
			graphError(w, status, "TooManyRequests")
			return
		}
		h(w, r)
	}
}

func (s *Server) me(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, 200, map[string]any{"userPrincipalName": s.Address, "mail": s.Address, "displayName": "Me"})
}

func (s *Server) zone(w http.ResponseWriter, _ *http.Request) {
	if s.MailboxZone == "" {
		graphError(w, 404, "ErrorItemNotFound")
		return
	}
	writeJSON(w, 200, map[string]any{"value": s.MailboxZone})
}

func (s *Server) calendars(w http.ResponseWriter, _ *http.Request) {
	s.mu.Lock()
	defer s.mu.Unlock()
	list := []map[string]any{}
	for _, id := range s.order {
		if c := s.cals[id]; c != nil {
			list = append(list, map[string]any{"id": c.ID, "name": c.Name, "hexColor": c.Color, "canEdit": c.CanEdit})
		}
	}
	writeJSON(w, 200, map[string]any{"value": list})
}

// instant is when a stored time happens.
func instant(d DT, allDay bool) time.Time {
	loc := time.UTC
	if !allDay && d.TimeZone != "" && d.TimeZone != "UTC" {
		name := d.TimeZone
		if iana, ok := zoned.WindowsZone(name); ok {
			name = iana
		}
		if l, err := time.LoadLocation(name); err == nil {
			loc = l
		}
	}
	t, _ := time.ParseInLocation("2006-01-02T15:04:05", d.DateTime[:min(19, len(d.DateTime))], loc)
	return t
}

func (s *Server) inWindow(e *Event, from, to time.Time) bool {
	return instant(e.Start, e.IsAllDay).Before(to) && instant(e.End, e.IsAllDay).After(from)
}

func wantsUTC(r *http.Request) bool {
	return strings.Contains(strings.Join(r.Header.Values("Prefer"), ","), `outlook.timezone="UTC"`)
}

// view renders an event; expand adds OpenTodo's property when asked for.
func (s *Server) render(e *Event, r *http.Request, expand bool) map[string]any {
	start, end := e.Start, e.End
	if !e.IsAllDay && wantsUTC(r) {
		start = DT{instant(e.Start, false).UTC().Format("2006-01-02T15:04:05") + ".0000000", "UTC"}
		end = DT{instant(e.End, false).UTC().Format("2006-01-02T15:04:05") + ".0000000", "UTC"}
	}
	out := map[string]any{"id": e.ID, "@odata.etag": e.ETag, "subject": e.Subject, "isAllDay": e.IsAllDay, "start": start, "end": end,
		"showAs": "busy", "isCancelled": false, "lastModifiedDateTime": e.Modified.UTC().Format(time.RFC3339Nano),
		"body": map[string]string{"contentType": "text", "content": e.Body}}
	if expand && e.TaskID != "" {
		out["singleValueExtendedProperties"] = []map[string]string{{"id": s.Property, "value": e.TaskID}}
	}
	return out
}

func (s *Server) expands(r *http.Request) bool {
	return strings.Contains(r.URL.Query().Get("$expand"), s.Property)
}

func window(r *http.Request) (time.Time, time.Time, bool) {
	from, err1 := time.Parse(time.RFC3339, r.URL.Query().Get("startDateTime"))
	to, err2 := time.Parse(time.RFC3339, r.URL.Query().Get("endDateTime"))
	return from, to, err1 == nil && err2 == nil
}

// page answers one page of items with a next link or the final link.
func (s *Server) page(w http.ResponseWriter, r *http.Request, items []map[string]any, final string) {
	skip, _ := strconv.Atoi(r.URL.Query().Get("$skiptoken"))
	size := s.PageSize
	if size <= 0 {
		size = 50
	}
	end := min(skip+size, len(items))
	out := map[string]any{"value": items[min(skip, len(items)):end]}
	if end < len(items) {
		q := r.URL.Query()
		q.Set("$skiptoken", strconv.Itoa(end))
		out["@odata.nextLink"] = s.URL + r.URL.Path + "?" + q.Encode()
	} else if final != "" {
		out["@odata.deltaLink"] = final
	}
	writeJSON(w, 200, out)
}

func (s *Server) view(w http.ResponseWriter, r *http.Request) {
	from, to, ok := window(r)
	s.mu.Lock()
	defer s.mu.Unlock()
	cal := r.PathValue("cal")
	if s.cals[cal] == nil {
		graphError(w, 404, "ErrorItemNotFound")
		return
	}
	if !ok {
		graphError(w, 400, "ErrorInvalidParameter")
		return
	}
	items := []map[string]any{}
	for _, e := range s.sorted(cal) {
		if s.inWindow(e, from, to) {
			items = append(items, s.render(e, r, s.expands(r)))
		}
	}
	s.page(w, r, items, "")
}

func (s *Server) sorted(cal string) []*Event {
	var out []*Event
	for _, e := range s.events {
		if e.Calendar == cal {
			out = append(out, e)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].ID < out[j].ID })
	return out
}

func (s *Server) delta(w http.ResponseWriter, r *http.Request) {
	from, to, ok := window(r)
	s.mu.Lock()
	defer s.mu.Unlock()
	cal := r.PathValue("cal")
	if s.cals[cal] == nil {
		graphError(w, 404, "ErrorItemNotFound")
		return
	}
	if !ok {
		graphError(w, 400, "ErrorInvalidParameter")
		return
	}
	q := r.URL.Query()
	items := []map[string]any{}
	if tok := q.Get("$deltatoken"); tok != "" {
		if s.ExpireDeltas {
			graphError(w, 410, "SyncStateNotFound")
			return
		}
		since, _ := strconv.Atoi(tok)
		seen := map[string]bool{}
		for _, c := range s.log[cal] {
			if c.seq <= since || seen[c.id] {
				continue
			}
			seen[c.id] = true
			if e := s.events[c.id]; e != nil && e.Calendar == cal && s.inWindow(e, from, to) {
				items = append(items, s.render(e, r, false))
			} else {
				items = append(items, map[string]any{"id": c.id, "@removed": map[string]string{"reason": "deleted"}})
			}
		}
	} else {
		for _, e := range s.sorted(cal) {
			if s.inWindow(e, from, to) {
				items = append(items, s.render(e, r, false))
			}
		}
	}
	link := url.Values{"startDateTime": {q.Get("startDateTime")}, "endDateTime": {q.Get("endDateTime")}, "$deltatoken": {strconv.Itoa(s.seq)}}
	s.page(w, r, items, s.URL+r.URL.Path+"?"+link.Encode())
}

// input is an event as a client sends it.
type input struct {
	Subject *string `json:"subject"`
	Body    *struct {
		Content string `json:"content"`
	} `json:"body"`
	Start         *DT    `json:"start"`
	End           *DT    `json:"end"`
	IsAllDay      *bool  `json:"isAllDay"`
	TransactionID string `json:"transactionId"`
	Props         []struct {
		ID    string `json:"id"`
		Value string `json:"value"`
	} `json:"singleValueExtendedProperties"`
}

func (in *input) apply(e *Event) {
	if in.Subject != nil {
		e.Subject = *in.Subject
	}
	if in.Body != nil {
		e.Body = in.Body.Content
	}
	if in.Start != nil {
		e.Start = *in.Start
	}
	if in.End != nil {
		e.End = *in.End
	}
	if in.IsAllDay != nil {
		e.IsAllDay = *in.IsAllDay
	}
}

func readInput(r *http.Request) (*input, bool) {
	var in input
	b, err := io.ReadAll(io.LimitReader(r.Body, 1<<20))
	return &in, err == nil && json.Unmarshal(b, &in) == nil
}

func (s *Server) create(w http.ResponseWriter, r *http.Request) {
	in, ok := readInput(r)
	s.mu.Lock()
	defer s.mu.Unlock()
	cal := s.cals[r.PathValue("cal")]
	switch {
	case cal == nil:
		graphError(w, 404, "ErrorItemNotFound")
		return
	case !cal.CanEdit:
		graphError(w, 403, "ErrorAccessDenied")
		return
	case !ok || in.Start == nil || in.End == nil:
		graphError(w, 400, "ErrorInvalidRequest")
		return
	}
	if in.TransactionID != "" {
		for _, e := range s.events {
			if e.TransactionID == in.TransactionID && e.Calendar == cal.ID {
				writeJSON(w, 201, s.render(e, r, false))
				return
			}
		}
	}
	e := &Event{Calendar: cal.ID, TransactionID: in.TransactionID}
	in.apply(e)
	for _, p := range in.Props {
		if strings.EqualFold(p.ID, s.Property) {
			e.TaskID = p.Value
		}
	}
	s.store(e)
	if s.loseNext > 0 {
		s.loseNext--
		graphError(w, 504, "GatewayTimeout")
		return
	}
	writeJSON(w, 201, s.render(e, r, false))
}

func (s *Server) get(w http.ResponseWriter, r *http.Request) {
	s.mu.Lock()
	defer s.mu.Unlock()
	e := s.events[r.PathValue("id")]
	if e == nil {
		graphError(w, 404, "ErrorItemNotFound")
		return
	}
	writeJSON(w, 200, s.render(e, r, s.expands(r)))
}

// precondition answers 412 when If-Match names another version.
func precondition(w http.ResponseWriter, r *http.Request, e *Event) bool {
	if m := r.Header.Get("If-Match"); m != "" && m != "*" && m != e.ETag {
		graphError(w, 412, "ErrorIrresolvableConflict")
		return false
	}
	return true
}

func (s *Server) patch(w http.ResponseWriter, r *http.Request) {
	in, ok := readInput(r)
	s.mu.Lock()
	defer s.mu.Unlock()
	e := s.events[r.PathValue("id")]
	switch {
	case e == nil:
		graphError(w, 404, "ErrorItemNotFound")
		return
	case s.cals[e.Calendar] != nil && !s.cals[e.Calendar].CanEdit:
		graphError(w, 403, "ErrorAccessDenied")
		return
	case !ok:
		graphError(w, 400, "ErrorInvalidRequest")
		return
	}
	if s.race {
		s.race = false
		e.Modified = s.now()
		s.store(e)
	}
	if !precondition(w, r, e) {
		return
	}
	in.apply(e)
	e.Modified = s.now()
	s.store(e)
	writeJSON(w, 200, s.render(e, r, false))
}

func (s *Server) remove(w http.ResponseWriter, r *http.Request) {
	s.mu.Lock()
	defer s.mu.Unlock()
	e := s.events[r.PathValue("id")]
	switch {
	case e == nil:
		graphError(w, 404, "ErrorItemNotFound")
		return
	case s.cals[e.Calendar] != nil && !s.cals[e.Calendar].CanEdit:
		graphError(w, 403, "ErrorAccessDenied")
		return
	case !precondition(w, r, e):
		return
	}
	s.drop(e.ID)
	w.WriteHeader(204)
}
