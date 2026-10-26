package caldav

import (
	"bytes"
	"errors"
	"testing"
)

// FuzzParseXML: CalDAV request bodies (PROPFIND, REPORT, PROPPATCH) and the
// multistatus answers calendar sync reads both go through ParseXMLLimit. No
// panic; an error is ErrBadXML; a tree that parses has one root and stays
// within the nesting bound.
func FuzzParseXML(f *testing.F) {
	for _, s := range []string{
		`<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:getetag/><d:resourcetype/></d:prop></d:propfind>`,
		`<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><c:calendar-data/></d:prop><c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VTODO"><c:time-range start="20261001T000000Z"/></c:comp-filter></c:comp-filter></c:filter></c:calendar-query>`,
		`<d:multistatus xmlns:d="DAV:"><d:response><d:href>/a/</d:href><d:propstat><d:prop><d:displayname>A<!-- x --><![CDATA[&]]></d:displayname></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response><d:sync-token>t</d:sync-token></d:multistatus>`,
		`<a><b/></a><c/>`,
	} {
		f.Add([]byte(s))
	}
	f.Fuzz(func(t *testing.T, data []byte) {
		root, err := ParseXMLLimit(bytes.NewReader(data), MaxXMLBytes)
		if err != nil {
			if !errors.Is(err, ErrBadXML) {
				t.Fatalf("error %v is not ErrBadXML", err)
			}
			return
		}
		if root == nil {
			if len(bytes.TrimSpace(data)) != 0 {
				t.Fatal("no tree and no error for a non-empty body")
			}
			return
		}
		var depth func(n *Node, d int)
		depth = func(n *Node, d int) {
			if d > 34 {
				t.Fatalf("tree deeper than the nesting bound")
			}
			for _, c := range n.Children {
				depth(c, d+1)
			}
		}
		depth(root, 1)
	})
}
