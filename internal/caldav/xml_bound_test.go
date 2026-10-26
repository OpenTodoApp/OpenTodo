package caldav

import (
	"strings"
	"testing"
	"time"
)

// TestParseXMLLinearInTextPieces: an element's text arrives in pieces between
// comments, CDATA sections and entities. Joining them by string concatenation
// was quadratic: a 4 MB multistatus answer from a calendar server (calendar
// sync reads up to 4 MB) of "x<!---->" pieces took minutes of CPU. Now pieces
// are collected and joined once.
func TestParseXMLLinearInTextPieces(t *testing.T) {
	body := "<a>" + strings.Repeat("x<!---->", (4<<20)/8-1) + "</a>"
	done := make(chan *Node, 1)
	go func() {
		n, err := ParseXMLLimit(strings.NewReader(body), 4<<20)
		if err != nil {
			t.Error(err)
		}
		done <- n
	}()
	select {
	case n := <-done:
		if n == nil || len(n.Text) != (4<<20)/8-1 || strings.Trim(n.Text, "x") != "" {
			t.Fatalf("text not kept")
		}
	case <-time.After(20 * time.Second):
		t.Fatal("ParseXMLLimit did not finish in 20 s")
	}
	// Mixed pieces still read as one text, in order.
	n, err := ParseXML(strings.NewReader("<a>1<!--c-->2<![CDATA[3]]>&amp;4<b>in</b>5</a>"))
	if err != nil || n.Text != "123&45" || n.Children[0].Text != "in" {
		t.Fatalf("got %+v, %v", n, err)
	}
}
