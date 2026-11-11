package main

import (
	"encoding/json"
	"regexp"
	"strings"
)

// body is one VCALENDAR found in the log, with the request that carried it
// (empty when the log names none).
type body struct {
	method, path string
	ics          string // LF-separated lines, still folded as sent
}

var (
	requestLine = regexp.MustCompile(`(?:^|[\s>"'\[])(PUT|GET|HEAD|POST|REPORT|PROPFIND|PROPPATCH|DELETE|MOVE|COPY|MKCALENDAR|OPTIONS)\s+((?:https?://|/)\S*)`)
	// A structured (JSON) log line names the request in fields.
	jsonMethod = regexp.MustCompile(`"method"\s*:\s*"([A-Z]+)"`)
	jsonPath   = regexp.MustCompile(`"(?:url|uri|path)"\s*:\s*"([^"]+)"`)
	statusLine = regexp.MustCompile(`HTTP/\d(?:\.\d)?\s+\d{3}\b|<--\s*\d{3}\b`)
)

const (
	begin = "BEGIN:VCALENDAR"
	end   = "END:VCALENDAR"
)

// extract finds the calendar bodies of a log: a HAR file's request bodies, or
// every VCALENDAR of a text log. Unless all is set, only bodies sent with PUT
// are kept.
func extract(log string, all bool) []body {
	if har, ok := fromHAR(log); ok {
		var out []body
		for _, b := range har {
			if all || b.method == "PUT" {
				out = append(out, b)
			}
		}
		return out
	}
	var out []body
	method, path, response := "", "", false
	lines := strings.Split(strings.ReplaceAll(log, "\r\n", "\n"), "\n")
	for i := 0; i < len(lines); i++ {
		line := lines[i]
		at := strings.Index(line, begin)
		if at < 0 {
			if m := requestLine.FindStringSubmatch(line); m != nil {
				method, path, response = m[1], m[2], false
			} else if statusLine.MatchString(line) {
				response = true
			}
			continue
		}
		// The request may be named on the body's own line, before the body.
		if m := requestLine.FindStringSubmatch(line[:at]); m != nil {
			method, path, response = m[1], m[2], false
		} else if m := jsonMethod.FindStringSubmatch(line[:at]); m != nil {
			method, path, response = m[1], "", false
			if p := jsonPath.FindStringSubmatch(line[:at]); p != nil {
				path = p[1]
			}
		}
		var ics string
		if rest := line[at:]; strings.Contains(rest, end) {
			// One log line holding the whole body with escaped line breaks.
			ics = unescapeOneLine(rest[:strings.Index(rest, end)+len(end)])
		} else {
			prefix := line[:at]
			got := []string{rest}
			for i++; i < len(lines); i++ {
				l := strings.TrimPrefix(lines[i], prefix)
				if e := strings.Index(l, end); e >= 0 {
					got = append(got, l[:e+len(end)])
					break
				}
				got = append(got, l)
			}
			ics = strings.Join(got, "\n")
		}
		if all || (method == "PUT" && !response) {
			out = append(out, body{method: method, path: path, ics: ics})
		}
	}
	return out
}

// unescapeOneLine reads a body logged on one line: a JSON string's escapes
// when it is one, otherwise literal \r\n and \n as line breaks.
func unescapeOneLine(s string) string {
	var v string
	if err := json.Unmarshal([]byte(`"`+s+`"`), &v); err == nil && strings.Contains(v, "\n") {
		return strings.ReplaceAll(v, "\r\n", "\n")
	}
	return strings.NewReplacer(`\r\n`, "\n", `\n`, "\n").Replace(s)
}

// fromHAR reads the request bodies of a HAR file (a proxy's or a browser's
// recording of the requests).
func fromHAR(s string) ([]body, bool) {
	t := strings.TrimSpace(s)
	if !strings.HasPrefix(t, "{") {
		return nil, false
	}
	var har struct {
		Log *struct {
			Entries []struct {
				Request struct {
					Method   string `json:"method"`
					URL      string `json:"url"`
					PostData *struct {
						Text string `json:"text"`
					} `json:"postData"`
				} `json:"request"`
			} `json:"entries"`
		} `json:"log"`
	}
	if json.Unmarshal([]byte(t), &har) != nil || har.Log == nil {
		return nil, false
	}
	var out []body
	for _, e := range har.Log.Entries {
		r := e.Request
		if r.PostData == nil || !strings.Contains(r.PostData.Text, begin) {
			continue
		}
		out = append(out, body{method: r.Method, path: r.URL, ics: strings.ReplaceAll(r.PostData.Text, "\r\n", "\n")})
	}
	return out, true
}
