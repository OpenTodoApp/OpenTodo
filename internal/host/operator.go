package host

import (
	"crypto/sha256"
	"crypto/subtle"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/pixari/opentodo/internal/backup"
	"github.com/pixari/opentodo/internal/config"
)

// OperatorHandler is the operator interface (design D7) a control plane
// drives: create (empty or from an archive), list, inspect, change limits,
// suspend, resume, delete and export tenants. It is served on its own
// listener (OPENTODO_HOST_OPERATOR_ADDR), never through a tenant's host name,
// and every request needs the host token: anything else is 401 without a
// word about tenants.
func (h *Host) OperatorHandler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /operator/v1/tenants", h.opList)
	mux.HandleFunc("POST /operator/v1/tenants", h.opCreate)
	mux.HandleFunc("GET /operator/v1/tenants/{name}", h.opGet)
	mux.HandleFunc("PATCH /operator/v1/tenants/{name}", h.opPatch)
	mux.HandleFunc("DELETE /operator/v1/tenants/{name}", h.opDelete)
	mux.HandleFunc("PUT /operator/v1/tenants/{name}/archive", h.opImport)
	mux.HandleFunc("GET /operator/v1/tenants/{name}/archive", h.opExport)
	mux.HandleFunc("POST /operator/v1/tenants/{name}/suspend", h.opSuspend)
	mux.HandleFunc("POST /operator/v1/tenants/{name}/resume", h.opResume)
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		writeError(w, http.StatusNotFound, "not_found", "unknown operator route")
	})
	want := sha256.Sum256([]byte(h.hc.Token))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		tok, ok := strings.CutPrefix(r.Header.Get("Authorization"), "Bearer ")
		got := sha256.Sum256([]byte(strings.TrimSpace(tok)))
		if !ok || subtle.ConstantTimeCompare(got[:], want[:]) != 1 {
			writeError(w, http.StatusUnauthorized, "unauthorized", "the operator token is missing or wrong")
			return
		}
		mux.ServeHTTP(w, r)
	})
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

// tenantView is a tenant as the operator sees it.
type tenantView struct {
	Record
	URL  string `json:"url"`
	Open bool   `json:"open"`
	// Effective are the limits in force: host defaults with the overrides.
	Effective config.Limits `json:"effectiveLimits"`
}

func (h *Host) view(rec Record) tenantView {
	return tenantView{Record: rec, URL: h.hc.TenantURL(rec.Name).String(), Open: h.pool.isOpen(rec.Name),
		Effective: h.hc.Limits.Merge(rec.Limits)}
}

func (h *Host) opError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, ErrNotFound):
		writeError(w, http.StatusNotFound, "not_found", err.Error())
	case errors.Is(err, ErrExists):
		writeError(w, http.StatusConflict, "exists", err.Error())
	case errors.Is(err, ErrInvalidName):
		writeError(w, http.StatusBadRequest, "invalid_name", err.Error())
	case errors.Is(err, ErrInvalidState):
		writeError(w, http.StatusConflict, "invalid_state", err.Error())
	default:
		h.log.Error("operator interface", "err", err)
		writeError(w, http.StatusInternalServerError, "internal", "internal error")
	}
}

func (h *Host) opList(w http.ResponseWriter, r *http.Request) {
	recs, err := h.reg.List(r.Context())
	if err != nil {
		h.opError(w, err)
		return
	}
	out := make([]tenantView, 0, len(recs))
	for _, rec := range recs {
		out = append(out, h.view(rec))
	}
	open, opens := h.pool.stats()
	writeJSON(w, http.StatusOK, map[string]any{"tenants": out, "openTenants": open, "opens": opens})
}

func (h *Host) opGet(w http.ResponseWriter, r *http.Request) {
	rec, err := h.reg.Get(r.Context(), r.PathValue("name"))
	if err != nil {
		h.opError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, h.view(rec))
}

func readBody(r *http.Request, v any) error {
	dec := json.NewDecoder(io.LimitReader(r.Body, 1<<16))
	dec.DisallowUnknownFields()
	return dec.Decode(v)
}

// opCreate creates an empty tenant: it is opened once, so its database exists
// and is migrated, and its first account needs the returned setup token.
func (h *Host) opCreate(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Name   string        `json:"name"`
		Limits config.Limits `json:"limits"`
	}
	if err := readBody(r, &in); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", `body must be {"name": "...", "limits": {...}}`)
		return
	}
	if !ValidName(in.Name) {
		h.opError(w, ErrInvalidName)
		return
	}
	h.createMu.Lock()
	defer h.createMu.Unlock()
	dir := h.TenantDir(in.Name)
	if err := h.checkFree(r, in.Name, dir); err != nil {
		h.opError(w, err)
		return
	}
	rec, err := h.reg.Create(r.Context(), in.Name, in.Limits)
	if err != nil {
		h.opError(w, err)
		return
	}
	h.forget(in.Name)
	if _, release, err := h.pool.acquire(r.Context(), in.Name); err != nil {
		h.log.Error("new tenant could not be opened", "tenant", in.Name, "err", err)
	} else {
		release()
	}
	rec, _ = h.reg.Get(r.Context(), in.Name)
	// The owner opens setupUrl once: the sign-in screen fills the token in.
	writeJSON(w, http.StatusCreated, map[string]any{"tenant": h.view(rec), "setupToken": rec.setupToken,
		"setupUrl": h.hc.TenantURL(rec.Name).String() + "/?setup=" + rec.setupToken})
}

// checkFree refuses a name in use (or in its grace period) and a leftover
// data directory.
func (h *Host) checkFree(r *http.Request, name, dir string) error {
	rec, err := h.reg.Get(r.Context(), name)
	switch {
	case errors.Is(err, ErrNotFound):
	case err != nil:
		return err
	case rec.State != StateDeleted || rec.DeletedAt == nil || h.now().Sub(time.UnixMilli(*rec.DeletedAt)) < TombstoneGrace:
		return ErrExists
	}
	if entries, err := os.ReadDir(dir); err == nil && len(entries) > 0 {
		return ErrExists
	}
	return nil
}

// opImport creates a tenant from a backup archive (the request body), the
// same archive `opentodo restore` reads; an encrypted one needs its
// passphrase in X-Archive-Passphrase.
func (h *Host) opImport(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("name")
	if !ValidName(name) {
		h.opError(w, ErrInvalidName)
		return
	}
	h.createMu.Lock()
	defer h.createMu.Unlock()
	dir := h.TenantDir(name)
	if err := h.checkFree(r, name, dir); err != nil {
		h.opError(w, err)
		return
	}
	tmpDir := filepath.Join(h.root, "tmp")
	if err := os.MkdirAll(tmpDir, 0o700); err != nil {
		h.opError(w, err)
		return
	}
	f, err := os.CreateTemp(tmpDir, "import-*.tar")
	if err != nil {
		h.opError(w, err)
		return
	}
	defer os.Remove(f.Name())
	_, err = io.Copy(f, r.Body)
	if cerr := f.Close(); err == nil {
		err = cerr
	}
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "could not read the archive: "+err.Error())
		return
	}
	res, err := backup.Restore(backup.RestoreOptions{DataDir: dir, Archive: f.Name(), Passphrase: r.Header.Get("X-Archive-Passphrase")})
	if err != nil {
		_ = os.RemoveAll(dir)
		switch {
		case errors.Is(err, backup.ErrPassphraseRequired):
			writeError(w, http.StatusUnprocessableEntity, "passphrase_required", "the archive is encrypted: send its passphrase in X-Archive-Passphrase")
		case errors.Is(err, backup.ErrIntegrity), errors.Is(err, backup.ErrNewerSchema):
			writeError(w, http.StatusUnprocessableEntity, "archive_invalid", err.Error())
		default:
			writeError(w, http.StatusUnprocessableEntity, "archive_invalid", "not a usable OpenTodo backup archive: "+err.Error())
		}
		return
	}
	rec, err := h.reg.Create(r.Context(), name, config.Limits{})
	if err != nil {
		_ = os.RemoveAll(dir)
		h.opError(w, err)
		return
	}
	h.forget(name)
	h.log.Info("tenant created from an archive", "tenant", name, "schema", res.Manifest.SchemaVersion)
	writeJSON(w, http.StatusCreated, map[string]any{"tenant": h.view(rec), "archive": res.Manifest})
}

func (h *Host) opPatch(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("name")
	var in struct {
		Limits *config.Limits `json:"limits"`
	}
	if err := readBody(r, &in); err != nil || in.Limits == nil {
		writeError(w, http.StatusBadRequest, "bad_request", `body must be {"limits": {...}}`)
		return
	}
	if err := h.reg.SetLimits(r.Context(), name, *in.Limits); err != nil {
		h.opError(w, err)
		return
	}
	h.forget(name)
	// Limits are read when a tenant opens: close it so the next request applies them.
	h.pool.evict(name)
	h.opGet(w, r)
}

func (h *Host) opSuspend(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("name")
	if err := h.reg.SetState(r.Context(), name, StateActive, StateSuspended); err != nil {
		h.opError(w, err)
		return
	}
	h.forget(name)
	h.pool.evict(name)
	h.opGet(w, r)
}

func (h *Host) opResume(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("name")
	if err := h.reg.SetState(r.Context(), name, StateSuspended, StateActive); err != nil {
		h.opError(w, err)
		return
	}
	h.forget(name)
	h.opGet(w, r)
}

// opDelete removes a tenant's data directory and keeps its name as a
// tombstone for TombstoneGrace.
func (h *Host) opDelete(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("name")
	if err := h.reg.MarkDeleted(r.Context(), name); err != nil {
		h.opError(w, err)
		return
	}
	h.forget(name)
	h.pool.evict(name)
	if err := os.RemoveAll(h.TenantDir(name)); err != nil {
		h.log.Error("tenant data directory not removed", "tenant", name, "err", err)
	}
	w.WriteHeader(http.StatusNoContent)
}

// opExport streams a tenant (active or suspended) as a backup archive.
func (h *Host) opExport(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("name")
	rec, err := h.reg.Get(r.Context(), name)
	if err == nil && rec.State == StateDeleted {
		err = ErrNotFound
	}
	if err != nil {
		h.opError(w, err)
		return
	}
	t, release, err := h.pool.acquire(r.Context(), name)
	if err != nil {
		writeError(w, http.StatusServiceUnavailable, "unavailable", err.Error())
		return
	}
	defer release()
	fname, err := t.Backups.ExportName(r.Context())
	if err != nil {
		h.opError(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/gzip")
	w.Header().Set("Content-Disposition", `attachment; filename="`+name+"-"+fname+`"`)
	if err := t.Backups.Export(r.Context(), w); err != nil {
		h.log.Error("tenant export failed", "tenant", name, "err", err)
	}
}
