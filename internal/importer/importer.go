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
	"net/url"
	"strings"
	"time"

	// Zoned date-times are converted with the IANA database; the distroless image
	// ships no zoneinfo, so it is embedded (about 450 KB).
	_ "time/tzdata"

	"github.com/pixari/opentodo/internal/origin"
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
	// Own-export entities (and json-items sections), OpenSpec change import-completeness.
	KindSection  = "section"
	KindReminder = "reminder"
	KindView     = "view"
	// KindUserPrefs is the date and time preferences row (OpenSpec change
	// date-time-preferences): restored from an own export, never undone.
	KindUserPrefs = "user_prefs"
	// KindReview is the "last weekly review" row (OpenSpec change
	// stats-and-review): restored from an own export like user_prefs, never undone.
	KindReview = "review"
	// KindProjectPrefs is a personal per-project preferences row: the activity
	// feed's seen marker and the review stamp (open-loops-method D4); restored
	// from an own export like user_prefs, never undone.
	KindProjectPrefs = "project_prefs"
	// KindTimeEntry is a time entry on a task (OpenSpec change time-tracking).
	KindTimeEntry = "time_entry"
	// KindPlace is a saved place (OpenSpec change task-locations), restored
	// verbatim from an own export like a label.
	KindPlace = "place"
	// KindAttachment is a file or link attachment (OpenSpec change attachments).
	KindAttachment = "attachment"
	// KindField is a custom field definition (OpenSpec change custom-fields),
	// restored verbatim from an own export like a section.
	KindField = "field"
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
	// BlockedBySourceIDs name rows of the same file this task waits for
	// (task-dependencies D10); resolved in a final pass once every task has an id.
	BlockedBySourceIDs []string
	Priority           int // 0 means "not given" (imported as 4)
	Due                *Due
	Labels             []string // label names
	Completed          bool
	CompletedAt        int64 // 0 with Completed set means "now"
	CreatedAt          int64
	// Recurrence is a canonical rule (internal/recurrence) or "".
	Recurrence string
	// Reminders of the task, created with it.
	Reminders []Reminder
	Warnings  []string
	// Err marks a row that cannot be imported; the reason is shown per row.
	Err string
	// File is the archive entry the row came from (ZIP uploads), shown with Line.
	File string
	// EstimateMinutes is the task's duration estimate (0 = none).
	EstimateMinutes int
	// Deadline is the day the task must be finished by, "YYYY-MM-DD" or ""
	// (OpenSpec change deadlines).
	Deadline string
	// Start is "someday", a start date "YYYY-MM-DD" or ""; Evening marks This
	// Evening (OpenSpec change someday-and-evening).
	Start   string
	Evening bool
	// Links are attachment references the file only gives as URLs; they become
	// link attachments of the task (OpenSpec change attachments, design D12).
	Links []Link
	// AssignSelf assigns the task to the importing account (a Linear issue
	// assigned to the importer's own email address).
	AssignSelf bool

	// Origin is where the task came from (OpenSpec change task-origin): an issue
	// for Linear, the source id for Todoist, Things and TickTick; nil otherwise.
	Origin *origin.Origin

	// Entity carries an own-export record verbatim (its id plus every field), so the
	// round trip is exact. Only the opentodo profile sets it.
	Entity map[string]json.RawMessage
}

// importedOrigin is the origin of a task read from a named profile's export
// (task-origin, "Imported origins"): {kind: "import", provider: profile, id: the
// source id without its "<profile>:" prefix}, the id duplicate detection keys on.
// A row numbered only by its line has no source identity and gets none.
func importedOrigin(profile, sourceID string) *origin.Origin {
	id, ok := strings.CutPrefix(sourceID, profile+":")
	if !ok || id == "" || strings.HasPrefix(id, "line:") {
		return nil
	}
	o := origin.Origin{Kind: origin.KindImport, Provider: profile, ID: id}
	if o.Validate() != nil {
		return nil
	}
	return &o
}

func (r *Row) warn(format string, args ...any) {
	r.Warnings = append(r.Warnings, fmt.Sprintf(format, args...))
}

func (r *Row) fail(format string, args ...any) {
	if r.Err == "" {
		r.Err = fmt.Sprintf(format, args...)
	}
}

// Link is a link attachment read from a file.
type Link struct{ Name, URL string }

// addLink keeps an http(s) URL as a link attachment, or warns that the value
// cannot be kept (a file the export only names, a local path).
func (r *Row) addLink(name, rawURL string) {
	u, err := url.Parse(strings.TrimSpace(rawURL))
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" {
		r.warn("attachment %q dropped (only links can be imported; use the original app's export of files)", firstNonEmpty(name, rawURL))
		return
	}
	if strings.TrimSpace(name) == "" {
		name = u.Host + u.Path
	}
	r.Links = append(r.Links, Link{Name: name, URL: u.String()})
}

func firstNonEmpty(a, b string) string {
	if strings.TrimSpace(a) != "" {
		return a
	}
	return b
}

// Parsed is the result of reading a file with a profile.
type Parsed struct {
	Format     string
	Version    int      // own export version, 0 otherwise
	Recognised []string // CSV columns that are mapped
	Ignored    []string // CSV columns that are not
	Rows       []Row
	// Notes are file-level remarks shown in the preview (for example records
	// of a kind that is not imported).
	Notes []string
	// ViewHints name projects that were boards in the source app; the web app
	// opens them as boards on the importing device (named-importers D8).
	ViewHints []ViewHint
	// Files are the attachment files of an own ZIP export, by attachment id.
	Files map[string][]byte
	// ExportedBy is the account id an own export names as its author
	// (time-tracking D11); "" for older files.
	ExportedBy string
	// Template is set for an own export that declares itself a template
	// (OpenSpec change project-templates, design D7).
	Template *TemplateInfo
}

// TemplateInfo is the optional `template` object of a template file.
type TemplateInfo struct {
	Day string `json:"day,omitempty"`
}

// ViewHint asks the importing device to show a project in a view ("board").
type ViewHint struct {
	ProjectSourceID string
	View            string
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
var Profiles = []Profile{opentodoProfile{}, thingsDBProfile{}, itemsProfile{}, listsProfile{}, genericProfile{},
	todoistProfile{}, tickTickProfile{}, linearProfile{}, csvProfile{}}

// formatAliases are format names that select a profile for a container: a
// Todoist backup is a ZIP of todoist-csv files.
var formatAliases = map[string]string{todoistBackupFormat: todoistFormat}

// formatProfile maps a requested format to the profile that reads its files.
func formatProfile(format string) string {
	if p, ok := formatAliases[format]; ok {
		return p
	}
	return format
}

// ProfileNames returns the identifiers of every supported format.
func ProfileNames() []string {
	out := make([]string, 0, len(Profiles)+len(formatAliases))
	for _, p := range Profiles {
		out = append(out, p.Name())
		for alias, target := range formatAliases {
			if target == p.Name() {
				out = append(out, alias)
			}
		}
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
		override = formatProfile(override)
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

// Parse detects and reads a file; a ZIP is read as a container of files.
func Parse(data []byte, opts Options) (*Parsed, error) {
	if opts.exportedAt.IsZero() {
		opts.exportedAt = time.Now()
	}
	if isZip(data) {
		return parseArchive(data, opts)
	}
	p, err := Detect(data, opts.Format)
	if err != nil {
		return nil, err
	}
	return parseOne(p, data, opts)
}

// parseOne reads one file with a known profile.
func parseOne(p Profile, data []byte, opts Options) (*Parsed, error) {
	parsed, err := p.Read(bytes.NewReader(trimBOM(data)), opts)
	if err != nil {
		return nil, err
	}
	parsed.Format = p.Name()
	if len(parsed.Rows) > MaxRows {
		return nil, ErrTooManyRows
	}
	// A parked row with a date keeps the date (someday-and-evening D9).
	for i := range parsed.Rows {
		if r := &parsed.Rows[i]; r.Start == "someday" && r.Due != nil {
			r.Start = ""
			r.warn("Someday dropped (the task has a due date)")
		}
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
	// Sections is "section" (default: a section of the task's project), "label"
	// (a section becomes a label) or "ignore".
	Sections string `json:"sections,omitempty"`
	// Duplicates is "skip" (default) or "import" for possible duplicates.
	Duplicates string `json:"duplicates,omitempty"`
	// Errors is "skip_rows" (default) or "abort".
	Errors string `json:"errors,omitempty"`
	// Existing applies to own-export rows whose id exists: "skip" (default) or "overwrite".
	Existing string `json:"existing,omitempty"`

	loc *time.Location
	// Set by the Service for one preview or job, never by the client:
	maxBytes      int64     // upload limit, which bounds unpacked archives
	tempDir       string    // where an uploaded database is copied to be read
	exportedAt    time.Time // reference date for dates written without a year
	importerEmail string    // the importing account's email (Linear assignees)
	entryName     string    // archive entry being read
	thingsWAL     []byte    // a Things database's WAL from the same archive
	// ownFiles are the attachment files of an own ZIP export, by attachment id.
	ownFiles map[string][]byte
}

// DefaultMaxBytes is the upload limit when the Service was not told another.
const DefaultMaxBytes = 20 << 20

func (o Options) maxBytesOrDefault() int64 {
	if o.maxBytes > 0 {
		return o.maxBytes
	}
	return DefaultMaxBytes
}

// Normalize fills defaults and validates every option except TargetProject, which
// needs the user's data (see Service).
func (o *Options) Normalize() error {
	o.Format = strings.TrimSpace(o.Format)
	if o.Format == "auto" {
		o.Format = ""
	}
	if o.Format != "" {
		if _, err := Detect(nil, formatProfile(o.Format)); err != nil {
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
	if err := oneOf(&o.Sections, "sections", "section", "label", "ignore"); err != nil {
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
