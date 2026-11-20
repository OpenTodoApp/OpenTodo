package httpapi

import (
	"bufio"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"sort"
	"time"

	"github.com/OpenTodoApp/opentodo/internal/audit"
	"github.com/OpenTodoApp/opentodo/internal/auth"
	"github.com/OpenTodoApp/opentodo/internal/e2ee"
	"github.com/OpenTodoApp/opentodo/internal/httpapi/httpx"
	opsync "github.com/OpenTodoApp/opentodo/internal/sync"
)

// surfaceJSON does nothing at runtime; it has the shape of writeJSON(w, status,
// doc) so the v1-surface analyzer (surface_static_test.go reads it like
// writeJSON) learns the response shape and status of a handler that streams its
// JSON instead of calling writeJSON. The export streams (streamExport), so it
// declares its surface with this; keep the declaration in sync with what
// streamExport writes.
func surfaceJSON(w http.ResponseWriter, status int, doc any) {}

func (s *Server) handleExport(w http.ResponseWriter, r *http.Request) {
	uid := userFrom(r.Context()).ID
	format := r.URL.Query().Get("format")
	if format != "" && format != "json" && format != "zip" {
		writeError(w, http.StatusBadRequest, "invalid_input", `format: must be "json" or "zip"`)
		return
	}
	if format == "zip" {
		s.writeExportZip(w, r, uid)
		s.audit.Record(r.Context(), audit.ExportRequested(uid, "zip"))
		return
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Content-Disposition", `attachment; filename="opentodo-export.json"`)
	// The response shape and status for the v1-surface analyzer; streamExport
	// writes exactly these members (the per-entity REST collections keep the
	// loop-derived keys the analyzer could never read, unchanged from before).
	surfaceJSON(w, http.StatusOK, map[string]any{
		// Real scalar values: the site bundle reads the export's format and version
		// from this line (scripts/site-bundle.mjs), and streamExport writes them.
		"format": "opentodo-export", "version": 1, "exportedAt": "", "userId": "",
		"comments": []opsync.Entity(nil), "attachments": []opsync.Entity(nil),
		"time_entries": []opsync.Entity(nil), "habit_tallies": []opsync.Entity(nil),
		"places": []opsync.Entity(nil), "themes": []opsync.Entity(nil),
		"memory": []opsync.Entity(nil), "user_prefs": []opsync.Entity(nil),
		"review": []opsync.Entity(nil), "project_prefs": []opsync.Entity(nil),
		"workspaces": []map[string]any(nil), "encryption": (*e2ee.KeyRecord)(nil),
	})
	if _, started, err := s.streamExport(r.Context(), r, w, uid, false); err != nil {
		if !started {
			s.internal(w, err)
			return
		}
		// The response is already on the wire: leave the JSON object unterminated
		// so the client rejects a truncated export rather than importing it.
		s.log.Error("export: stream", "err", err)
		return
	}
	s.audit.Record(r.Context(), audit.ExportRequested(uid, "json"))
}

// flagWriter records whether any byte reached the underlying writer, so a
// failure before the first flush can still answer with an error status.
type flagWriter struct {
	w     io.Writer
	wrote bool
}

func (f *flagWriter) Write(p []byte) (int, error) {
	if len(p) > 0 {
		f.wrote = true
	}
	return f.w.Write(p)
}

// exportMember is one top-level field of the export document: a whole value
// (scalars, workspaces, the encryption record) or a streamed collection.
type exportMember struct {
	key    string
	entity string                               // "" for a whole value
	prep   func([]opsync.Entity) ([]any, error) // a collection's per-page transform
	value  any                                  // a whole value
}

// streamExport writes the export document to w as a JSON object, each collection
// a bounded page at a time (EachExportPage) and each page's rows one at a time,
// so neither a whole collection nor the whole document is ever held or encoded
// at once: a 50k-task account otherwise peaked at ~370 MB. The bytes are
// identical to encoding the whole document with encoding/json — keys in the same
// sorted order, the same escaping, and (when indent) the same two-space
// indentation — so an export reads the same as before (TestExportStreamsSameBytes).
// It returns the attachment metadata it listed (for the ZIP export's file
// entries), whether any byte reached w (so the caller can still answer with an
// error status when nothing was sent), and the first error.
func (s *Server) streamExport(ctx context.Context, r *http.Request, w io.Writer, uid string, indent bool) (attachments []opsync.Entity, started bool, err error) {
	fw := &flagWriter{w: w}
	bw := bufio.NewWriterSize(fw, 32<<10)
	fail := func(e error) ([]opsync.Entity, bool, error) {
		_ = bw.Flush()
		return attachments, fw.wrote, e
	}

	identity := func(page []opsync.Entity) ([]any, error) {
		out := make([]any, len(page))
		for i, e := range page {
			out[i] = e
		}
		return out, nil
	}
	members := []exportMember{
		{key: "format", value: "opentodo-export"},
		{key: "version", value: 1},
		{key: "exportedAt", value: s.now().UTC().Format(time.RFC3339)},
		// The exporting account (time-tracking D11): an import tells its own time
		// entries from other members' by it.
		{key: "userId", value: uid},
		// Comments (comments-and-activity): deleted ones included like every other
		// tombstone; reactions fold into each comment, independently.
		{key: "comments", entity: "comment", prep: func(page []opsync.Entity) ([]any, error) {
			out := make([]any, len(page))
			for i, e := range page {
				out[i] = opsync.FoldReactions(e, uid)
			}
			return out, nil
		}},
		// Attachment metadata (attachments D12), removed ones included; the files
		// are in the ZIP export only, so the ids are kept for its loop.
		{key: "attachments", entity: "attachment", prep: func(page []opsync.Entity) ([]any, error) {
			attachments = append(attachments, page...)
			return identity(page)
		}},
		// Time entries the caller can read, every member's on shared tasks and the
		// deleted ones included (time-tracking D11).
		{key: "time_entries", entity: "time_entry", prep: identity},
		// Each device's count toward a day of an amount habit (habit-targets D2).
		{key: "habit_tallies", entity: "habit_tally", prep: identity},
		// The caller's places (task-locations D1): personal like labels, deleted
		// ones included; tasks link to them by id in location.place_id.
		{key: "places", entity: "place", prep: identity},
		// The caller's custom themes (theme-editor D1): personal, no REST collection.
		{key: "themes", entity: "theme", prep: identity},
		// The caller's date and time preferences (date-time-preferences D1).
		{key: "user_prefs", entity: "user_prefs", prep: identity},
		// When the caller last finished a weekly review (stats-and-review D4).
		{key: "review", entity: "review", prep: identity},
		// Personal per-project preferences (activity-feed D1, open-loops-method D4).
		{key: "project_prefs", entity: "project_prefs", prep: identity},
	}
	// The REST collections: each page is annotated like a REST read, then the
	// body version — a read's precondition, not data — is dropped, keeping the
	// pending appends (notes-overview D13).
	for plural, entity := range opsync.Plural {
		entity := entity
		members = append(members, exportMember{key: plural, entity: entity, prep: func(page []opsync.Entity) ([]any, error) {
			if err := s.annotateProjects(ctx, entity, page...); err != nil {
				return nil, err
			}
			out := make([]any, len(page))
			for i, e := range page {
				delete(e, "body_version")
				out[i] = e
			}
			return out, nil
		}})
	}
	// What the in-app assistant remembers (assistant-memory D1): personal, deleted
	// ones included, but never to read or agent tokens, which MCP clients and other
	// AI agents hold — memory stays with the person.
	if auth.FullAccess(httpx.TokenFrom(ctx).Scope) {
		members = append(members, exportMember{key: "memory", entity: "memory", prep: identity})
	}
	// Workspaces (OpenSpec change workspaces): the caller's role on each; for the
	// ones they own, the members' ids and roles and the groups. Small — whole.
	workspaces, err := s.exportWorkspaces(ctx, uid)
	if err != nil {
		return fail(err)
	}
	members = append(members, exportMember{key: "workspaces", value: workspaces})
	// End-to-end encryption (OpenSpec `e2ee`): content fields above are ciphertext
	// for an encrypted account; the wrapped key record makes the document
	// restorable and decryptable elsewhere with the passphrase. null otherwise.
	rec, err := s.keys().Get(ctx, uid)
	if err != nil {
		return fail(err)
	}
	members = append(members, exportMember{key: "encryption", value: rec})

	// encoding/json writes a map's keys sorted, so emit the members in that order
	// to keep the bytes identical to encoding the whole document.
	sort.Slice(members, func(i, j int) bool { return members[i].key < members[j].key })

	if err := bw.WriteByte('{'); err != nil {
		return fail(err)
	}
	for i, m := range members {
		if i > 0 {
			if err := bw.WriteByte(','); err != nil {
				return fail(err)
			}
		}
		if indent {
			if _, err := bw.WriteString("\n  "); err != nil {
				return fail(err)
			}
		}
		kb, _ := json.Marshal(m.key)
		if _, err := bw.Write(kb); err != nil {
			return fail(err)
		}
		if err := bw.WriteByte(':'); err != nil {
			return fail(err)
		}
		if indent {
			if err := bw.WriteByte(' '); err != nil {
				return fail(err)
			}
		}
		if m.entity == "" {
			if err := writeJSONValue(bw, m.value, indent); err != nil {
				return fail(err)
			}
			continue
		}
		if err := s.streamArray(ctx, bw, uid, m.entity, m.prep, indent); err != nil {
			return fail(err)
		}
	}
	if indent {
		if err := bw.WriteByte('\n'); err != nil {
			return fail(err)
		}
	}
	if err := bw.WriteByte('}'); err != nil {
		return fail(err)
	}
	// encoding/json's Encode ends with a newline; match it.
	if err := bw.WriteByte('\n'); err != nil {
		return fail(err)
	}
	if err := bw.Flush(); err != nil {
		return attachments, fw.wrote, err
	}
	return attachments, fw.wrote, nil
}

// writeJSONValue writes v as encoding/json would at one level of nesting: a
// whole value, pretty-printed with a two-space base indent when indent is set.
func writeJSONValue(bw *bufio.Writer, v any, indent bool) error {
	var b []byte
	var err error
	if indent {
		b, err = json.MarshalIndent(v, "  ", "  ")
	} else {
		b, err = json.Marshal(v)
	}
	if err != nil {
		return err
	}
	_, err = bw.Write(b)
	return err
}

// streamArray writes a collection as a JSON array, pulling it a page at a time
// and encoding each row on its own, byte-for-byte as encoding/json would: `[]`
// when empty, else each row on its own line under a four-space indent when
// indent is set, exactly as the whole array would pretty-print.
func (s *Server) streamArray(ctx context.Context, bw *bufio.Writer, uid, entity string, prep func([]opsync.Entity) ([]any, error), indent bool) error {
	if err := bw.WriteByte('['); err != nil {
		return err
	}
	first := true
	if err := s.sync.EachExportPage(ctx, uid, entity, func(page []opsync.Entity) error {
		items, err := prep(page)
		if err != nil {
			return err
		}
		for _, it := range items {
			if !first {
				if err := bw.WriteByte(','); err != nil {
					return err
				}
			}
			first = false
			if indent {
				if _, err := bw.WriteString("\n    "); err != nil {
					return err
				}
			}
			var b []byte
			if indent {
				b, err = json.MarshalIndent(it, "    ", "  ")
			} else {
				b, err = json.Marshal(it)
			}
			if err != nil {
				return err
			}
			if _, err := bw.Write(b); err != nil {
				return err
			}
		}
		return nil
	}); err != nil {
		return err
	}
	if !first && indent {
		if _, err := bw.WriteString("\n  "); err != nil {
			return err
		}
	}
	return bw.WriteByte(']')
}

// exportWorkspaces is the export's `workspaces` array: no names of people, and
// members and groups only of the workspaces the caller owns.
func (s *Server) exportWorkspaces(ctx context.Context, uid string) ([]map[string]any, error) {
	list, err := s.sync.Workspaces(ctx, uid)
	if err != nil {
		return nil, err
	}
	out := make([]map[string]any, 0, len(list))
	for _, ws := range list {
		e := map[string]any{"id": ws.ID, "name": ws.Name, "icon": ws.Icon, "color": ws.Color, "default": ws.Default, "role": ws.Role}
		if ws.Role == opsync.WorkspaceOwner && !ws.Default {
			members := make([]map[string]string, 0, len(ws.Members))
			for _, m := range ws.Members {
				members = append(members, map[string]string{"userId": m.UserID, "role": m.Role})
			}
			e["members"], e["groups"] = members, ws.Groups
		}
		out = append(out, e)
	}
	return out, nil
}
