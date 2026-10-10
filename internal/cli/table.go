package cli

import (
	"fmt"
	"io"
	"strings"
	"unicode/utf8"
)

// ANSI styles used by the table. Applied only when colour is enabled.
const (
	styleNone = ""
	styleRed  = "\x1b[31m"
	styleBold = "\x1b[1m"
	styleDim  = "\x1b[2m"
	styleCyan = "\x1b[36m"
	reset     = "\x1b[0m"
)

type cell struct {
	text  string
	style string
}

func plain(s string) cell { return cell{text: s} }

// table is a fixed-width text table: header, rows, columns padded to the widest cell.
type table struct {
	header []string
	rows   [][]cell
}

func newTable(header ...string) *table { return &table{header: header} }

func (t *table) add(cells ...cell) { t.rows = append(t.rows, cells) }

func (t *table) render(w io.Writer, color bool) {
	widths := make([]int, len(t.header))
	for i, h := range t.header {
		widths[i] = utf8.RuneCountInString(h)
	}
	for _, r := range t.rows {
		for i, c := range r {
			if i < len(widths) && utf8.RuneCountInString(c.text) > widths[i] {
				widths[i] = utf8.RuneCountInString(c.text)
			}
		}
	}
	line := func(cells []cell) string {
		var b strings.Builder
		for i, c := range cells {
			if i > 0 {
				b.WriteString("  ")
			}
			text := c.text
			if i < len(cells)-1 {
				text += strings.Repeat(" ", widths[i]-utf8.RuneCountInString(c.text))
			}
			if color && c.style != "" {
				b.WriteString(c.style + text + reset)
			} else {
				b.WriteString(text)
			}
		}
		return strings.TrimRight(b.String(), " ")
	}
	hdr := make([]cell, len(t.header))
	for i, h := range t.header {
		hdr[i] = cell{text: h, style: styleDim}
	}
	fmt.Fprintln(w, line(hdr))
	for _, r := range t.rows {
		fmt.Fprintln(w, line(r))
	}
}

// shortID is the id prefix shown in tables; long enough to be unique in practice.
func shortID(id string) string {
	if len(id) > 8 {
		return id[:8]
	}
	return id
}
