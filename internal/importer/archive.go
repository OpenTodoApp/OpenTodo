package importer

import (
	"archive/zip"
	"bytes"
	"fmt"
	"io"
	"path"
	"strings"
	"time"
)

// ZIP uploads (OpenSpec change named-importers, design D2): a container, not a
// format. Entries are read in memory, never written to disk, under limits that
// keep a crafted archive from exhausting the server. All entries must be files of
// one format; a zipped "Things Database.thingsdatabase" folder hands its
// main.sqlite (and WAL) to the things-db profile.

const (
	// MaxArchiveEntries bounds the entries of an uploaded ZIP.
	MaxArchiveEntries = 1000
	// archiveExpansion bounds the unpacked size as a multiple of the upload limit.
	archiveExpansion = 10
)

func isZip(data []byte) bool { return bytes.HasPrefix(data, []byte("PK\x03\x04")) }

type archiveEntry struct {
	name string // path inside the archive
	data []byte
	mod  time.Time
}

// readArchive lists and reads the data entries of a ZIP within the limits.
func readArchive(data []byte, maxBytes int64) ([]archiveEntry, error) {
	zr, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		return nil, &FileError{fmt.Sprintf("not a readable ZIP archive: %v", err)}
	}
	if len(zr.File) > MaxArchiveEntries {
		return nil, &FileError{fmt.Sprintf("the archive has more than %d entries", MaxArchiveEntries)}
	}
	limit := maxBytes * archiveExpansion
	var declared uint64
	for _, f := range zr.File {
		declared += f.UncompressedSize64
	}
	if declared > uint64(limit) {
		return nil, &FileError{fmt.Sprintf("the archive is too large when unpacked (more than %d MB)", limit>>20)}
	}
	var out []archiveEntry
	var total int64
	for _, f := range zr.File {
		name := f.Name
		if f.FileInfo().IsDir() || strings.HasSuffix(name, "/") {
			continue
		}
		if strings.HasPrefix(name, "/") || strings.Contains(name, "\\") || containsDotDot(name) {
			return nil, &FileError{fmt.Sprintf("the archive contains an unsafe entry name %q", name)}
		}
		base := path.Base(name)
		if strings.HasPrefix(name, "__MACOSX/") || strings.HasPrefix(base, ".") {
			continue
		}
		rc, err := f.Open()
		if err != nil {
			return nil, &FileError{fmt.Sprintf("cannot read %s in the archive: %v", name, err)}
		}
		// The declared sizes can lie: enforce the limit on what is actually read.
		b, err := io.ReadAll(io.LimitReader(rc, limit-total+1))
		rc.Close()
		if err != nil {
			return nil, &FileError{fmt.Sprintf("cannot read %s in the archive: %v", name, err)}
		}
		total += int64(len(b))
		if total > limit {
			return nil, &FileError{fmt.Sprintf("the archive is too large when unpacked (more than %d MB)", limit>>20)}
		}
		out = append(out, archiveEntry{name: name, data: b, mod: f.Modified})
	}
	if len(out) == 0 {
		return nil, &FileError{"the archive contains no files"}
	}
	return out, nil
}

func containsDotDot(name string) bool {
	for _, part := range strings.Split(name, "/") {
		if part == ".." {
			return true
		}
	}
	return false
}

// parseArchive reads every entry with one profile and concatenates the rows.
func parseArchive(data []byte, opts Options) (*Parsed, error) {
	entries, err := readArchive(data, opts.maxBytesOrDefault())
	if err != nil {
		return nil, err
	}
	// The newest entry time is when the export was made: Todoist dates without a
	// year take it from there.
	for _, e := range entries {
		if e.mod.After(opts.exportedAt) && e.mod.Year() > 1980 {
			opts.exportedAt = e.mod
		}
	}
	// A zipped Things database folder.
	for _, e := range entries {
		if path.Base(e.name) == "main.sqlite" {
			for _, w := range entries {
				if path.Base(w.name) == "main.sqlite-wal" && path.Dir(w.name) == path.Dir(e.name) {
					opts.thingsWAL = w.data
				}
			}
			if opts.Format != "" && opts.Format != thingsFormat {
				return nil, &FileError{fmt.Sprintf("format %s does not match the archive (a Things database)", opts.Format)}
			}
			return parseOne(thingsDBProfile{}, e.data, opts)
		}
	}
	var prof Profile
	for _, e := range entries {
		p, err := Detect(e.data, formatProfile(opts.Format))
		if err != nil {
			return nil, &FileError{fmt.Sprintf("%s in the archive matches no supported format", e.name)}
		}
		if prof != nil && p.Name() != prof.Name() {
			return nil, &FileError{fmt.Sprintf("the archive mixes formats (%s and %s); upload one format at a time", prof.Name(), p.Name())}
		}
		prof = p
	}
	out := &Parsed{}
	for _, e := range entries {
		o := opts
		o.entryName = e.name
		parsed, err := parseOne(prof, e.data, o)
		if err != nil {
			return nil, fmt.Errorf("%s: %w", e.name, err)
		}
		for i := range parsed.Rows {
			parsed.Rows[i].File = path.Base(e.name)
		}
		out.Rows = append(out.Rows, parsed.Rows...)
		out.Notes = append(out.Notes, parsed.Notes...)
		out.Recognised = mergeNames(out.Recognised, parsed.Recognised)
		out.Ignored = mergeNames(out.Ignored, parsed.Ignored)
		out.ViewHints = append(out.ViewHints, parsed.ViewHints...)
		if len(out.Rows) > MaxRows {
			return nil, ErrTooManyRows
		}
	}
	out.Format = archiveFormat(prof.Name())
	return out, nil
}

// archiveFormat names the format of a ZIP of profile files (a Todoist backup).
func archiveFormat(profile string) string {
	if profile == todoistFormat {
		return todoistBackupFormat
	}
	return profile
}

func mergeNames(a, b []string) []string {
	seen := map[string]bool{}
	for _, s := range a {
		seen[s] = true
	}
	for _, s := range b {
		if !seen[s] {
			a = append(a, s)
			seen[s] = true
		}
	}
	return a
}
