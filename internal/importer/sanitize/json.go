package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/url"
	"strings"
)

// ---- JSON (Google Tasks, Trello, Microsoft To Do, Apple Reminders, Any.do) ----

// jsonKinds names the keys whose string values are personal text, with the
// placeholder kind each becomes (OpenSpec change more-importers, design D9). The
// same value under the same kind always maps to the same placeholder, so a Trello
// label repeated on a card or a list named twice still matches.
var jsonKinds = map[string]string{
	"title": "Title", "name": "Name", "displayname": "Name", "list": "List",
	"desc": "Notes", "notes": "Notes", "note": "Notes", "content": "Notes", "description": "Notes",
	"text": "Text", "filename": "File",
	"fullname": "Person", "username": "Person", "initials": "Person",
}

// jsonLabelKeys hold tag names (strings in an array), scrubbed like labels.
var jsonLabelKeys = map[string]bool{"tags": true, "categories": true}

// jsonURLKeys hold addresses: the scheme and host stay, the rest is replaced.
var jsonURLKeys = map[string]bool{"url": true, "link": true, "weburl": true, "weblink": true, "shorturl": true}

// jsonKeep are the default list names the profiles recognise; they carry no
// personal data and must survive so the fixture keeps its default list.
var jsonKeep = map[string]bool{"My Tasks": true, "Tasks": true, "Reminders": true, "Personal": true, "Flagged Emails": true}

// jsonFile rewrites a JSON document token by token, so key order, nesting,
// numbers, booleans, ids, dates and statuses come out exactly as they went in.
func (s *scrubber) jsonFile(data []byte) ([]byte, error) {
	dec := json.NewDecoder(bytes.NewReader(bytes.TrimPrefix(data, []byte("\xef\xbb\xbf"))))
	dec.UseNumber()
	var buf bytes.Buffer
	if err := s.jsonValue(dec, &buf, ""); err != nil {
		return nil, err
	}
	if _, err := dec.Token(); err == nil {
		return nil, fmt.Errorf("trailing data after the JSON document")
	}
	var out bytes.Buffer
	if err := json.Indent(&out, buf.Bytes(), "", "  "); err != nil {
		return nil, err
	}
	out.WriteByte('\n')
	return out.Bytes(), nil
}

func (s *scrubber) jsonValue(dec *json.Decoder, w *bytes.Buffer, key string) error {
	tok, err := dec.Token()
	if err != nil {
		return err
	}
	switch t := tok.(type) {
	case json.Delim:
		switch t {
		case '{':
			w.WriteByte('{')
			for i := 0; dec.More(); i++ {
				kt, err := dec.Token()
				if err != nil {
					return err
				}
				k, _ := kt.(string)
				if i > 0 {
					w.WriteByte(',')
				}
				writeJSON(w, k)
				w.WriteByte(':')
				child := k
				if strings.EqualFold(key, "labelNames") { // Trello: colour → label name
					child = "name"
				}
				if err := s.jsonValue(dec, w, child); err != nil {
					return err
				}
			}
			w.WriteByte('}')
		case '[':
			w.WriteByte('[')
			for i := 0; dec.More(); i++ {
				if i > 0 {
					w.WriteByte(',')
				}
				if err := s.jsonValue(dec, w, key); err != nil { // elements share the array's key
					return err
				}
			}
			w.WriteByte(']')
		}
		_, err := dec.Token() // the closing delimiter
		return err
	case string:
		writeJSON(w, s.jsonString(key, t))
	case json.Number:
		w.WriteString(t.String())
	case bool:
		writeJSON(w, t)
	case nil:
		w.WriteString("null")
	}
	return nil
}

func writeJSON(w *bytes.Buffer, v any) {
	b, _ := json.Marshal(v)
	w.Write(b)
}

func (s *scrubber) jsonString(key, v string) string {
	if v == "" || jsonKeep[v] {
		return v
	}
	if emailRe.FindString(v) == v {
		return s.email(v)
	}
	k := strings.ToLower(key)
	switch {
	case jsonLabelKeys[k]:
		return s.labelName(v)
	case jsonURLKeys[k]:
		return s.url(v)
	case k == "email":
		return s.email(v)
	}
	if kind, ok := jsonKinds[k]; ok {
		return s.prose(kind, v)
	}
	return v
}

// url keeps the scheme and host of an address and replaces its path, query and
// fragment, so a link stays a link of the same site without saying what it was.
func (s *scrubber) url(v string) string {
	u, err := url.Parse(v)
	if err != nil || u.Scheme == "" {
		return s.text("Link", v)
	}
	p := s.get("urlpath", v, func(n int) string { return fmt.Sprintf("p%d", n) })
	if u.Host == "" {
		return u.Scheme + "://" + p
	}
	return u.Scheme + "://" + u.Host + "/" + p
}
