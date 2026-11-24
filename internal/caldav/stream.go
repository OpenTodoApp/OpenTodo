package caldav

import (
	"bufio"
	"bytes"
	"errors"
	"fmt"
	"io"
	"strings"
	"unicode/utf8"

	"github.com/OpenTodoApp/opentodo/internal/textutil"
)

// ErrTooLarge is a stream longer than its byte limit.
var ErrTooLarge = errors.New("calendar data too large")

// builder turns logical content lines into a component tree. With emit set,
// each finished child of the root goes to emit instead of into the tree, so a
// stream holds one child at a time.
type builder struct {
	root  *Component
	stack []*Component
	emit  func(root, child *Component) error
	// Bounds of one child of the root, and of the root's own properties in
	// all, when streaming; zero means no bound. The child's count starts again
	// at each child; the root's runs over the whole stream, since the root's
	// properties are kept until the end.
	partLines, partBytes int
	lines, bytes         int
	rootLines, rootBytes int
}

func (b *builder) add(line string) error {
	p, err := ParseLine(line)
	if err != nil {
		return err
	}
	if b.emit != nil && b.partLines > 0 {
		b.lines++
		b.bytes += len(line)
		if b.lines > b.partLines || b.bytes > b.partBytes {
			return fmt.Errorf("%w: a component is too large", ErrInvalid)
		}
	}
	switch p.Name {
	case "BEGIN":
		name := strings.ToUpper(strings.TrimSpace(p.Value))
		if !validName(name) {
			return fmt.Errorf("%w: bad component name", ErrInvalid)
		}
		if b.root != nil && len(b.stack) == 0 {
			return fmt.Errorf("%w: content after the calendar object", ErrInvalid)
		}
		if len(b.stack) >= maxDepth {
			return fmt.Errorf("%w: nested too deeply", ErrInvalid)
		}
		c := &Component{Name: name}
		switch {
		case len(b.stack) == 0:
			b.root = c
		case len(b.stack) == 1 && b.emit != nil:
			b.lines, b.bytes = 1, len(line) // a new child starts its own budget
		default:
			parent := b.stack[len(b.stack)-1]
			parent.Children = append(parent.Children, c)
		}
		b.stack = append(b.stack, c)
	case "END":
		name := strings.ToUpper(strings.TrimSpace(p.Value))
		if len(b.stack) == 0 || b.stack[len(b.stack)-1].Name != name {
			return fmt.Errorf("%w: unbalanced END:%s", ErrInvalid, textutil.Truncate(name, 40))
		}
		done := b.stack[len(b.stack)-1]
		b.stack = b.stack[:len(b.stack)-1]
		if len(b.stack) == 1 && b.emit != nil {
			b.lines, b.bytes = 0, 0
			return b.emit(b.root, done)
		}
	default:
		if len(b.stack) == 0 {
			return fmt.Errorf("%w: property outside a component", ErrInvalid)
		}
		if len(b.stack) == 1 && b.emit != nil && b.partLines > 0 {
			b.rootLines++
			b.rootBytes += len(line)
			if b.rootLines > b.partLines || b.rootBytes > b.partBytes {
				return fmt.Errorf("%w: too many calendar properties", ErrTooLarge)
			}
		}
		cur := b.stack[len(b.stack)-1]
		cur.Props = append(cur.Props, p)
	}
	return nil
}

func (b *builder) finish() (*Component, error) {
	if b.root == nil || len(b.stack) != 0 {
		return nil, fmt.Errorf("%w: incomplete calendar object", ErrInvalid)
	}
	if b.root.Name != "VCALENDAR" {
		return nil, fmt.Errorf("%w: expected VCALENDAR, got %s", ErrInvalid, textutil.Truncate(b.root.Name, 40))
	}
	return b.root, nil
}

// StreamLimits bounds a streamed parse: the bytes read in all, the content
// lines and bytes of each child of the root, and those of the root's own
// properties in all (ErrTooLarge past them).
type StreamLimits struct {
	Bytes, PartLines, PartBytes int
}

// Stream reads one iCalendar object from r as it arrives (OpenSpec change
// calendar-feed-large-calendars): each finished child of the VCALENDAR (a
// VEVENT, a VTIMEZONE) is handed to child, with the root and the properties
// read so far, and not kept, so memory holds one child at a time whatever the
// size of the stream. It returns the root with
// its own properties and no children. More than lim.Bytes is ErrTooLarge; a
// read error is returned as it is; malformed data wraps ErrInvalid, like Parse.
func Stream(r io.Reader, lim StreamLimits, child func(root, child *Component) error) (*Component, error) {
	lr := &io.LimitedReader{R: r, N: int64(lim.Bytes) + 1}
	sc := bufio.NewScanner(lr)
	sc.Buffer(make([]byte, 0, 64<<10), MaxLineBytes+2)
	sc.Split(splitLines)
	b := &builder{emit: child, partLines: lim.PartLines, partBytes: lim.PartBytes}
	var cur strings.Builder
	have, first := false, true
	flush := func() error {
		if !have {
			return nil
		}
		have = false
		line := cur.String()
		cur.Reset()
		return b.add(line)
	}
	for sc.Scan() {
		line := sc.Bytes()
		if first {
			line, first = bytes.TrimPrefix(line, []byte("\xef\xbb\xbf")), false
		}
		if !utf8.Valid(line) {
			return nil, fmt.Errorf("%w: not UTF-8", ErrInvalid)
		}
		if len(line) > 0 && (line[0] == ' ' || line[0] == '\t') && have {
			if cur.Len()+len(line)-1 > MaxLineBytes {
				return nil, fmt.Errorf("%w: content line longer than %d bytes", ErrInvalid, MaxLineBytes)
			}
			cur.Write(line[1:])
			continue
		}
		if len(bytes.TrimSpace(line)) == 0 {
			continue
		}
		if err := flush(); err != nil {
			return nil, err
		}
		if len(line) > MaxLineBytes {
			return nil, fmt.Errorf("%w: content line longer than %d bytes", ErrInvalid, MaxLineBytes)
		}
		cur.Write(line)
		have = true
	}
	if lr.N <= 0 {
		return nil, fmt.Errorf("%w: more than %d bytes", ErrTooLarge, lim.Bytes)
	}
	if err := sc.Err(); err != nil {
		if errors.Is(err, bufio.ErrTooLong) {
			return nil, fmt.Errorf("%w: content line longer than %d bytes", ErrInvalid, MaxLineBytes)
		}
		return nil, err
	}
	if err := flush(); err != nil {
		return nil, err
	}
	return b.finish()
}

// splitLines splits at CRLF, LF or a lone CR, like Unfold.
func splitLines(data []byte, atEOF bool) (int, []byte, error) {
	i := bytes.IndexAny(data, "\r\n")
	switch {
	case i < 0:
		if atEOF && len(data) > 0 {
			return len(data), data, nil
		}
		return 0, nil, nil
	case data[i] == '\n':
		return i + 1, data[:i], nil
	case i+1 < len(data):
		if data[i+1] == '\n' {
			return i + 2, data[:i], nil
		}
		return i + 1, data[:i], nil
	case atEOF:
		return i + 1, data[:i], nil
	}
	return 0, nil, nil // a CR at the end of the buffer: is LF next?
}
