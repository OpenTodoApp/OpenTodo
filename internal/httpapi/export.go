package httpapi

import (
	"net/http"
	"time"

	"github.com/pixari/opentodo/internal/audit"
	opsync "github.com/pixari/opentodo/internal/sync"
)

func (s *Server) handleExport(w http.ResponseWriter, r *http.Request) {
	uid := userFrom(r.Context()).ID
	format := r.URL.Query().Get("format")
	if format != "" && format != "json" && format != "zip" {
		writeError(w, http.StatusBadRequest, "invalid_input", `format: must be "json" or "zip"`)
		return
	}
	out := map[string]any{"format": "opentodo-export", "version": 1, "exportedAt": time.Now().UTC().Format(time.RFC3339),
		// The exporting account (time-tracking D11): an import tells its own time
		// entries from other members' by it.
		"userId": uid}
	for plural, entity := range opsync.Plural {
		list, err := s.sync.List(r.Context(), uid, entity, true)
		if err != nil {
			s.internal(w, err)
			return
		}
		if err := s.annotateProjects(r.Context(), entity, list...); err != nil {
			s.internal(w, err)
			return
		}
		out[plural] = list
	}
	// Comments are exported too (comments-and-activity), deleted ones included like
	// every other tombstone; they have no REST collection of their own.
	comments, err := s.sync.List(r.Context(), uid, "comment", true)
	if err != nil {
		s.internal(w, err)
		return
	}
	out["comments"] = comments
	// Attachment metadata (attachments D12), removed ones included; the files
	// themselves are in the ZIP export only.
	attachments, err := s.sync.List(r.Context(), uid, "attachment", true)
	if err != nil {
		s.internal(w, err)
		return
	}
	out["attachments"] = attachments
	// Time entries the caller can read, every member's on shared tasks and the
	// deleted ones included (time-tracking D11).
	entries, err := s.sync.List(r.Context(), uid, "time_entry", true)
	if err != nil {
		s.internal(w, err)
		return
	}
	out["time_entries"] = entries
	// The caller's places (task-locations D1): personal like labels, deleted ones
	// included; tasks link to them by id in location.place_id.
	places, err := s.sync.List(r.Context(), uid, "place", true)
	if err != nil {
		s.internal(w, err)
		return
	}
	out["places"] = places
	// The caller's date and time preferences (date-time-preferences D1): personal,
	// no REST collection, but part of what the user owns, so the export carries them.
	prefs, err := s.sync.List(r.Context(), uid, "user_prefs", true)
	if err != nil {
		s.internal(w, err)
		return
	}
	out["user_prefs"] = prefs
	// When the caller last finished a weekly review (stats-and-review D4):
	// personal like user_prefs, restored by an import of an own export.
	review, err := s.sync.List(r.Context(), uid, "review", true)
	if err != nil {
		s.internal(w, err)
		return
	}
	out["review"] = review
	// Personal per-project preferences (activity-feed D1, open-loops-method D4):
	// the feed's seen markers and the review stamps, restored like review.
	projectPrefs, err := s.sync.List(r.Context(), uid, "project_prefs", true)
	if err != nil {
		s.internal(w, err)
		return
	}
	out["project_prefs"] = projectPrefs
	// End-to-end encryption (OpenSpec `e2ee`): content fields above are ciphertext
	// for an encrypted account; the wrapped key record makes the document
	// restorable and decryptable elsewhere with the passphrase. null otherwise.
	rec, err := s.keys().Get(r.Context(), uid)
	if err != nil {
		s.internal(w, err)
		return
	}
	out["encryption"] = rec
	if format == "zip" {
		s.writeExportZip(w, r, out, attachments)
		s.audit.Record(r.Context(), audit.ExportRequested(uid, "zip"))
		return
	}
	w.Header().Set("Content-Disposition", `attachment; filename="opentodo-export.json"`)
	writeJSON(w, http.StatusOK, out)
	s.audit.Record(r.Context(), audit.ExportRequested(uid, "json"))
}
