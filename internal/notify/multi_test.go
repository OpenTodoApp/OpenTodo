package notify

import (
	"context"
	"reflect"
	"testing"
)

// recorder is a Sink that also takes mentions; onlyAssigned takes nothing else.
type recorder struct {
	name string
	got  *[]string
}

func (r recorder) Assigned(context.Context, Assigned)   { *r.got = append(*r.got, r.name+" assigned") }
func (r recorder) Mentioned(context.Context, Mentioned) { *r.got = append(*r.got, r.name+" mentioned") }

type onlyAssigned struct{ got *[]string }

func (o onlyAssigned) Assigned(context.Context, Assigned) { *o.got = append(*o.got, "plain assigned") }

// Multi calls, in order, every member that implements an event's interface,
// and skips nil members and the others.
func TestMultiFansOutInOrder(t *testing.T) {
	var got []string
	m := Multi{nil, recorder{"a", &got}, onlyAssigned{&got}, Nop{}, recorder{"b", &got}}
	ctx := context.Background()
	m.Assigned(ctx, Assigned{})
	m.Mentioned(ctx, Mentioned{})
	want := []string{"a assigned", "plain assigned", "b assigned", "a mentioned", "b mentioned"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("got %v, want %v", got, want)
	}
}
