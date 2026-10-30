package agenttools

import (
	"context"
	"encoding/json"
	"time"

	"github.com/OpenTodoApp/opentodo/internal/e2ee"
	"github.com/OpenTodoApp/opentodo/internal/frames"
	opsync "github.com/OpenTodoApp/opentodo/internal/sync"
)

// ---- list_frames (OpenSpec change calendar-frames, design D7) ----
//
// Frames are recurring background windows on the user's Day and Week grid
// ("Deep work" on weekdays from 09:00 to 11:00). An assistant reads their
// occurrences to propose ordinary due edits inside them; there is no write
// tool for frames.

// MaxFrameDays bounds the range list_frames expands.
const MaxFrameDays = 31

// EncryptedFrame stands in for a frame title this server cannot read.
const EncryptedFrame = "Encrypted frame"

func init() {
	register(tool{
		def: readDef("list_frames", "List frames",
			"List the occurrences of the user's calendar frames (recurring windows such as \"Deep work\" on weekdays 09:00-11:00) on the days from..to, "+
				"with floating wall times and the planning source (project:, label: or view: id) that says which tasks belong in each. "+
				"Default: the seven days from today in timezone; at most 31 days. Frames guide planning: propose ordinary due dates and times inside them.",
			object(nil, map[string]any{
				"from":     map[string]any{"type": "string", "format": "date", "description": "First day (YYYY-MM-DD). Default: today in timezone."},
				"to":       map[string]any{"type": "string", "format": "date", "description": "Last day (YYYY-MM-DD), at most 30 days after from. Default: six days after from."},
				"timezone": timezoneProp,
			})),
		read: (*Registry).listFrames,
	})
}

// frameText is a frame's user-written text.
type frameText struct {
	Title string `json:"title"`
}

type frameOccurrenceOut struct {
	FrameID   string    `json:"frame_id"`
	Untrusted frameText `json:"untrusted_text"`
	Date      string    `json:"date"`
	Start     string    `json:"start"`
	End       string    `json:"end"`
	Source    string    `json:"source"`
	Color     string    `json:"color"`
}

type frameOut struct {
	ID        string    `json:"id"`
	Untrusted frameText `json:"untrusted_text"`
	Weekdays  string    `json:"weekdays"`
	Start     string    `json:"start"`
	End       string    `json:"end"`
	FromDate  *string   `json:"from_date"`
	UntilDate *string   `json:"until_date"`
	Source    string    `json:"source"`
	Color     string    `json:"color"`
	// Drawn is false for a frame whose end is not after its start ("Times need fixing").
	Drawn bool `json:"drawn"`
}

// frameTitle is a frame's title for an assistant: the placeholder when it is ciphertext.
func frameTitle(e opsync.Entity) string {
	t := rawStr(e, "title")
	if e2ee.IsCiphertext(t) {
		return EncryptedFrame
	}
	return t
}

func frameOf(e opsync.Entity) frames.Frame {
	f := frames.Frame{ID: rawStr(e, "id"), Weekdays: rawStr(e, "weekdays"), Start: rawStr(e, "start"), End: rawStr(e, "end")}
	_ = json.Unmarshal(e["from_date"], &f.FromDate)
	_ = json.Unmarshal(e["until_date"], &f.UntilDate)
	_ = json.Unmarshal(e["position"], &f.Position)
	return f
}

func (r *Registry) listFrames(ctx context.Context, userID string, a args) (map[string]any, error) {
	from, err := a.date("from")
	if err != nil {
		return nil, err
	}
	to, err := a.date("to")
	if err != nil {
		return nil, err
	}
	loc, err := a.location()
	if err != nil {
		return nil, err
	}
	if from == "" {
		from = r.now().In(loc).Format(time.DateOnly)
	}
	first, _ := time.Parse(time.DateOnly, from)
	if to == "" {
		to = first.AddDate(0, 0, 6).Format(time.DateOnly)
	}
	last, _ := time.Parse(time.DateOnly, to)
	if last.Before(first) {
		return nil, argErr("to: must not be before from")
	}
	if last.After(first.AddDate(0, 0, MaxFrameDays-1)) {
		return nil, argErr("to: at most 31 days from from")
	}
	rows, err := r.list(ctx, userID, "frame", false)
	if err != nil {
		return nil, err
	}
	byID := map[string]opsync.Entity{}
	list := make([]frames.Frame, 0, len(rows))
	for _, e := range rows {
		byID[rawStr(e, "id")] = e
		list = append(list, frameOf(e))
	}
	out := []frameOccurrenceOut{}
	for _, o := range frames.Occurrences(list, from, to) {
		e := byID[o.ID]
		out = append(out, frameOccurrenceOut{FrameID: o.ID, Untrusted: frameText{Title: frameTitle(e)}, Date: o.Date, Start: o.Start, End: o.End,
			Source: rawStr(e, "source"), Color: rawStr(e, "color")})
	}
	return map[string]any{"occurrences": out, "from": from, "to": to, "timezone": loc.String(), "server_time": r.serverTime()}, nil
}

// FramesResource is opentodo://frames (calendar-frames D7): the user's frames,
// read-only, titles as untrusted text ("Encrypted frame" when unreadable).
func (r *Registry) FramesResource(ctx context.Context, userID string) (map[string]any, error) {
	rows, err := r.list(ctx, userID, "frame", false)
	if err != nil {
		return nil, err
	}
	out := []frameOut{}
	for _, e := range rows {
		f := frameOf(e)
		out = append(out, frameOut{ID: f.ID, Untrusted: frameText{Title: frameTitle(e)}, Weekdays: f.Weekdays, Start: f.Start, End: f.End,
			FromDate: f.FromDate, UntilDate: f.UntilDate, Source: rawStr(e, "source"), Color: rawStr(e, "color"), Drawn: frames.TimesValid(f.Start, f.End)})
	}
	return noticed(map[string]any{"frames": out}), nil
}
