package backup

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"sync"
	"time"
)

// requestIdle bounds how long a request to a backup destination may go
// without progress (a byte of the body sent, the response headers, or a byte
// of the response read). It replaces a client-wide timeout, which capped every
// upload at a fixed duration however large the archive (reliable-background-
// jobs); tests shorten it.
var requestIdle = 5 * time.Minute

// errStalled is the cause of a request cancelled for lack of progress.
var errStalled = errors.New("the destination made no progress")

// progressDeadline cancels a request's context once nothing moved for idle.
type progressDeadline struct {
	mu    sync.Mutex
	timer *time.Timer
	idle  time.Duration
}

func (p *progressDeadline) touch() {
	p.mu.Lock()
	p.timer.Reset(p.idle)
	p.mu.Unlock()
}

// doWithProgress sends req (built with ctx by build) under a progress
// deadline: the body is read through a reader that extends it, the response
// body likewise, and closing the response body releases the deadline. A
// stalled request fails with an error wrapping errStalled.
func doWithProgress(ctx context.Context, client *http.Client, build func(ctx context.Context, body io.Reader) (*http.Request, error), body io.Reader) (*http.Response, error) {
	ctx, cancel := context.WithCancelCause(ctx)
	p := &progressDeadline{idle: requestIdle}
	p.mu.Lock()
	p.timer = time.AfterFunc(requestIdle, func() { cancel(errStalled) })
	p.mu.Unlock()
	release := func() {
		p.mu.Lock()
		p.timer.Stop()
		p.mu.Unlock()
		cancel(nil)
	}
	if body != nil {
		body = &progressReader{r: body, p: p}
	}
	req, err := build(ctx, body)
	if err != nil {
		release()
		return nil, err
	}
	resp, err := client.Do(req)
	if err != nil {
		cause := context.Cause(ctx)
		release()
		if errors.Is(cause, errStalled) {
			return nil, fmt.Errorf("%w for %s", errStalled, requestIdle)
		}
		return nil, err
	}
	p.touch()
	resp.Body = &progressBody{ReadCloser: resp.Body, p: p, release: release}
	return resp, nil
}

type progressReader struct {
	r io.Reader
	p *progressDeadline
}

func (r *progressReader) Read(b []byte) (int, error) {
	n, err := r.r.Read(b)
	if n > 0 {
		r.p.touch()
	}
	return n, err
}

type progressBody struct {
	io.ReadCloser
	p       *progressDeadline
	release func()
	once    sync.Once
}

func (b *progressBody) Read(p []byte) (int, error) {
	n, err := b.ReadCloser.Read(p)
	if n > 0 {
		b.p.touch()
	}
	return n, err
}

func (b *progressBody) Close() error {
	err := b.ReadCloser.Close()
	b.once.Do(b.release)
	return err
}
