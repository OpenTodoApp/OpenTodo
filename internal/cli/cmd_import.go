package cli

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"time"
)

// `ot import <file>` (OpenSpec change import-workspace, cli-client "Import
// command"): the server's importer from the terminal. A dry run sends only the
// preview, which writes nothing; a real run starts the job and waits for it.
// The target workspace is the command's workspace when one was chosen
// (--workspace, OPENTODO_WORKSPACE or the profile); otherwise no option is
// sent and the server's default applies.

// importTimeout bounds one upload: a file can be up to the server's import limit.
const importTimeout = 5 * time.Minute

// importPoll is the interval between job status reads.
var importPoll = 500 * time.Millisecond

type importTotals struct {
	Rows        int `json:"rows"`
	Create      int `json:"create"`
	Update      int `json:"update"`
	Skip        int `json:"skip"`
	Error       int `json:"error"`
	NewProjects int `json:"newProjects"`
	NewLabels   int `json:"newLabels"`
}

type importJob struct {
	ID      string       `json:"id"`
	Format  string       `json:"format"`
	Status  string       `json:"status"`
	Totals  importTotals `json:"totals"`
	Message string       `json:"message"`
	Errors  []struct {
		Row      int    `json:"row"`
		SourceID string `json:"sourceId"`
		Reason   string `json:"reason"`
	} `json:"errors"`
}

type importPreview struct {
	Format string       `json:"format"`
	Totals importTotals `json:"totals"`
	Notes  []string     `json:"notes"`
}

func cmdImport(a *App, ctx context.Context, g *globalFlags, args []string) error {
	fs := a.flagSet("import", g)
	format := fs.String("format", "", "force a format instead of detecting it")
	existing := fs.String("existing", "", "own export: skip or overwrite items that already exist")
	duplicates := fs.String("duplicates", "", "skip or import possible duplicates")
	zone := fs.String("time-zone", "", "IANA time zone for date-times with a zone (default: this machine's)")
	pos, err := a.parse(g, fs, "import", args)
	if err != nil {
		return a.helpOr("import", err)
	}
	if len(pos) != 1 {
		return usageErr("usage: ot import <file> [--format <f>] [--existing skip|overwrite] [--duplicates skip|import] [--time-zone <zone>]")
	}
	data, err := os.ReadFile(pos[0])
	if err != nil {
		return usageErr("cannot read %s: %v", pos[0], err)
	}
	c, t, err := a.connect(g)
	if err != nil {
		return err
	}
	opts := map[string]string{"timeZone": *zone}
	if *zone == "" {
		opts["timeZone"] = a.localZone()
	}
	for k, v := range map[string]string{"format": *format, "existing": *existing, "duplicates": *duplicates} {
		if v != "" {
			opts[k] = v
		}
	}
	wsName := ""
	if a.workspaceChoice(g, t) != "" {
		s, err := a.scope(ctx, c, g, t)
		if err != nil {
			return err
		}
		opts["workspace"], wsName = s.id, s.name
	}
	name := filepath.Base(pos[0])
	// The gate refuses read-only mode and read or agent tokens, and in a dry
	// run records the import that would start.
	if c.gate != nil {
		planned, err := c.gate.beforeWrite(ctx, c, http.MethodPost, "/import", map[string]any{"file": name, "options": opts}, nil)
		if err != nil {
			return err
		}
		if planned != nil {
			raw, err := c.upload(ctx, "/import/preview", name, data, opts)
			if err != nil {
				return err
			}
			c.gate.dry.preview = raw
			return nil
		}
	}
	raw, err := c.upload(ctx, "/import", name, data, opts)
	if err != nil {
		return err
	}
	var started struct {
		Job importJob `json:"job"`
	}
	if err := json.Unmarshal(raw, &started); err != nil || started.Job.ID == "" {
		return serverErr("unexpected import response")
	}
	job, rawJob, err := c.waitImport(ctx, started.Job.ID)
	if err != nil {
		return err
	}
	if job.Status == "failed" {
		// The job's counts say how far it got; undo removes what it wrote.
		if !g.json {
			a.printImportJob(job, wsName)
		}
		return &exitError{code: ExitServer, jsonCode: "import_failed", msg: "the import failed: " + job.Message}
	}
	if g.json {
		_, err := a.Stdout.Write(append(bytes.TrimSpace(rawJob), '\n'))
		return err
	}
	a.printImportJob(job, wsName)
	return nil
}

// waitImport polls the job until it is no longer running.
func (c *client) waitImport(ctx context.Context, id string) (*importJob, []byte, error) {
	for {
		raw, _, err := c.do(ctx, http.MethodGet, "/import/jobs/"+id, nil, nil)
		if err != nil {
			return nil, nil, err
		}
		var out struct {
			Job json.RawMessage `json:"job"`
		}
		var job importJob
		if err := json.Unmarshal(raw, &out); err != nil || json.Unmarshal(out.Job, &job) != nil {
			return nil, nil, serverErr("unexpected import job response")
		}
		if job.Status != "running" {
			return &job, out.Job, nil
		}
		select {
		case <-ctx.Done():
			return nil, nil, ctx.Err()
		case <-time.After(importPoll):
		}
	}
}

func (a *App) printImportJob(job *importJob, workspace string) {
	into := ""
	if workspace != "" {
		into = " into " + workspace
	}
	n := job.Totals
	fmt.Fprintf(a.Stdout, "Import %s%s: %d created, %d updated, %d skipped, %d errors (%d new projects, %d new labels).\n",
		job.Status, into, n.Create, n.Update, n.Skip, n.Error, n.NewProjects, n.NewLabels)
	for i, e := range job.Errors {
		if i == 5 {
			fmt.Fprintf(a.Stdout, "  … and %d more\n", len(job.Errors)-5)
			break
		}
		where := fmt.Sprintf("row %d", e.Row)
		if e.Row == 0 {
			where = "source id " + e.SourceID
		}
		fmt.Fprintf(a.Stdout, "  %s: %s\n", where, e.Reason)
	}
	fmt.Fprintf(a.Stdout, "Job %s; undo it in the app under Settings → Data → Import.\n", shortID(job.ID))
}

// upload sends a file and the import options as multipart/form-data. It does
// not pass the write gate: the caller does, once per command.
func (c *client) upload(ctx context.Context, path, fileName string, data []byte, opts map[string]string) ([]byte, error) {
	var body bytes.Buffer
	mw := multipart.NewWriter(&body)
	b, _ := json.Marshal(opts)
	_ = mw.WriteField("options", string(b))
	fw, err := mw.CreateFormFile("file", fileName)
	if err != nil {
		return nil, err
	}
	if _, err := fw.Write(data); err != nil {
		return nil, err
	}
	if err := mw.Close(); err != nil {
		return nil, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.base+"/api/v1"+path, &body)
	if err != nil {
		return nil, usageErr("invalid server URL %q: %v", c.base, err)
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("User-Agent", "ot/"+Version)
	req.Header.Set("Content-Type", mw.FormDataContentType())
	req.Header.Set("Authorization", "Bearer "+c.token)
	hc := *c.http
	hc.Timeout = importTimeout
	resp, err := hc.Do(req)
	if err != nil {
		return nil, c.unreachable(err)
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(resp.Body, 64<<20))
	if err != nil {
		return nil, c.unreachable(err)
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, c.mapError(resp.StatusCode, raw)
	}
	return raw, nil
}

// printPreview is the human summary of a dry run's preview.
func printPreview(w io.Writer, raw []byte) {
	var p importPreview
	if json.Unmarshal(raw, &p) != nil {
		return
	}
	n := p.Totals
	fmt.Fprintf(w, "Preview (%s): %d rows, %d to create, %d to update, %d skipped, %d with errors, %d new projects, %d new labels.\n",
		p.Format, n.Rows, n.Create, n.Update, n.Skip, n.Error, n.NewProjects, n.NewLabels)
	for _, note := range p.Notes {
		fmt.Fprintln(w, "  "+note)
	}
}
