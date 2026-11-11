// Command capture turns a log of what a CalDAV client sent into numbered,
// sanitised .ics fixtures (OpenSpec change caldav-verified, design D2): UIDs
// become placeholders, the text of SUMMARY, DESCRIPTION, CATEGORIES, LOCATION
// and the other free-text properties becomes neutral words, and names, email
// addresses, URLs and coordinates are replaced, while every property name,
// parameter, date and value the mapping reads stays as the client wrote it.
//
//	go run ./internal/caldav/capture [-all] <log> <out-dir>
//
// <log> is any text log that holds the request bodies: a client's own HTTP log
// (DAVx⁵ verbose logging, Thunderbird's calendar.debug.log, vdirsyncer
// -vdebug), a proxy dump or a HAR file. Each VCALENDAR in it is found whether
// its lines are written one per log line (with or without a log prefix) or on
// one line with escaped line breaks. Only bodies of PUT requests are kept,
// unless -all is given. The files are written as 01.ics, 02.ics, …, and one
// line per file names the request; rename them after the step of
// docs/caldav-verification.md they belong to. Nothing imports this package, so
// it is never part of the server binary. Review every output before
// committing it.
package main

import (
	"flag"
	"fmt"
	"io"
	"os"
	"path/filepath"
)

func main() {
	all := flag.Bool("all", false, "keep every VCALENDAR in the log, not only PUT bodies")
	flag.Usage = func() {
		fmt.Fprintln(os.Stderr, "usage: capture [-all] <log> <out-dir>")
		flag.PrintDefaults()
	}
	flag.Parse()
	if flag.NArg() != 2 {
		flag.Usage()
		os.Exit(2)
	}
	if err := run(flag.Arg(0), flag.Arg(1), *all, os.Stdout); err != nil {
		fmt.Fprintln(os.Stderr, "capture:", err)
		os.Exit(1)
	}
}

func run(in, outDir string, all bool, report io.Writer) error {
	data, err := os.ReadFile(in)
	if err != nil {
		return err
	}
	bodies := extract(string(data), all)
	if len(bodies) == 0 {
		return fmt.Errorf("%s: no calendar data found (use -all to keep bodies that are not PUT requests)", in)
	}
	if err := os.MkdirAll(outDir, 0o755); err != nil {
		return err
	}
	s := newScrubber()
	for i, b := range bodies {
		name := fmt.Sprintf("%02d.ics", i+1)
		out, summary := s.calendar(b.ics)
		if err := os.WriteFile(filepath.Join(outDir, name), out, 0o644); err != nil {
			return err
		}
		req := b.method
		if req == "" {
			req = "(no request line)"
		} else if b.path != "" {
			req += " " + s.path(b.path)
		}
		fmt.Fprintf(report, "%s  %s  %s\n", name, req, summary)
	}
	return nil
}
