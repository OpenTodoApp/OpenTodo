package main

import (
	"context"
	"net"
	"runtime"
	"testing"
)

// acceptsMultipath reports whether a connection from a Multipath TCP client
// to ln is accepted as a Multipath TCP connection.
func acceptsMultipath(t *testing.T, ln net.Listener) bool {
	t.Helper()
	var d net.Dialer
	d.SetMultipathTCP(true)
	c, err := d.DialContext(context.Background(), "tcp", ln.Addr().String())
	if err != nil {
		t.Fatal(err)
	}
	defer c.Close()
	s, err := ln.Accept()
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	on, _ := s.(*net.TCPConn).MultipathTCP()
	return on
}

// TestListenerHasNoMultipathTCP pins the `godebug multipathtcp=0` line in
// go.mod: a listener made the way http.Server.ListenAndServe makes one (the
// server, host mode and its operator interface) must not use Multipath TCP
// (CVE-2026-98432).
func TestListenerHasNoMultipathTCP(t *testing.T) {
	if runtime.GOOS != "linux" {
		t.Skip("Multipath TCP listeners are Linux only")
	}
	var lc net.ListenConfig
	lc.SetMultipathTCP(true)
	probe, err := lc.Listen(context.Background(), "tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	supported := acceptsMultipath(t, probe)
	probe.Close()
	if !supported {
		t.Skip("this kernel has no Multipath TCP")
	}

	// http.Server.ListenAndServe listens with net.Listen("tcp", addr).
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer ln.Close()
	if acceptsMultipath(t, ln) {
		t.Fatal("the server's listener uses Multipath TCP; go.mod must keep `godebug multipathtcp=0`")
	}
}
