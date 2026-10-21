package httpapi

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"

	"github.com/pixari/opentodo/internal/importer"
)

// ---- handlers: import (OpenSpec `data-import`) ----
//
// Uploads are multipart/form-data with a `file` part and options either as one
// JSON `options` part or as individual fields named like the JSON keys. These
// routes have their own body limit (OPENTODO_IMPORT_MAX_MB) instead of the global
// 4 MB JSON limit.

// errTooLarge marks an upload over the configured limit.
var errTooLarge = errors.New("too large")

// readImport reads the uploaded file and options. It writes the error response
// itself and returns ok=false when the request cannot be used.
func (s *Server) readImport(w http.ResponseWriter, r *http.Request) ([]byte, importer.Options, bool) {
	var opts importer.Options
	limit := s.cfg.ImportMaxBytes()
	tooLarge := func() {
		// A hosted tenant's import size is one of its limits (multi-tenant-host D5).
		code := "too_large"
		if s.hosted {
			code = "limit_import"
		}
		writeError(w, http.StatusRequestEntityTooLarge, code, fmt.Sprintf("the file exceeds the import limit of %d MB", limit>>20))
	}
	// Room for the multipart framing and the options next to the file itself.
	r.Body = http.MaxBytesReader(w, r.Body, limit+1<<20)
	mr, err := r.MultipartReader()
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "expected multipart/form-data with a file part")
		return nil, opts, false
	}
	var data []byte
	haveFile, fileName := false, ""
	for {
		part, err := mr.NextPart()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			var mbe *http.MaxBytesError
			if errors.As(err, &mbe) {
				tooLarge()
			} else {
				writeError(w, http.StatusBadRequest, "bad_request", "malformed multipart body: "+err.Error())
			}
			return nil, opts, false
		}
		switch name := part.FormName(); name {
		case "file":
			data, err = readLimited(part, limit)
			if errors.Is(err, errTooLarge) {
				tooLarge()
				return nil, opts, false
			}
			if err != nil {
				var mbe *http.MaxBytesError
				if errors.As(err, &mbe) {
					tooLarge()
				} else {
					writeError(w, http.StatusBadRequest, "bad_request", "cannot read the file: "+err.Error())
				}
				return nil, opts, false
			}
			haveFile = true
			fileName = part.FileName()
		case "options":
			b, err := readLimited(part, 64<<10)
			if err != nil {
				writeError(w, http.StatusBadRequest, "bad_request", "options part too large or unreadable")
				return nil, opts, false
			}
			dec := json.NewDecoder(strings.NewReader(string(b)))
			dec.DisallowUnknownFields()
			if err := dec.Decode(&opts); err != nil {
				writeError(w, http.StatusBadRequest, "invalid_input", "options: "+err.Error())
				return nil, opts, false
			}
		default:
			b, err := readLimited(part, 4<<10)
			if err != nil {
				writeError(w, http.StatusBadRequest, "bad_request", "field "+name+" too large")
				return nil, opts, false
			}
			if !setOption(&opts, name, strings.TrimSpace(string(b))) {
				writeError(w, http.StatusBadRequest, "invalid_input", fmt.Sprintf("unknown field %q", name))
				return nil, opts, false
			}
		}
		part.Close()
	}
	if !haveFile {
		writeError(w, http.StatusBadRequest, "bad_request", "the file part is missing")
		return nil, opts, false
	}
	opts.SetFileName(fileName)
	return data, opts, true
}

func readLimited(r io.Reader, limit int64) ([]byte, error) {
	b, err := io.ReadAll(io.LimitReader(r, limit+1))
	if err != nil {
		return nil, err
	}
	if int64(len(b)) > limit {
		return nil, errTooLarge
	}
	return b, nil
}

func setOption(o *importer.Options, name, v string) bool {
	switch name {
	case "format":
		o.Format = v
	case "targetProject":
		o.TargetProject = v
	case "timeZone":
		o.TimeZone = v
	case "sections":
		o.Sections = v
	case "duplicates":
		o.Duplicates = v
	case "errors":
		o.Errors = v
	case "existing":
		o.Existing = v
	default:
		return false
	}
	return true
}

// importError maps importer errors onto the API's error envelope.
func (s *Server) importError(w http.ResponseWriter, err error) {
	var oe *importer.OptionError
	var fe *importer.FileError
	var ce *importer.ConflictError
	switch {
	case errors.As(err, &oe):
		writeError(w, http.StatusBadRequest, "invalid_input", oe.Error())
	case errors.Is(err, importer.ErrUnsupportedFormat):
		writeError(w, http.StatusBadRequest, "unsupported_format", "the file matches no supported format; "+strings.TrimPrefix(err.Error(), importer.ErrUnsupportedFormat.Error()+": "))
	case errors.As(err, &fe):
		writeError(w, http.StatusBadRequest, "invalid_file", fe.Error())
	case errors.Is(err, importer.ErrTooManyRows):
		writeError(w, http.StatusRequestEntityTooLarge, "too_large", err.Error()+"; split it into several files")
	case errors.As(err, &ce):
		writeError(w, http.StatusConflict, "conflict", ce.Error())
	case errors.Is(err, importer.ErrNotFound):
		writeError(w, http.StatusNotFound, "not_found", "import job not found")
	default:
		s.internal(w, err)
	}
}

func (s *Server) handleImportPreview(w http.ResponseWriter, r *http.Request) {
	data, opts, ok := s.readImport(w, r)
	if !ok {
		return
	}
	plan, err := s.importer.Preview(r.Context(), userFrom(r.Context()).ID, data, opts)
	if err != nil {
		s.importError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, plan)
}

func (s *Server) handleImportStart(w http.ResponseWriter, r *http.Request) {
	data, opts, ok := s.readImport(w, r)
	if !ok {
		return
	}
	job, err := s.importer.Start(r.Context(), userFrom(r.Context()).ID, data, opts)
	if err != nil {
		s.importError(w, err)
		return
	}
	writeJSON(w, http.StatusAccepted, map[string]any{"job": job})
}

func (s *Server) handleImportJobs(w http.ResponseWriter, r *http.Request) {
	jobs, err := s.importer.Jobs(r.Context(), userFrom(r.Context()).ID)
	if err != nil {
		s.internal(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"jobs": jobs})
}

func (s *Server) handleImportJob(w http.ResponseWriter, r *http.Request) {
	job, err := s.importer.Job(r.Context(), userFrom(r.Context()).ID, r.PathValue("id"))
	if err != nil {
		s.importError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"job": job})
}

func (s *Server) handleImportUndo(w http.ResponseWriter, r *http.Request) {
	job, err := s.importer.Undo(r.Context(), userFrom(r.Context()).ID, r.PathValue("id"))
	if err != nil {
		s.importError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"job": job})
}
