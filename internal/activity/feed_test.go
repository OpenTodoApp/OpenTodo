package activity

import "testing"

func TestFeedKindOf(t *testing.T) {
	cases := map[string]string{
		KindCompleted: FeedCompleted, KindReopened: FeedCompleted, KindCreated: FeedCreated,
		KindCommented: FeedCommented, KindCommentEdited: FeedCommented, KindCommentDeleted: FeedCommented,
		KindAssigned: FeedAssigned, KindUnassigned: FeedAssigned, KindRescheduled: FeedRescheduled,
		KindMoved: FeedOther, KindEdited: FeedOther, KindDeleted: FeedOther, KindRestored: FeedOther,
		KindArchived: FeedOther, KindUnarchived: FeedOther,
	}
	for kind, want := range cases {
		if got := FeedKindOf(kind); got != want {
			t.Errorf("FeedKindOf(%s) = %s, want %s", kind, got, want)
		}
		if !KnownFeedKind(want) {
			t.Errorf("%s is not a known feed kind", want)
		}
	}
	if KnownFeedKind("edited") {
		t.Error("event kinds are not feed categories")
	}
}
