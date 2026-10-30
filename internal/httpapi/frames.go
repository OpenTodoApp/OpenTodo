package httpapi

import (
	"encoding/json"
	"fmt"
	"net/http"
	"regexp"
	"slices"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/OpenTodoApp/opentodo/internal/e2ee"
	"github.com/OpenTodoApp/opentodo/internal/frames"
	"github.com/OpenTodoApp/opentodo/internal/ids"
	opsync "github.com/OpenTodoApp/opentodo/internal/sync"
)

// Calendar frames (OpenSpec change calendar-frames, design D7): recurring
// background windows on the Day and Week grid, a personal entity written
// through the op log. Reads accept every token scope; writes are refused to
// `read` and `agent` tokens by the scope check (they are not agent content
// routes). Invalid values answer 422 naming the field.

func (s *Server) registerFrameRoutes(mux *routes) {
	mux.handle("GET /api/v1/frames", signedIn, s.handleListFrames)
	mux.handle("POST /api/v1/frames", signedIn, s.handleCreateFrame)
	mux.handle("GET /api/v1/frames/{id}", signedIn, s.handleGetFrame)
	mux.handle("PATCH /api/v1/frames/{id}", signedIn, s.handlePatchFrame)
	mux.handle("DELETE /api/v1/frames/{id}", signedIn, s.handleDeleteFrame)
}

// frameFields are the fields a frame body may carry and a response shows.
var frameFields = []string{"title", "weekdays", "start", "end", "color", "source", "from_date", "until_date", "position", "created_at"}

// frameBody is a POST or PATCH body: nil is absent, "null" clears a date.
type frameBody struct {
	Title     json.RawMessage `json:"title"`
	Weekdays  json.RawMessage `json:"weekdays"`
	Start     json.RawMessage `json:"start"`
	End       json.RawMessage `json:"end"`
	Color     json.RawMessage `json:"color"`
	Source    json.RawMessage `json:"source"`
	FromDate  json.RawMessage `json:"from_date"`
	UntilDate json.RawMessage `json:"until_date"`
	Position  json.RawMessage `json:"position"`
}

func (b frameBody) fields() map[string]json.RawMessage {
	out := map[string]json.RawMessage{}
	for f, v := range map[string]json.RawMessage{"title": b.Title, "weekdays": b.Weekdays, "start": b.Start, "end": b.End, "color": b.Color,
		"source": b.Source, "from_date": b.FromDate, "until_date": b.UntilDate, "position": b.Position} {
		if v != nil {
			out[f] = v
		}
	}
	return out
}

// frameDTO is a frame as REST shows it: its fields and whether its title is ciphertext.
func frameDTO(e opsync.Entity) map[string]any {
	out := map[string]any{"id": json.RawMessage(e["id"])}
	for _, f := range frameFields {
		if v, ok := e[f]; ok {
			out[f] = v
		}
	}
	var title string
	_ = json.Unmarshal(e["title"], &title)
	out["encrypted"] = e2ee.IsCiphertext(title)
	return out
}

func (s *Server) handleListFrames(w http.ResponseWriter, r *http.Request) {
	list, err := s.sync.List(r.Context(), userFrom(r.Context()).ID, "frame", false)
	if err != nil {
		s.internal(w, err)
		return
	}
	out := make([]map[string]any, 0, len(list))
	for _, e := range list {
		out = append(out, frameDTO(e))
	}
	writeJSON(w, http.StatusOK, map[string]any{"frames": out})
}

// liveFrame reads a frame of the caller, nil when it is unknown or deleted.
func (s *Server) liveFrame(w http.ResponseWriter, r *http.Request) (opsync.Entity, bool) {
	e, err := s.sync.Get(r.Context(), userFrom(r.Context()).ID, "frame", r.PathValue("id"))
	if err != nil {
		s.internal(w, err)
		return nil, false
	}
	if e == nil || e.Deleted() {
		writeError(w, http.StatusNotFound, "not_found", "not found")
		return nil, false
	}
	return e, true
}

func (s *Server) handleGetFrame(w http.ResponseWriter, r *http.Request) {
	if e, ok := s.liveFrame(w, r); ok {
		writeJSON(w, http.StatusOK, frameDTO(e))
	}
}

func (s *Server) handleCreateFrame(w http.ResponseWriter, r *http.Request) {
	var b frameBody
	if err := readJSON(r, &b); err != nil {
		badBody(w, err)
		return
	}
	body := b.fields()
	if _, has := body["title"]; !has {
		frameInvalid(w, "title", "frame.title is required")
		return
	}
	if _, has := body["weekdays"]; !has {
		frameInvalid(w, "weekdays", "frame.weekdays is required")
		return
	}
	ctx := r.Context()
	uid := userFrom(ctx).ID
	live, err := s.sync.List(ctx, uid, "frame", false)
	if err != nil {
		s.internal(w, err)
		return
	}
	if len(live) >= frames.MaxLive {
		writeError(w, http.StatusUnprocessableEntity, "limit_reached", fmt.Sprintf("at most %d frames per account", frames.MaxLive))
		return
	}
	now := s.now().UnixMilli()
	defaults := map[string]string{"start": `"09:00"`, "end": `"10:00"`, "color": `"#64748b"`, "source": `""`,
		"from_date": `null`, "until_date": `null`, "position": strconv.FormatInt(now, 10)}
	for f, v := range defaults {
		if _, has := body[f]; !has {
			body[f] = json.RawMessage(v)
		}
	}
	body["created_at"] = json.RawMessage(strconv.FormatInt(now, 10))
	body["deleted_at"] = json.RawMessage(`null`)
	if !s.checkFrame(w, r, body, nil) {
		return
	}
	s.writeFrame(w, r, ids.New(), body, http.StatusCreated)
}

func (s *Server) handlePatchFrame(w http.ResponseWriter, r *http.Request) {
	var b frameBody
	if err := readJSON(r, &b); err != nil {
		badBody(w, err)
		return
	}
	body := b.fields()
	if len(body) == 0 {
		writeError(w, http.StatusBadRequest, "bad_request", "no fields to update")
		return
	}
	existing, ok := s.liveFrame(w, r)
	if !ok || !s.checkFrame(w, r, body, existing) {
		return
	}
	s.writeFrame(w, r, r.PathValue("id"), body, http.StatusOK)
}

func (s *Server) handleDeleteFrame(w http.ResponseWriter, r *http.Request) {
	if _, ok := s.liveFrame(w, r); !ok {
		return
	}
	body := map[string]json.RawMessage{"deleted_at": json.RawMessage(strconv.FormatInt(s.now().UnixMilli(), 10))}
	s.writeFrame(w, r, r.PathValue("id"), body, http.StatusNoContent)
}

// writeFrame applies a frame's fields as one strict batch and answers with the frame.
func (s *Server) writeFrame(w http.ResponseWriter, r *http.Request, id string, body map[string]json.RawMessage, status int) {
	uid := userFrom(r.Context()).ID
	if _, ok := s.applyREST(w, r.Context(), uid, fieldOps("frame", id, body, s.opTS()), "", collectionRefusals); !ok {
		return
	}
	if status == http.StatusNoContent {
		w.WriteHeader(status)
		return
	}
	e, err := s.sync.Get(r.Context(), uid, "frame", id)
	if err != nil {
		s.internal(w, err)
		return
	}
	writeJSON(w, status, frameDTO(e))
}

func frameInvalid(w http.ResponseWriter, field, msg string) {
	writeErrorWith(w, http.StatusUnprocessableEntity, "invalid_input", msg, map[string]any{"field": field})
}

var (
	frameColor  = regexp.MustCompile(`^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$`)
	frameSource = regexp.MustCompile(`^(?:project|label|view):[A-Za-z0-9._:@+=~-]{1,128}$`)
)

// checkFrame validates a frame body against the merged result (existing is nil
// on create), normalizes the weekday list in place and answers the refusal.
func (s *Server) checkFrame(w http.ResponseWriter, r *http.Request, body map[string]json.RawMessage, existing opsync.Entity) bool {
	str := func(f string) (string, bool) {
		raw, has := body[f]
		if !has {
			raw = existing[f]
		}
		var v string
		return v, json.Unmarshal(raw, &v) == nil
	}
	if _, has := body["title"]; has {
		title, ok := str("title")
		if !ok || strings.TrimSpace(title) == "" || (!e2ee.IsCiphertext(title) && utf8.RuneCountInString(title) > frames.MaxTitle) {
			frameInvalid(w, "title", fmt.Sprintf("frame.title must be 1 to %d characters", frames.MaxTitle))
			return false
		}
		if !e2ee.IsCiphertext(title) {
			on, err := s.encryptionEnabled(r.Context(), userFrom(r.Context()).ID)
			if err != nil {
				s.internal(w, err)
				return false
			}
			if on {
				writeError(w, http.StatusConflict, "encryption_enabled", "this account uses end-to-end encryption: frame.title must be encrypted on a device")
				return false
			}
		}
	}
	if _, has := body["weekdays"]; has {
		days, ok := str("weekdays")
		norm, valid := normalizeWeekdays(days)
		if !ok || !valid {
			frameInvalid(w, "weekdays", `frame.weekdays must be a comma list of distinct weekdays 1 (Monday) to 7 (Sunday), e.g. "1,2,3,4,5"`)
			return false
		}
		body["weekdays"] = json.RawMessage(opsync.QuoteJSON(norm))
	}
	for _, f := range []string{"start", "end"} {
		if v, ok := str(f); !ok || frames.Clock(v) < 0 {
			frameInvalid(w, f, "frame."+f+` must be a time "HH:MM" between 00:00 and 23:59`)
			return false
		}
	}
	start, _ := str("start")
	if end, _ := str("end"); !frames.TimesValid(start, end) {
		field := "end"
		if _, has := body["end"]; !has {
			field = "start"
		}
		frameInvalid(w, field, "frame.end must be after frame.start on the same day")
		return false
	}
	return checkFrameRest(w, body, existing, str)
}

// checkFrameRest checks the colour, the source, the dates and the position.
func checkFrameRest(w http.ResponseWriter, body map[string]json.RawMessage, existing opsync.Entity, str func(string) (string, bool)) bool {
	if _, has := body["color"]; has {
		if c, ok := str("color"); !ok || !frameColor.MatchString(c) {
			frameInvalid(w, "color", `frame.color must be a hex colour such as "#3b82f6"`)
			return false
		}
	}
	if _, has := body["source"]; has {
		if src, ok := str("source"); !ok || (src != "" && !frameSource.MatchString(src)) {
			frameInvalid(w, "source", `frame.source must be "", "project:<id>", "label:<id>" or "view:<id>"`)
			return false
		}
	}
	date := func(f string) (string, bool) {
		raw, has := body[f]
		if !has {
			raw = existing[f]
		}
		if raw == nil || string(raw) == "null" {
			return "", true
		}
		var v string
		if json.Unmarshal(raw, &v) != nil {
			return "", false
		}
		_, err := time.Parse(time.DateOnly, v)
		return v, err == nil && len(v) == 10
	}
	from, ok1 := date("from_date")
	until, ok2 := date("until_date")
	if !ok1 {
		frameInvalid(w, "from_date", `frame.from_date must be null or a date "YYYY-MM-DD"`)
		return false
	}
	if !ok2 {
		frameInvalid(w, "until_date", `frame.until_date must be null or a date "YYYY-MM-DD"`)
		return false
	}
	if from != "" && until != "" && until < from {
		frameInvalid(w, "until_date", "frame.until_date must not be before frame.from_date")
		return false
	}
	if raw, has := body["position"]; has {
		var p float64
		if json.Unmarshal(raw, &p) != nil {
			frameInvalid(w, "position", "frame.position must be a number")
			return false
		}
	}
	return true
}

// normalizeWeekdays sorts a weekday list; valid is false for anything but ""
// or distinct digits 1-7 separated by commas.
func normalizeWeekdays(s string) (string, bool) {
	if strings.TrimSpace(s) == "" {
		return "", true
	}
	var days []string
	for _, p := range strings.Split(s, ",") {
		p = strings.TrimSpace(p)
		if len(p) != 1 || p[0] < '1' || p[0] > '7' || slices.Contains(days, p) {
			return "", false
		}
		days = append(days, p)
	}
	slices.Sort(days)
	return strings.Join(days, ","), true
}
