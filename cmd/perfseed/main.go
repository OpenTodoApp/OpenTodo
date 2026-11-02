// Command perfseed builds the 10,000-task account of the performance budgets
// (OpenSpec change performance-10k) in an empty data directory, through the op
// log, and writes its summary as JSON. It is a development tool and never part
// of the server.
//
//	go run ./cmd/perfseed -data /tmp/perf10k [-encrypted] [-seed 10000] [-scale 1] [-summary out.json]
package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"github.com/OpenTodoApp/opentodo/internal/perfseed"
)

func main() {
	data := flag.String("data", "", "empty data directory to create the account in (required)")
	seed := flag.Uint64("seed", perfseed.DefaultSeed, "generator seed")
	encrypted := flag.Bool("encrypted", false, "turn on end-to-end encryption for the account")
	scale := flag.Int("scale", 1, "multiply the task-shaped counts (5 is the 50,000-task run)")
	summary := flag.String("summary", "", "where to write the summary JSON (default <data>/perfseed.json)")
	flag.Parse()
	if *data == "" {
		flag.Usage()
		os.Exit(2)
	}
	if err := os.MkdirAll(*data, 0o700); err != nil {
		fail(err)
	}
	start := time.Now()
	s, err := perfseed.Run(context.Background(), *data, perfseed.Options{Seed: *seed, Encrypted: *encrypted, Scale: *scale})
	if err != nil {
		fail(err)
	}
	if *summary == "" {
		*summary = filepath.Join(*data, "perfseed.json")
	}
	b, _ := json.MarshalIndent(s, "", "  ")
	if err := os.WriteFile(*summary, append(b, '\n'), 0o600); err != nil {
		fail(err)
	}
	fmt.Fprintf(os.Stderr, "perfseed: %d ops in %s, summary in %s\n", s.Ops, time.Since(start).Round(time.Millisecond), *summary)
}

func fail(err error) {
	fmt.Fprintln(os.Stderr, "perfseed:", err)
	os.Exit(1)
}
