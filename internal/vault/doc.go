package vault

import (
	"regexp"
	"strings"
)

// A Doc is one parsed project file (design D3, D5, D8): front matter, then
// blocks (the part before the first section heading, then one per section),
// each holding prose chunks and task trees in file order.
type Doc struct {
	// Front holds the front matter lines the vault does not own, in order.
	Front    []string
	HasFront bool
	ID       string
	Color    string
	Icon     string
	Blocks   []*Block
}

// Block is the part of a file before the first section heading (Section "")
// or one `## heading` and what follows it.
type Block struct {
	Heading bool
	Section string
	Items   []Item
}

// Item is a prose chunk or a top-level task tree.
type Item struct {
	Prose []string
	Task  *Node
}

// Node is a task line with its note and subtasks.
type Node struct {
	Line     Line
	Note     []string
	Children []*Node
	// Raw is the line as written, for the conflict file.
	Raw string
}

// Owned front-matter keys.
const (
	keyID    = "opentodo-id"
	keyColor = "opentodo-color"
	keyIcon  = "opentodo-icon"
)

var (
	headingRe    = regexp.MustCompile(`^##[ \t]+(.+?)[ \t]*#*[ \t]*$`)
	anyHeadingRe = regexp.MustCompile(`^#{1,6}[ \t]`)
	frontKeyRe   = regexp.MustCompile(`^([A-Za-z0-9_-]+):[ \t]*(.*)$`)
)

// unquote strips YAML quotes from a scalar.
func unquote(v string) string {
	v = strings.TrimSpace(v)
	if len(v) >= 2 && (v[0] == '"' && v[len(v)-1] == '"' || v[0] == '\'' && v[len(v)-1] == '\'') {
		return v[1 : len(v)-1]
	}
	return v
}

// ParseDoc parses a project file. isSection reports whether a heading names a
// section of the file's project; a `##` heading is a section heading when it
// does or when task lines follow it before the next heading, otherwise it is
// prose.
func ParseDoc(text string, isSection func(name string) bool) *Doc {
	text = strings.ReplaceAll(text, "\r\n", "\n")
	lines := strings.Split(text, "\n")
	if len(lines) > 0 && lines[len(lines)-1] == "" {
		lines = lines[:len(lines)-1]
	}
	d := &Doc{}
	i := 0
	if len(lines) > 0 && strings.TrimSpace(lines[0]) == "---" {
		for j := 1; j < len(lines); j++ {
			if strings.TrimSpace(lines[j]) == "---" {
				d.HasFront = true
				for _, l := range lines[1:j] {
					m := frontKeyRe.FindStringSubmatch(l)
					switch {
					case m != nil && m[1] == keyID:
						d.ID = unquote(m[2])
					case m != nil && m[1] == keyColor:
						d.Color = unquote(m[2])
					case m != nil && m[1] == keyIcon:
						d.Icon = unquote(m[2])
					default:
						d.Front = append(d.Front, l)
					}
				}
				i = j + 1
				break
			}
		}
	}
	body := lines[i:]
	block := &Block{}
	d.Blocks = append(d.Blocks, block)
	var prose []string
	flushProse := func() {
		// Blank lines around a chunk are layout, not content.
		for len(prose) > 0 && strings.TrimSpace(prose[0]) == "" {
			prose = prose[1:]
		}
		for len(prose) > 0 && strings.TrimSpace(prose[len(prose)-1]) == "" {
			prose = prose[:len(prose)-1]
		}
		if len(prose) > 0 {
			block.Items = append(block.Items, Item{Prose: prose})
		}
		prose = nil
	}
	var stack []frame
	for k := 0; k < len(body); k++ {
		line := body[k]
		if m := headingRe.FindStringSubmatch(line); m != nil {
			name := strings.TrimSpace(m[1])
			if isSection != nil && isSection(name) || tasksFollow(body[k+1:]) {
				flushProse()
				stack = nil
				block = &Block{Heading: true, Section: name}
				d.Blocks = append(d.Blocks, block)
				continue
			}
		}
		if indent, done, content, ok := isTaskLine(line); ok {
			w := widthOf(indent)
			for len(stack) > 0 && stack[len(stack)-1].width >= w {
				stack = stack[:len(stack)-1]
			}
			n := &Node{Line: ParseLine(indent, done, content), Raw: line}
			if len(stack) == 0 {
				flushProse()
				block.Items = append(block.Items, Item{Task: n})
			} else {
				parent := stack[len(stack)-1].node
				parent.Children = append(parent.Children, n)
			}
			stack = append(stack, frame{n, w})
			continue
		}
		// A line indented under an open task (or a blank line followed by one)
		// belongs to the deepest task it is indented under: that task's note.
		if len(stack) > 0 {
			target, skip := noteTarget(line, body[k+1:], stack)
			if skip {
				continue
			}
			if target >= 0 {
				f := stack[target]
				stack = stack[:target+1]
				f.node.Note = append(f.node.Note, line)
				continue
			}
			stack = nil
		}
		prose = append(prose, line)
	}
	flushProse()
	for _, b := range d.Blocks {
		for _, it := range b.Items {
			if it.Task != nil {
				finishNotes(it.Task)
			}
		}
	}
	return d
}

// tasksFollow reports whether a task line comes before the next heading.
func tasksFollow(rest []string) bool {
	for _, l := range rest {
		if anyHeadingRe.MatchString(l) {
			return false
		}
		if _, _, _, ok := isTaskLine(l); ok {
			return true
		}
	}
	return false
}

// frame is an open task line and its indentation width while parsing.
type frame struct {
	node  *Node
	width int
}

// noteTarget returns the index in stack of the task a non-task line is a note
// of, or -1 when it is not indented under any. A blank line belongs to the
// note when the next non-blank line does; a blank line before an indented
// subtask is layout and skipped.
func noteTarget(line string, rest []string, stack []frame) (int, bool) {
	probe := line
	if strings.TrimSpace(line) == "" {
		probe = ""
		for _, l := range rest {
			if strings.TrimSpace(l) != "" {
				probe = l
				break
			}
		}
		if probe == "" {
			return -1, false
		}
		if _, _, _, ok := isTaskLine(probe); ok {
			// A blank line between subtasks is layout, kept out of notes.
			pw := widthOf(leadingSpace(probe))
			return -1, pw > 0 && pw > stack[0].width
		}
	}
	w := widthOf(leadingSpace(probe))
	for i := len(stack) - 1; i >= 0; i-- {
		if w > stack[i].width {
			return i, false
		}
	}
	return -1, false
}

func leadingSpace(s string) string {
	return s[:len(s)-len(strings.TrimLeft(s, " \t"))]
}

// finishNotes trims each note's blank edges, removes the indentation the
// printer adds and turns `* [ ]` back into `- [ ]` (the printer writes a note's
// checklist with `*` so it is never read as subtasks).
func finishNotes(n *Node) {
	for len(n.Note) > 0 && strings.TrimSpace(n.Note[len(n.Note)-1]) == "" {
		n.Note = n.Note[:len(n.Note)-1]
	}
	width := widthOf(n.Line.Indent) + 2
	for i, l := range n.Note {
		n.Note[i] = noteFromFile(dedent(l, width))
	}
	for _, c := range n.Children {
		finishNotes(c)
	}
}

// dedent removes up to width columns of indentation.
func dedent(s string, width int) string {
	w := 0
	for i, r := range s {
		if w >= width {
			return s[i:]
		}
		switch r {
		case ' ':
			w++
		case '\t':
			w += 2
		default:
			return s[i:]
		}
	}
	return ""
}

var (
	noteDashBox = regexp.MustCompile(`^([ \t]*)- \[([ xX])\]`)
	noteStarBox = regexp.MustCompile(`^([ \t]*)\* \[([ xX])\]`)
)

func noteToFile(s string) string   { return noteDashBox.ReplaceAllString(s, "$1* [$2]") }
func noteFromFile(s string) string { return noteStarBox.ReplaceAllString(s, "$1- [$2]") }

// NoteText is a task's note as Markdown.
func (n *Node) NoteText() string { return strings.Join(n.Note, "\n") }

// Print writes a document: front matter, then each block's heading, prose
// chunks and task runs separated by one blank line (design D8).
func (d *Doc) Print() string {
	var b strings.Builder
	if d.HasFront || d.ID != "" {
		b.WriteString("---\n")
		if d.ID != "" {
			b.WriteString(keyID + ": " + d.ID + "\n")
		}
		if d.Color != "" {
			b.WriteString(keyColor + ": \"" + d.Color + "\"\n")
		}
		if d.Icon != "" {
			b.WriteString(keyIcon + ": " + d.Icon + "\n")
		}
		for _, l := range d.Front {
			b.WriteString(l + "\n")
		}
		b.WriteString("---\n")
	}
	var chunks []string
	for _, bl := range d.Blocks {
		if bl.Heading {
			chunks = append(chunks, "## "+bl.Section)
		}
		var run []string
		flushRun := func() {
			if len(run) > 0 {
				chunks = append(chunks, strings.Join(run, "\n"))
				run = nil
			}
		}
		for _, it := range bl.Items {
			if it.Task != nil {
				run = append(run, printNode(it.Task, 0)...)
				continue
			}
			flushRun()
			chunks = append(chunks, strings.Join(it.Prose, "\n"))
		}
		flushRun()
	}
	if len(chunks) > 0 {
		if b.Len() > 0 {
			b.WriteString("\n")
		}
		b.WriteString(strings.Join(chunks, "\n\n"))
		b.WriteString("\n")
	}
	return b.String()
}

// printNode writes a task line, its note and its subtasks.
func printNode(n *Node, depth int) []string {
	indent := strings.Repeat("  ", depth)
	l := n.Line
	l.Indent = indent
	out := []string{PrintLine(l)}
	for _, nl := range n.Note {
		if strings.TrimSpace(nl) == "" {
			out = append(out, "")
			continue
		}
		out = append(out, indent+"  "+noteToFile(nl))
	}
	for _, c := range n.Children {
		out = append(out, printNode(c, depth+1)...)
	}
	return out
}

// Walk visits every task node of a document with its block and parent.
func (d *Doc) Walk(fn func(b *Block, parent, n *Node)) {
	var visit func(b *Block, parent, n *Node)
	visit = func(b *Block, parent, n *Node) {
		fn(b, parent, n)
		for _, c := range n.Children {
			visit(b, n, c)
		}
	}
	for _, b := range d.Blocks {
		for _, it := range b.Items {
			if it.Task != nil {
				visit(b, nil, it.Task)
			}
		}
	}
}
