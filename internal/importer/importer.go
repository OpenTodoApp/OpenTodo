// Package importer turns files (the app's own JSON export, CSV, and JSON exports
// of other task managers) into ordinary operations in the op log (OpenSpec change
// `data-import`). Every format is read by a Profile into normalised Rows; the
// planner resolves projects, labels, parents and duplicates against the user's
// current data; the job writes the result through sync.Apply with device "import".
package importer

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"strings"
	"time"

	// Zoned date-times are converted with the IANA database; the distroless image
	// ships no zoneinfo, so it is embedded (about 450 KB).
	_ "time/tzdata"
)

// Device is the op device id of every imported field.
const Device = "import"

// Limits keep a small host responsive. The file size limit is configured
// (OPENTODO_IMPORT_MAX_MB) and enforced by the HTTP layer.
const (
	MaxRows         = 50000
	MaxStoredErrors = 1000
	// MaxPreviewRows bounds the per-row list in a preview response. Totals always
	// count every row; rows in error, skipped or updated are listed first.
	MaxPreviewRows = 5000
)

// Row kinds.
const (
	KindProject = "project"
	KindTask    = "task"
	KindLabel   = "label"
)

// Due is a floating due date with an optional wall-clock time.
type Due struct {
	Date string `json:"date"`
	Time string `json:"time,omitempty"`
}

// Row is one normalised record read from a file.
type Row struct {
	// Line is the 1-based row number in the source (the CSV line, or the position
	// of the object in its JSON array); 0 when the source has no useful position.
	Line     int
	SourceID string
	Kind     string
	Title    string

	Description     string
	ProjectName     string
	ProjectSourceID string
	SectionName     string
	ParentSourceID  string
	Priority        int // 0 means "not given" (imported as 4)
	Due             *Due
	Labels          []string // label names
	Completed       bool
	CompletedAt     int64 // 0 with Completed set means "now"
	CreatedAt       int64
	Warnings        []string
	// Err marks a row that cannot be imported; the reason is shown per row.
	Err string

	// Entity carries an own-export record verbatim (its id plus every field), so the
	// round trip is exact. Only the opentodo profile sets it.
	Entity map[string]json.RawMessage
}

func (r *Row) warn(format string, args ...any) {
	r.Warnings = append(r.Warnings, fmt.Sprintf(format, args...))
}

func (r *Row) fail(format string, args ...any) {
	if r.Err == "" {
		r.Err = fmt.Sprintf(format, args...)
	}
}

// Parsed is the result of reading a file with a profile.
type Parsed struct {
	Format     string
	Version    int      // own export version, 0 otherwise
	Recognised []string // CSV columns that are mapped
	Ignored    []string // CSV columns that are not
	Rows       []Row
}

// Profile reads one file format.
type Profile interface {
	// Name is the stable identifier used in options, jobs and the API.
	Name() string
	// Description is a short human explanation shown next to the name.
	Description() string
	// Detect reports whether data looks like this format.
	Detect(data []byte) bool
	// Read parses the whole file into rows. Row-level problems are recorded on the
	// rows; an error means the file as a whole cannot be read.
	Read(r io.Reader, opts Options) (*Parsed, error)
}

// Profiles lists every format in detection order: the own export first, then each
// JSON shape by its structural signature, then CSV.
var Profiles = []Profile{opentodoProfile{}, itemsProfile{}, listsProfile{}, genericProfile{}, csvProfile{}}

// ProfileNames returns the identifiers of every supported format.
func ProfileNames() []string {
	out := make([]string, len(Profiles))
	for i, p := range Profiles {
		out[i] = p.Name()
	}
	return out
}

// ErrUnsupportedFormat is returned when no profile accepts a file.
var ErrUnsupportedFormat = errors.New("unsupported format")

// ErrTooManyRows is returned when a file holds more than MaxRows rows.
var ErrTooManyRows = fmt.Errorf("the file has more than %d rows", MaxRows)

// FileError means the file was recognised (or forced) but cannot be read.
type FileError struct{ Msg string }

func (e *FileError) Error() string { return e.Msg }

// OptionError means an import option is invalid; the message names it.
type OptionError struct{ Msg string }

func (e *OptionError) Error() string { return e.Msg }

// Detect picks the profile for data: the forced one when override is set,
// otherwise the first profile whose signature matches.
func Detect(data []byte, override string) (Profile, error) {
	if override != "" {
		for _, p := range Profiles {
			if p.Name() == override {
				return p, nil
			}
		}
		return nil, &OptionError{fmt.Sprintf("format: unknown format %q (supported: %s)", override, strings.Join(ProfileNames(), ", "))}
	}
	data = trimBOM(data)
	for _, p := range Profiles {
		if p.Detect(data) {
			return p, nil
		}
	}
	return nil, fmt.Errorf("%w: supported formats are %s", ErrUnsupportedFormat, strings.Join(ProfileNames(), ", "))
}

// Parse detects and reads a file.
func Parse(data []byte, opts Options) (*Parsed, error) {
	p, err := Detect(data, opts.Format)
	if err != nil {
		return nil, err
	}
	parsed, err := p.Read(bytes.NewReader(trimBOM(data)), opts)
	if err != nil {
		return nil, err
	}
	parsed.Format = p.Name()
	if len(parsed.Rows) > MaxRows {
		return nil, ErrTooManyRows
	}
	return parsed, nil
}

func trimBOM(b []byte) []byte { return bytes.TrimPrefix(b, []byte("\xef\xbb\xbf")) }

// Options are the user's choices for one preview or job.
type Options struct {
	// Format forces a profile instead of detection.
	Format string `json:"format,omitempty"`
	// TargetProject receives tasks without a project; empty means Inbox.
	TargetProject string `json:"targetProject,omitempty"`
	// TimeZone converts zoned date-times into floating ones (IANA name, default UTC).
	TimeZone string `json:"timeZone,omitempty"`
	// Sections is "label" (default: a section becomes a label) or "ignore".
	Sections string `json:"sections,omitempty"`
	// Duplicates is "skip" (default) or "import" for possible duplicates.
	Duplicates string `json:"duplicates,omitempty"`
	// Errors is "skip_rows" (default) or "abort".
	Errors string `json:"errors,omitempty"`
	// Existing applies to own-export rows whose id exists: "skip" (default) or "overwrite".
	Existing string `json:"existing,omitempty"`

	loc *time.Location
}

// Normalize fills defaults and validates every option except TargetProject, which
// needs the user's data (see Service).
func (o *Options) Normalize() error {
	o.Format = strings.TrimSpace(o.Format)
	if o.Format == "auto" {
		o.Format = ""
	}
	if o.Format != "" {
		if _, err := Detect(nil, o.Format); err != nil {
			return err
		}
	}
	o.TimeZone = strings.TrimSpace(o.TimeZone)
	if o.TimeZone == "" {
		o.TimeZone = "UTC"
	}
	loc, err := time.LoadLocation(o.TimeZone)
	if err != nil || o.TimeZone == "Local" {
		return &OptionError{fmt.Sprintf("timeZone: unknown time zone %q", o.TimeZone)}
	}
	o.loc = loc
	if err := oneOf(&o.Sections, "sections", "label", "ignore"); err != nil {
		return err
	}
	if err := oneOf(&o.Duplicates, "duplicates", "skip", "import"); err != nil {
		return err
	}
	if err := oneOf(&o.Errors, "errors", "skip_rows", "abort"); err != nil {
		return err
	}
	if err := oneOf(&o.Existing, "existing", "skip", "overwrite"); err != nil {
		return err
	}
	o.TargetProject = strings.TrimSpace(o.TargetProject)
	return nil
}

// Location returns the normalised time zone (UTC before Normalize).
func (o Options) Location() *time.Location {
	if o.loc == nil {
		return time.UTC
	}
	return o.loc
}

func oneOf(v *string, name string, allowed ...string) error {
	*v = strings.TrimSpace(*v)
	if *v == "" {
		*v = allowed[0]
		return nil
	}
	for _, a := range allowed {
		if *v == a {
			return nil
		}
	}
	return &OptionError{fmt.Sprintf("%s: must be one of %s", name, strings.Join(allowed, ", "))}
}
