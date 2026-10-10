package activity

// Feed filter categories (OpenSpec change `activity-feed`, "Filters"). Every
// event kind belongs to exactly one category; web/src/lib/feed.ts holds the
// same table (FEED_KINDS) so the route and the local view filter alike.
const (
	FeedCompleted   = "completed"
	FeedCreated     = "created"
	FeedCommented   = "commented"
	FeedAssigned    = "assigned"
	FeedRescheduled = "rescheduled"
	FeedOther       = "other"
)

// FeedKinds lists the categories in display order.
var FeedKinds = []string{FeedCompleted, FeedCreated, FeedCommented, FeedAssigned, FeedRescheduled, FeedOther}

// FeedKindOf maps an event kind to its feed category.
func FeedKindOf(kind string) string {
	switch kind {
	case KindCompleted, KindReopened:
		return FeedCompleted
	case KindCreated:
		return FeedCreated
	case KindCommented, KindCommentEdited, KindCommentDeleted:
		return FeedCommented
	case KindAssigned, KindUnassigned:
		return FeedAssigned
	case KindRescheduled:
		return FeedRescheduled
	}
	return FeedOther
}

// KnownFeedKind reports whether s is a feed category.
func KnownFeedKind(s string) bool {
	for _, k := range FeedKinds {
		if k == s {
			return true
		}
	}
	return false
}
