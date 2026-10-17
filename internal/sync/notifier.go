package sync

import "sync"

// MaxStreamsPerUser caps concurrent live-update subscriptions per account. When a
// user exceeds it the oldest subscription is closed, so a device reconnecting after
// a half-closed connection is never locked out. Ten leave room for several
// tabs and devices while bounding what one account (a demo sandbox, say) holds.
const MaxStreamsPerUser = 10

// Notifier fans out "new operations recorded" wake-ups to a user's open live-update
// streams. It is in-memory and process-local: one container is the deployment
// contract. Wake-ups carry only the latest op cursor, never op content.
type Notifier struct {
	mu   sync.Mutex
	subs map[string][]*Subscription // per user, oldest first
}

// Subscription is one device's stream registration.
type Subscription struct {
	userID string
	device string
	ch     chan int64    // one slot: a slow reader coalesces wake-ups into the newest cursor
	cal    chan struct{} // one slot: "your calendar events changed" (calendar-feeds D8)
	done   chan struct{} // closed when the subscription is evicted or the notifier shuts down
	once   sync.Once
}

// NewNotifier returns an empty Notifier.
func NewNotifier() *Notifier {
	return &Notifier{subs: map[string][]*Subscription{}}
}

// Subscribe registers a device stream for a user. If the user already holds
// MaxStreamsPerUser subscriptions the oldest one is closed. The caller must
// Unsubscribe when the stream ends.
func (n *Notifier) Subscribe(userID, device string) *Subscription {
	sub := &Subscription{userID: userID, device: device, ch: make(chan int64, 1), cal: make(chan struct{}, 1), done: make(chan struct{})}
	n.mu.Lock()
	list := n.subs[userID]
	for len(list) >= MaxStreamsPerUser {
		list[0].close()
		list = list[1:]
	}
	n.subs[userID] = append(list, sub)
	n.mu.Unlock()
	return sub
}

// Unsubscribe removes a subscription. Safe to call more than once.
func (n *Notifier) Unsubscribe(sub *Subscription) {
	n.mu.Lock()
	defer n.mu.Unlock()
	list := n.subs[sub.userID]
	for i, s := range list {
		if s == sub {
			list = append(list[:i], list[i+1:]...)
			break
		}
	}
	if len(list) == 0 {
		delete(n.subs, sub.userID)
	} else {
		n.subs[sub.userID] = list
	}
	sub.close()
}

// Notify wakes every subscription of userID except the one(s) registered by
// originDevice. It never blocks: a subscriber that has not consumed the previous
// wake-up gets it replaced by the newer cursor.
func (n *Notifier) Notify(userID, originDevice string, seq int64) {
	n.mu.Lock()
	defer n.mu.Unlock()
	for _, sub := range n.subs[userID] {
		if sub.device == originDevice {
			continue
		}
		select {
		case sub.ch <- seq:
		default:
			// Drain the stale value and replace it; only Notify sends, and it holds the lock.
			select {
			case <-sub.ch:
			default:
			}
			select {
			case sub.ch <- seq:
			default:
			}
		}
	}
}

// NotifyCalendar tells every stream of userID that their subscribed calendars
// changed (OpenSpec change calendar-feeds, design D8). Never blocks; repeated
// signals coalesce.
func (n *Notifier) NotifyCalendar(userID string) {
	n.mu.Lock()
	defer n.mu.Unlock()
	for _, sub := range n.subs[userID] {
		select {
		case sub.cal <- struct{}{}:
		default:
		}
	}
}

// CloseAll closes every subscription, used on graceful shutdown so proxies see a
// clean end of stream and clients reconnect to the new process.
func (n *Notifier) CloseAll() {
	n.mu.Lock()
	defer n.mu.Unlock()
	for uid, list := range n.subs {
		for _, sub := range list {
			sub.close()
		}
		delete(n.subs, uid)
	}
}

// CloseUser closes every subscription of one user, so their open live-update
// streams end at once (deactivation and deletion, OpenSpec `user-management`).
// Reconnecting fails because the account's sessions and tokens are gone.
func (n *Notifier) CloseUser(userID string) {
	n.mu.Lock()
	defer n.mu.Unlock()
	for _, sub := range n.subs[userID] {
		sub.close()
	}
	delete(n.subs, userID)
}

// Count reports how many subscriptions a user currently holds.
func (n *Notifier) Count(userID string) int {
	n.mu.Lock()
	defer n.mu.Unlock()
	return len(n.subs[userID])
}

// C delivers the latest cursor each time new ops for the user are recorded by
// another device.
// Calendar delivers calendar-changed signals.
func (s *Subscription) Calendar() <-chan struct{} { return s.cal }

func (s *Subscription) C() <-chan int64 { return s.ch }

// Done is closed when the subscription was evicted or the server is shutting down.
func (s *Subscription) Done() <-chan struct{} { return s.done }

// Device returns the device id this subscription was registered with.
func (s *Subscription) Device() string { return s.device }

func (s *Subscription) close() { s.once.Do(func() { close(s.done) }) }
