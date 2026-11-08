package outbound

import (
	"net/netip"
	"strings"
	"testing"
)

// FuzzAddressPolicy checks the deny list's invariants on any address
// (external-security-review, threat model "Outbound request policy"):
//   - an address refused even when private targets are allowed is refused by
//     default too;
//   - an IPv4-mapped IPv6 address is judged exactly as its IPv4 form;
//   - an IPv4 address carried in a NAT64, IPv4-compatible or 6to4 address is
//     never reachable through that wrapping when it would be refused itself.
func FuzzAddressPolicy(f *testing.F) {
	for _, s := range []string{"127.0.0.1", "10.0.0.1", "169.254.169.254", "100.100.100.200", "8.8.8.8", "::1", "::ffff:10.0.0.1",
		"64:ff9b::a9fe:a9fe", "2002:a9fe:a9fe::1", "::a9fe:a9fe", "fd00:ec2::254", "fe80::1", "2606:4700::1111", "0.0.0.0", "224.0.0.1"} {
		a := netip.MustParseAddr(s)
		b := a.As16()
		f.Add(b[:])
		if a.Is4() {
			b4 := a.As4()
			f.Add(b4[:])
		}
	}
	f.Fuzz(func(t *testing.T, raw []byte) {
		a, ok := netip.AddrFromSlice(raw)
		if !ok {
			return
		}
		if IsAlwaysDenied(a) && !IsDenied(a) {
			t.Fatalf("%v is always denied but allowed by default", a)
		}
		if a.Is4() {
			mapped := netip.AddrFrom16(a.As16())
			if IsDenied(mapped) != IsDenied(a) || IsAlwaysDenied(mapped) != IsAlwaysDenied(a) {
				t.Fatalf("%v and its mapped form %v are judged differently", a, mapped)
			}
		}
		if v4, ok := embeddedIPv4(a); ok && !a.IsLoopback() {
			if IsDenied(v4) && !IsDenied(a) {
				t.Fatalf("%v carries refused %v but is allowed by default", a, v4)
			}
			if IsAlwaysDenied(v4) && !IsAlwaysDenied(a) {
				t.Fatalf("%v carries always-refused %v but is allowed with private targets on", a, v4)
			}
		}
	})
}

// FuzzValidateURL: whatever the input, an accepted URL is http or https, has a
// host and is within MaxURLLength.
func FuzzValidateURL(f *testing.F) {
	for _, s := range []string{"https://example.com/hook", "http://10.0.0.1:8080/x", "ftp://example.com", "https://", "//example.com",
		"https://user:pass@example.com", "HTTPS://EXAMPLE.COM", "https://[::1]/", "javascript:alert(1)", "https://example.com#frag"} {
		f.Add(s)
	}
	f.Fuzz(func(t *testing.T, raw string) {
		u, err := ValidateURL(raw)
		if err != nil {
			return
		}
		if len(raw) > MaxURLLength {
			t.Fatalf("accepted %d characters", len(raw))
		}
		if s := strings.ToLower(u.Scheme); s != "http" && s != "https" {
			t.Fatalf("accepted scheme %q", u.Scheme)
		}
		if u.Hostname() == "" {
			t.Fatalf("accepted %q without a host", raw)
		}
	})
}
