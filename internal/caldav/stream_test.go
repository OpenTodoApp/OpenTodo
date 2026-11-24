package caldav

import (
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

// streamAll collects the children Stream hands over, to compare with Parse.
func streamAll(t *testing.T, data string, lim StreamLimits) (*Component, error) {
	t.Helper()
	var kids []*Component
	root, err := Stream(strings.NewReader(data), lim, func(_, c *Component) error {
		kids = append(kids, c)
		return nil
	})
	if root != nil {
		root.Children = kids
	}
	return root, err
}

var wide = StreamLimits{Bytes: 32 << 20, PartLines: maxProps, PartBytes: MaxBodyBytes}

func TestStreamMatchesParse(t *testing.T) {
	files, _ := filepath.Glob("testdata/*.ics")
	files2, _ := filepath.Glob("../calfeed/testdata/*.ics")
	inputs := []string{
		"\xef\xbb\xbfBEGIN:VCALENDAR\rX-A:1\r\nBEGIN:VEVENT\nUID:a\r\n  folded\r\n\tmore\r\n\r\nEND:VEVENT\r\nEND:VCALENDAR",
	}
	for _, p := range append(files, files2...) {
		b, err := os.ReadFile(p)
		if err != nil {
			t.Fatal(err)
		}
		inputs = append(inputs, string(b))
	}
	for i, in := range inputs {
		want, werr := Parse([]byte(in))
		got, gerr := streamAll(t, in, wide)
		if (werr == nil) != (gerr == nil) || werr == nil && !reflect.DeepEqual(want, got) {
			t.Errorf("input %d: Stream = %v, %v; Parse = %v, %v", i, got, gerr, want, werr)
		}
	}
}

func TestStreamRefuses(t *testing.T) {
	cal := func(body string) string { return "BEGIN:VCALENDAR\r\n" + body + "END:VCALENDAR\r\n" }
	cases := []struct {
		name string
		in   string
		lim  StreamLimits
		want error
	}{
		{"over the byte limit", cal(strings.Repeat("BEGIN:VEVENT\r\nUID:a\r\nEND:VEVENT\r\n", 100)), StreamLimits{Bytes: 1000, PartLines: 10, PartBytes: 1000}, ErrTooLarge},
		{"a component with too many lines", cal("BEGIN:VEVENT\r\n" + strings.Repeat("X-A:b\r\n", 20) + "END:VEVENT\r\n"), StreamLimits{Bytes: 1 << 20, PartLines: 10, PartBytes: 1 << 20}, ErrInvalid},
		{"a component with too many bytes", cal("BEGIN:VEVENT\r\nX-A:" + strings.Repeat("b", 2000) + "\r\nEND:VEVENT\r\n"), StreamLimits{Bytes: 1 << 20, PartLines: 10, PartBytes: 1000}, ErrInvalid},
		{"a long line", cal("X-A:" + strings.Repeat("b", MaxLineBytes+10) + "\r\n"), wide, ErrInvalid},
		{"a long folded line", cal("X-A:b\r\n" + strings.Repeat(" bbbbbbbbbb\r\n", MaxLineBytes/10+1)), wide, ErrInvalid},
		{"not UTF-8", cal("X-A:\xff\r\n"), wide, ErrInvalid},
		{"incomplete", "BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\n", wide, ErrInvalid},
		{"not a calendar", "<html></html>", wide, ErrInvalid},
		// The calendar's own properties have one budget for the whole stream: a
		// child in between does not start them a new one.
		{"calendar properties between children", cal(strings.Repeat("X-A:b\r\nBEGIN:VTIMEZONE\r\nEND:VTIMEZONE\r\n", 20)), StreamLimits{Bytes: 1 << 20, PartLines: 10, PartBytes: 1 << 20}, ErrTooLarge},
		{"calendar property bytes between children", cal(strings.Repeat("X-A:"+strings.Repeat("b", 100)+"\r\nBEGIN:VTIMEZONE\r\nEND:VTIMEZONE\r\n", 20)), StreamLimits{Bytes: 1 << 20, PartLines: 1000, PartBytes: 1000}, ErrTooLarge},
	}
	for _, c := range cases {
		if _, err := streamAll(t, c.in, c.lim); !errors.Is(err, c.want) {
			t.Errorf("%s: err = %v, want %v", c.name, err, c.want)
		}
	}
}

func TestStreamHoldsOneChild(t *testing.T) {
	in := "BEGIN:VCALENDAR\r\nX-WR-CALNAME:A\r\nBEGIN:VEVENT\r\nUID:1\r\nBEGIN:VALARM\r\nACTION:DISPLAY\r\nEND:VALARM\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nUID:2\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n"
	var uids []string
	root, err := Stream(strings.NewReader(in), wide, func(root, c *Component) error {
		if len(root.Children) != 0 || root.Prop("X-WR-CALNAME") == nil {
			t.Errorf("root while streaming = %+v", root)
		}
		uids = append(uids, c.Prop("UID").Value)
		if c.Prop("UID").Value == "1" && len(c.Children) != 1 {
			t.Errorf("the alarm is not inside its event: %+v", c)
		}
		return nil
	})
	if err != nil || len(root.Children) != 0 || strings.Join(uids, ",") != "1,2" {
		t.Fatalf("root %+v, uids %v, err %v", root, uids, err)
	}
}
