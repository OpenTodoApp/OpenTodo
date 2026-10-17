package sync

import (
	"context"
	"database/sql"
	"database/sql/driver"
	"strings"
	gosync "sync"
	"testing"

	"github.com/pixari/opentodo/internal/store"
)

// queryLog records the SQL statements a Service sends, so a test can count the
// queries a call costs (OpenSpec change `server-query-costs`).
type queryLog struct {
	mu   gosync.Mutex
	stmt []string
}

func (l *queryLog) add(q string) {
	l.mu.Lock()
	l.stmt = append(l.stmt, q)
	l.mu.Unlock()
}

// reset forgets what was recorded so far.
func (l *queryLog) reset() {
	l.mu.Lock()
	l.stmt = nil
	l.mu.Unlock()
}

// count is the number of statements recorded since the last reset; with a
// substring, only those that contain it.
func (l *queryLog) count(sub string) int {
	l.mu.Lock()
	defer l.mu.Unlock()
	n := 0
	for _, s := range l.stmt {
		if strings.Contains(s, sub) {
			n++
		}
	}
	return n
}

type countingConn interface {
	driver.Conn
	driver.ConnBeginTx
	driver.ConnPrepareContext
	driver.QueryerContext
	driver.ExecerContext
}

type logConn struct {
	countingConn
	log *queryLog
}

func (c *logConn) QueryContext(ctx context.Context, q string, args []driver.NamedValue) (driver.Rows, error) {
	c.log.add(q)
	return c.countingConn.QueryContext(ctx, q, args)
}

func (c *logConn) ExecContext(ctx context.Context, q string, args []driver.NamedValue) (driver.Result, error) {
	c.log.add(q)
	return c.countingConn.ExecContext(ctx, q, args)
}

func (c *logConn) PrepareContext(ctx context.Context, q string) (driver.Stmt, error) {
	c.log.add(q)
	return c.countingConn.PrepareContext(ctx, q)
}

type logConnector struct {
	d   driver.Driver
	dsn string
	log *queryLog
}

func (c logConnector) Connect(context.Context) (driver.Conn, error) {
	conn, err := c.d.Open(c.dsn)
	if err != nil {
		return nil, err
	}
	return &logConn{countingConn: conn.(countingConn), log: c.log}, nil
}

func (c logConnector) Driver() driver.Driver { return c.d }

// newCountingService is newTestService over a connection that logs every
// statement it runs.
func newCountingService(t testing.TB) (*Service, *queryLog) {
	t.Helper()
	dir := t.TempDir()
	base, err := store.Open(dir)
	if err != nil {
		t.Fatal(err)
	}
	drv := base.Driver()
	base.Close()
	log := &queryLog{}
	db := sql.OpenDB(logConnector{d: drv, dsn: "file:" + store.DBPath(dir) + "?_pragma=busy_timeout(5000)&_pragma=foreign_keys(ON)", log: log})
	db.SetMaxOpenConns(1)
	t.Cleanup(func() { db.Close() })
	return NewService(db), log
}
