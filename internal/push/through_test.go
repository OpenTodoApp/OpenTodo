package push

import (
	"context"
	"crypto/ecdh"
	"net/http"
	"testing"
)

type recordingTransport struct{ urls []string }

func (r *recordingTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	r.urls = append(r.urls, req.URL.String())
	return &http.Response{StatusCode: http.StatusCreated, Body: http.NoBody, Header: http.Header{}, Request: req}, nil
}

// TestThroughSendsWithItsOwnClient (security read of caldav-push, finding 2):
// a Through sender posts with the service's keys through the client it was
// given (the webhook client, whose policy the registration check also uses),
// never the reminders' client.
func TestThroughSendsWithItsOwnClient(t *testing.T) {
	e := newTestEnv(t)
	own := &recordingTransport{}
	s := New(e.db, e.sync, e.dir, Options{Client: &http.Client{Transport: &recordingTransport{}}})
	ua, err := ecdh.P256().GenerateKey(nil)
	if err != nil {
		t.Fatal(err)
	}
	status, err := s.Through(&http.Client{Transport: own}).SendMessage(context.Background(), "https://push.example.net/x",
		Message{Payload: []byte("hi"), P256DH: ua.PublicKey().Bytes(), Auth: make([]byte, 16), TTL: 60, Urgency: "normal"})
	if err != nil || status != http.StatusCreated || len(own.urls) != 1 || own.urls[0] != "https://push.example.net/x" {
		t.Fatalf("status %d err %v sent %v", status, err, own.urls)
	}
}
