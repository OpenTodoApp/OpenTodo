package caldav

import (
	"encoding/xml"
	"flag"
	"os"
	"strings"
	"testing"
)

var update = flag.Bool("update", false, "rewrite golden files")

func golden(t *testing.T, name string, got []byte) {
	t.Helper()
	path := "testdata/" + name
	if *update {
		if err := os.WriteFile(path, got, 0o644); err != nil {
			t.Fatal(err)
		}
	}
	want, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("%v (run with -update to create)", err)
	}
	if string(want) != string(got) {
		t.Fatalf("%s differs\nwant: %s\ngot:  %s", name, want, got)
	}
}

func TestMultistatusShape(t *testing.T) {
	m := NewMultistatus()
	m.Response("/dav/calendars/u1/inbox/", []PropValue{
		{Name: PropName{NSDAV, "resourcetype"}, Inner: "<d:collection/><c:calendar/>"},
		{Name: PropName{NSDAV, "displayname"}, Inner: Esc("Inbox & <more>")},
		{Name: PropName{NSCS, "getctag"}, Inner: "urn:opentodo:sync:7"},
	}, []PropName{{"http://example.com/ns/", "unknown"}})
	m.Response("/dav/calendars/u1/inbox/t%201.ics", []PropValue{{Name: PropName{NSDAV, "getetag"}, Inner: Esc(`"abc"`)}}, nil)
	m.Status("/dav/calendars/u1/inbox/gone.ics", 404)
	m.SyncToken("urn:opentodo:sync:8")
	out := m.Bytes()
	// Well-formed XML with one response per resource.
	if err := xml.Unmarshal(out, new(struct{})); err != nil {
		t.Fatalf("not XML: %v", err)
	}
	golden(t, "multistatus.golden.xml", out)

	p := NewMultistatus()
	p.PropStatus("/dav/calendars/u1/p1/", map[int][]PropName{200: {{NSDAV, "displayname"}}, 403: {{NSDAV, "resourcetype"}}})
	golden(t, "proppatch.golden.xml", p.Bytes())

	golden(t, "error.golden.xml", ErrorBody("c", "supported-calendar-component"))
}

func TestParseXMLRequests(t *testing.T) {
	body := `<?xml version="1.0"?>
<A:propfind xmlns:A="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav" xmlns:I="http://apple.com/ns/ical/">
  <A:prop><A:displayname/><C:calendar-home-set/><I:calendar-color/></A:prop>
</A:propfind>`
	n, err := ParseXML(strings.NewReader(body))
	if err != nil || !n.Is(NSDAV, "propfind") {
		t.Fatalf("%v %+v", err, n)
	}
	names, all := RequestedProps(n)
	if all || len(names) != 3 || names[1] != (PropName{NSCalDAV, "calendar-home-set"}) || names[2] != (PropName{NSApple, "calendar-color"}) {
		t.Fatalf("names %v all %v", names, all)
	}
	if n, err := ParseXML(strings.NewReader("")); n != nil || err != nil {
		t.Fatal("empty body is allprop")
	}
	if _, all := RequestedProps(nil); !all {
		t.Fatal("nil body must be allprop")
	}
	if _, err := ParseXML(strings.NewReader("<a><b></a>")); err == nil {
		t.Fatal("malformed XML accepted")
	}
}

func TestCalendarQueryFilter(t *testing.T) {
	cal, err := Parse(Encode(Task{UID: "u", Title: "Buy milk", Priority: 4, Due: &Due{Date: "2026-10-11"}}))
	if err != nil {
		t.Fatal(err)
	}
	parse := func(s string) *Node {
		n, err := ParseXML(strings.NewReader(`<C:filter xmlns:C="urn:ietf:params:xml:ns:caldav">` + s + `</C:filter>`))
		if err != nil {
			t.Fatal(err)
		}
		return n
	}
	cases := map[string]bool{
		`<C:comp-filter name="VCALENDAR"><C:comp-filter name="VTODO"/></C:comp-filter>`:                                                                                               true,
		`<C:comp-filter name="VCALENDAR"><C:comp-filter name="VEVENT"/></C:comp-filter>`:                                                                                              false,
		`<C:comp-filter name="VCALENDAR"><C:comp-filter name="VTODO"><C:prop-filter name="COMPLETED"><C:is-not-defined/></C:prop-filter></C:comp-filter></C:comp-filter>`:             true,
		`<C:comp-filter name="VCALENDAR"><C:comp-filter name="VTODO"><C:prop-filter name="SUMMARY"><C:text-match>MILK</C:text-match></C:prop-filter></C:comp-filter></C:comp-filter>`: true,
		`<C:comp-filter name="VCALENDAR"><C:comp-filter name="VTODO"><C:time-range start="20261001T000000Z" end="20261101T000000Z"/></C:comp-filter></C:comp-filter>`:                 true,
		`<C:comp-filter name="VCALENDAR"><C:comp-filter name="VTODO"><C:time-range start="20261101T000000Z" end="20261201T000000Z"/></C:comp-filter></C:comp-filter>`:                 false,
	}
	for f, want := range cases {
		if got := Matches(parse(f), cal); got != want {
			t.Fatalf("%s: got %v", f, got)
		}
	}
}
