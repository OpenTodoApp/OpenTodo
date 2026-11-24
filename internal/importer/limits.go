package importer

import (
	"bytes"
	"encoding/csv"
	"errors"
	"fmt"
	"io"
	"strings"
)

// Shape limits (OpenSpec change `importer-field-limits`). The file size limit
// (OPENTODO_IMPORT_MAX_MB) and MaxRows bound a file as a whole; these bound
// what one record or one document may hold, so a valid but hostile file stays
// bounded in memory once parsed. They are far above anything an app exports:
// a stored text value is at most 64 KiB and a document 256 KiB.
const (
	// MaxCSVFieldBytes is the most one CSV field may hold.
	MaxCSVFieldBytes = 1 << 20
	// MaxCSVRecordBytes is the most the fields of one CSV record may hold together.
	MaxCSVRecordBytes = 4 << 20
	// MaxCSVFields is the most fields one CSV record may have.
	MaxCSVFields = 1000
	// MaxJSONDepth is the deepest nesting of objects and arrays a JSON file
	// may have.
	MaxJSONDepth = 256
)

// LimitError means a file is within the size limit but one of its records or
// its nesting is over a shape limit. The HTTP layer answers it like a file
// over the size limit (413 too_large); the message names the limit and, for
// CSV, the line.
type LimitError struct{ Msg string }

func (e *LimitError) Error() string { return e.Msg }

// csvReader is encoding/csv's reader with the shape limits checked on every
// record it returns. Profiles set Comma, LazyQuotes and the rest through the
// embedded reader as before.
type csvReader struct {
	*csv.Reader
}

// newCSVReader reads CSV records from data.
func newCSVReader(data []byte) *csvReader {
	return &csvReader{csv.NewReader(bytes.NewReader(data))}
}

// Read returns the next record, or a *LimitError for a record over a limit.
func (r *csvReader) Read() ([]string, error) {
	rec, err := r.Reader.Read()
	if err != nil {
		return rec, err
	}
	if err := checkCSVRecord(rec, func() int { line, _ := r.FieldPos(0); return line }); err != nil {
		return nil, err
	}
	return rec, nil
}

func checkCSVRecord(rec []string, line func() int) error {
	if len(rec) > MaxCSVFields {
		return &LimitError{fmt.Sprintf("line %d has %d fields; a CSV record may have at most %d", line(), len(rec), MaxCSVFields)}
	}
	total := 0
	for _, f := range rec {
		if len(f) > MaxCSVFieldBytes {
			return &LimitError{fmt.Sprintf("line %d has a field of %d bytes; a CSV field may hold at most %d (1 MiB)", line(), len(f), MaxCSVFieldBytes)}
		}
		total += len(f)
	}
	if total > MaxCSVRecordBytes {
		return &LimitError{fmt.Sprintf("line %d holds %d bytes; a CSV record may hold at most %d (4 MiB)", line(), total, MaxCSVRecordBytes)}
	}
	return nil
}

// csvFailure turns an error of csvReader.Read that is not a per-record parse
// error into the error a profile returns: a limit error as it is, anything
// else as a file error about the CSV "file" or "header".
func csvFailure(err error, what string) error {
	var le *LimitError
	if errors.As(err, &le) {
		return le
	}
	return &FileError{fmt.Sprintf("cannot read the CSV %s: %v", what, err)}
}

// eachRecord reads r to its end and skips blank records. A record encoding/csv
// cannot parse becomes an error row appended to bad. fn gets every other record
// with its line and get, which returns a trimmed cell by its column in col ("" when
// the record has no such cell); an error from fn stops the reading.
func (r *csvReader) eachRecord(col map[string]int, bad *[]Row, fn func(line int, rec []string, get func(string) string) error) error {
	for {
		rec, err := r.Read()
		if errors.Is(err, io.EOF) {
			return nil
		}
		if err != nil {
			var pe *csv.ParseError
			if errors.As(err, &pe) {
				*bad = append(*bad, Row{Line: pe.StartLine, Kind: KindTask, Err: fmt.Sprintf("unreadable CSV record: %v", pe.Err)})
				continue
			}
			return csvFailure(err, "file")
		}
		if allBlank(rec) {
			continue
		}
		line, _ := r.FieldPos(0)
		get := func(c string) string {
			if i, ok := col[c]; ok && i < len(rec) {
				return strings.TrimSpace(rec[i])
			}
			return ""
		}
		if err := fn(line, rec, get); err != nil {
			return err
		}
	}
}

// checkJSONDepth refuses a JSON text nested deeper than MaxJSONDepth. It scans
// the bytes once without allocating and ignores brackets inside strings; data
// that is not JSON passes, and its profile reports it.
func checkJSONDepth(data []byte) error {
	depth, inString, escaped := 0, false, false
	for _, c := range data {
		if inString {
			switch {
			case escaped:
				escaped = false
			case c == '\\':
				escaped = true
			case c == '"':
				inString = false
			}
			continue
		}
		switch c {
		case '"':
			inString = true
		case '{', '[':
			depth++
			if depth > MaxJSONDepth {
				return &LimitError{fmt.Sprintf("the JSON file is nested more than %d levels deep", MaxJSONDepth)}
			}
		case '}', ']':
			if depth > 0 {
				depth--
			}
		}
	}
	return nil
}

// checkShape applies the limits that hold for a whole file before any profile
// reads it: today the JSON nesting depth. CSV records are checked as they are
// read (csvReader).
func checkShape(data []byte) error {
	if looksLikeJSON(data) {
		return checkJSONDepth(data)
	}
	return nil
}

// looksLikeJSON reports whether data starts, after white space, with an
// object or an array.
func looksLikeJSON(data []byte) bool {
	t := bytes.TrimLeft(trimBOM(data), " \t\r\n")
	return len(t) > 0 && (t[0] == '{' || t[0] == '[')
}
