package location

import (
	"encoding/json"
	"strings"
	"testing"
)

// Every scenario of task-locations "Location validation", plus the place's geo.
func TestCheckValue(t *testing.T) {
	long := strings.Repeat("a", MaxName+1)
	for _, c := range []struct {
		in string
		ok bool
	}{
		{`null`, true},
		{`{"name":"Post office","lat":45.46,"lon":9.19}`, true},
		{`{"address":"Via Roma 1, Torino"}`, true},
		{`{"lat":0,"lon":0}`, true},
		{`{"name":"Gym","place_id":"p1"}`, true},
		{`"enc:v1:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"`, true},
		{`{"lat":45.46}`, false},                      // half a coordinate
		{`{"lon":9}`, false},                          // half a coordinate
		{`{"lat":91,"lon":9}`, false},                 // out of range
		{`{"lat":45,"lon":-181}`, false},              // out of range
		{`{}`, false},                                 // empty
		{`{"name":"Home","zoom":12}`, false},          // unknown member
		{`{"name":""}`, false},                        // empty member
		{`{"name":"` + long + `"}`, false},            // too long
		{`{"name":"Home","lat":"45","lon":9}`, false}, // wrong type
		{`"Home"`, false},                             // a plain string is not ciphertext
		{`[1,2]`, false},
		{`{"place_id":"p1"}`, false}, // a link alone is not a location
	} {
		err := CheckValue(json.RawMessage(c.in))
		if (err == nil) != c.ok {
			t.Errorf("CheckValue(%s) = %v, want ok=%v", c.in, err, c.ok)
		}
	}
}

func TestCheckGeo(t *testing.T) {
	for _, c := range []struct {
		in string
		ok bool
	}{
		{`null`, true},
		{`{"lat":45.4642,"lon":9.19}`, true},
		{`{"lat":45.4642}`, false},
		{`{"lat":-90.5,"lon":0}`, false},
		{`{"lat":1,"lon":2,"name":"x"}`, false},
		{`"not ciphertext"`, false},
	} {
		if err := CheckGeo(json.RawMessage(c.in)); (err == nil) != c.ok {
			t.Errorf("CheckGeo(%s) = %v, want ok=%v", c.in, err, c.ok)
		}
	}
}

func TestRound6(t *testing.T) {
	if got := Round6(45.46421234567); got != 45.464212 {
		t.Fatalf("Round6 = %v", got)
	}
}
