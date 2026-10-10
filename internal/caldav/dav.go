package caldav

import (
	"bytes"
	"encoding/xml"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
)

// XML namespaces used by WebDAV, CalDAV and the client extensions we answer.
const (
	NSDAV    = "DAV:"
	NSCalDAV = "urn:ietf:params:xml:ns:caldav"
	NSCS     = "http://calendarserver.org/ns/"
	NSApple  = "http://apple.com/ns/ical/"
)

var prefixes = map[string]string{NSDAV: "d", NSCalDAV: "c", NSCS: "cs", NSApple: "ic"}

// MaxXMLBytes bounds a WebDAV request body.
const MaxXMLBytes = 1 << 20

// Node is a parsed XML element.
type Node struct {
	Space, Local string
	Attrs        []xml.Attr
	Children     []*Node
	Text         string
}

// Is reports whether the element has the given namespace and local name.
func (n *Node) Is(space, local string) bool { return n != nil && n.Space == space && n.Local == local }

// Child returns the first child with the given name, or nil.
func (n *Node) Child(space, local string) *Node {
	if n == nil {
		return nil
	}
	for _, c := range n.Children {
		if c.Is(space, local) {
			return c
		}
	}
	return nil
}

// Attr returns an attribute value by local name ("" when absent).
func (n *Node) Attr(local string) string {
	for _, a := range n.Attrs {
		if a.Name.Local == local {
			return a.Value
		}
	}
	return ""
}

// ErrBadXML wraps request bodies that are not well-formed XML.
var ErrBadXML = errors.New("malformed XML body")

// ParseXML reads one XML document into a tree. An empty body returns nil, nil.
func ParseXML(r io.Reader) (*Node, error) {
	data, err := io.ReadAll(io.LimitReader(r, MaxXMLBytes+1))
	if err != nil {
		return nil, err
	}
	if len(data) > MaxXMLBytes {
		return nil, fmt.Errorf("%w: too large", ErrBadXML)
	}
	if len(bytes.TrimSpace(data)) == 0 {
		return nil, nil
	}
	dec := xml.NewDecoder(bytes.NewReader(data))
	dec.Strict = true
	var root *Node
	var stack []*Node
	for {
		tok, err := dec.Token()
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil, fmt.Errorf("%w: %v", ErrBadXML, err)
		}
		switch t := tok.(type) {
		case xml.StartElement:
			if len(stack) > 32 {
				return nil, fmt.Errorf("%w: nested too deeply", ErrBadXML)
			}
			n := &Node{Space: t.Name.Space, Local: t.Name.Local, Attrs: t.Attr}
			if len(stack) == 0 {
				if root != nil {
					return nil, fmt.Errorf("%w: several root elements", ErrBadXML)
				}
				root = n
			} else {
				p := stack[len(stack)-1]
				p.Children = append(p.Children, n)
			}
			stack = append(stack, n)
		case xml.EndElement:
			stack = stack[:len(stack)-1]
		case xml.CharData:
			if len(stack) > 0 {
				stack[len(stack)-1].Text += string(t)
			}
		}
	}
	if root == nil {
		return nil, fmt.Errorf("%w: no root element", ErrBadXML)
	}
	return root, nil
}

// PropName identifies a property.
type PropName struct{ Space, Local string }

// Prop is a property value: Inner is the element's content as XML text written
// with the multistatus prefixes (d:, c:, cs:, ic:), already escaped.
type PropValue struct {
	Name  PropName
	Inner string
}

// textEscaper escapes element content. Quotes stay literal (valid in content)
// so ETags read "abc" even for clients that compare without decoding entities;
// carriage returns are kept as references so calendar data survives parsing.
var textEscaper = strings.NewReplacer("&", "&amp;", "<", "&lt;", ">", "&gt;", "\r", "&#xD;")

// Esc escapes text for element content.
func Esc(s string) string { return textEscaper.Replace(s) }

// escAttr escapes text for a double-quoted attribute value.
func escAttr(s string) string {
	var b strings.Builder
	_ = xml.EscapeText(&b, []byte(s))
	return b.String()
}

// Href renders a d:href element.
func Href(h string) string { return "<d:href>" + Esc(h) + "</d:href>" }

func openTag(n PropName) (open, close string) {
	if p, ok := prefixes[n.Space]; ok {
		return "<" + p + ":" + n.Local, "</" + p + ":" + n.Local + ">"
	}
	return `<x:` + n.Local + ` xmlns:x="` + escAttr(n.Space) + `"`, "</x:" + n.Local + ">"
}

func writeProp(b *bytes.Buffer, v PropValue) {
	open, close := openTag(v.Name)
	if v.Inner == "" {
		b.WriteString(open + "/>")
		return
	}
	b.WriteString(open + ">" + v.Inner + close)
}

// Multistatus builds a 207 response body.
type Multistatus struct {
	b         bytes.Buffer
	syncToken string
}

// NewMultistatus starts a multistatus document.
func NewMultistatus() *Multistatus {
	m := &Multistatus{}
	m.b.WriteString(`<?xml version="1.0" encoding="utf-8"?>` + "\n")
	m.b.WriteString(`<d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:cs="http://calendarserver.org/ns/" xmlns:ic="http://apple.com/ns/ical/">`)
	return m
}

// Response adds one resource with its found properties (200) and the requested
// ones it does not have (404).
func (m *Multistatus) Response(href string, found []PropValue, missing []PropName) {
	m.b.WriteString("<d:response>" + Href(href))
	if len(found) > 0 {
		m.b.WriteString("<d:propstat><d:prop>")
		for _, v := range found {
			writeProp(&m.b, v)
		}
		m.b.WriteString("</d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat>")
	}
	m.status(missing, http.StatusNotFound)
	if len(found) == 0 && len(missing) == 0 {
		m.b.WriteString("<d:propstat><d:prop/><d:status>HTTP/1.1 200 OK</d:status></d:propstat>")
	}
	m.b.WriteString("</d:response>")
}

// PropStatus adds one resource whose listed properties all have one status
// (PROPPATCH results).
func (m *Multistatus) PropStatus(href string, groups map[int][]PropName) {
	m.b.WriteString("<d:response>" + Href(href))
	for _, code := range []int{200, 403, 404, 409, 424} {
		m.status(groups[code], code)
	}
	m.b.WriteString("</d:response>")
}

func (m *Multistatus) status(names []PropName, code int) {
	if len(names) == 0 {
		return
	}
	m.b.WriteString("<d:propstat><d:prop>")
	for _, n := range names {
		writeProp(&m.b, PropValue{Name: n})
	}
	m.b.WriteString(fmt.Sprintf("</d:prop><d:status>HTTP/1.1 %d %s</d:status></d:propstat>", code, http.StatusText(code)))
}

// Status adds a resource reported with a bare status (404 for removed members
// of a sync-collection report).
func (m *Multistatus) Status(href string, code int) {
	m.b.WriteString("<d:response>" + Href(href))
	m.b.WriteString(fmt.Sprintf("<d:status>HTTP/1.1 %d %s</d:status></d:response>", code, http.StatusText(code)))
}

// SyncToken sets the sync-token element written at the end (sync-collection).
func (m *Multistatus) SyncToken(tok string) { m.syncToken = tok }

// Bytes closes the document and returns it.
func (m *Multistatus) Bytes() []byte {
	if m.syncToken != "" {
		m.b.WriteString("<d:sync-token>" + Esc(m.syncToken) + "</d:sync-token>")
	}
	m.b.WriteString("</d:multistatus>")
	return m.b.Bytes()
}

// ErrorBody renders a WebDAV precondition error (RFC 4918 16) for one element
// in the DAV: or CalDAV namespace, e.g. ("c", "supported-calendar-component").
func ErrorBody(prefix, element string) []byte {
	return []byte(`<?xml version="1.0" encoding="utf-8"?>` + "\n" +
		`<d:error xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><` + prefix + ":" + element + "/></d:error>")
}

// RequestedProps lists the properties a PROPFIND or REPORT asks for. allprop
// is true for <allprop/> or an empty PROPFIND body; names is nil then.
func RequestedProps(root *Node) (names []PropName, allprop bool) {
	if root == nil {
		return nil, true
	}
	if root.Child(NSDAV, "allprop") != nil {
		return nil, true
	}
	if root.Child(NSDAV, "propname") != nil {
		return nil, true
	}
	p := root.Child(NSDAV, "prop")
	if p == nil {
		return nil, true
	}
	for _, c := range p.Children {
		names = append(names, PropName{c.Space, c.Local})
	}
	return names, false
}
