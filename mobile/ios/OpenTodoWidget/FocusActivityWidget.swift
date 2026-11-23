import ActivityKit
import SwiftUI
import WidgetKit

/// The Focus session on the lock screen and in the Dynamic Island (focus-live-activity D2,
/// D4): the title (or "Focus session"), the phase and a clock the system advances by itself.
/// Once the planned end passes without a new publication the activity is stale and reads
/// "Session done" or "Break over". Pause and Resume are links that open the app.
struct FocusActivityWidget: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: FocusAttributes.self) { context in
            FocusLockScreen(state: context.state, stale: context.isStale)
                .widgetURL(FocusLink.open)
        } dynamicIsland: { context in
            let state = context.state
            let stale = context.isStale
            return DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Text(FocusText.phase(state, stale: stale)).font(.caption).foregroundStyle(.secondary)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    FocusClock(state: state, stale: stale).font(.title3.monospacedDigit())
                }
                DynamicIslandExpandedRegion(.bottom) {
                    HStack {
                        Text(FocusText.title(state)).font(.headline).lineLimit(1).privacySensitive()
                        Spacer()
                        FocusActionLink(state: state, stale: stale)
                    }
                }
            } compactLeading: {
                Image(systemName: state.paused ? "pause.fill" : "timer")
            } compactTrailing: {
                FocusClock(state: state, stale: stale).monospacedDigit().frame(maxWidth: 52)
            } minimal: {
                Image(systemName: state.paused ? "pause.fill" : "timer")
            }
            .widgetURL(FocusLink.open)
        }
    }
}

enum FocusText {
    static func title(_ s: FocusAttributes.ContentState) -> String { s.title ?? String(localized: "Focus session") }

    static func phase(_ s: FocusAttributes.ContentState, stale: Bool) -> String {
        if s.done || stale { return s.phase == .work ? String(localized: "Session done") : String(localized: "Break over") }
        if s.paused { return String(localized: "Paused") }
        switch s.phase {
        case .shortBreak: return String(localized: "Short break")
        case .longBreak: return String(localized: "Long break")
        case .work:
            if let cycle = s.cycle, let of = s.cycleLength { return String(localized: "Work · \(cycle) of \(of)") }
            return String(localized: "Work")
        }
    }

    /// The frozen time as the screen shows it: `24:59`, `1:05:00` from an hour.
    static func clock(_ seconds: Double) -> String {
        let total = max(0, Int(seconds))
        let h = total / 3600, m = (total % 3600) / 60, s = total % 60
        return h > 0 ? String(format: "%d:%02d:%02d", h, m, s) : String(format: "%d:%02d", m, s)
    }
}

/// Counting down to the planned end, up for Flowtime, frozen while paused; nothing once done.
struct FocusClock: View {
    let state: FocusAttributes.ContentState
    let stale: Bool

    var body: some View {
        if state.done || stale {
            Text(verbatim: "")
        } else if let start = state.start, let end = state.end {
            Text(timerInterval: start...end, countsDown: true)
        } else if let from = state.countUpFrom {
            Text(from, style: .timer)
        } else {
            Text(verbatim: FocusText.clock(state.frozenSeconds ?? 0))
        }
    }
}

struct FocusActionLink: View {
    let state: FocusAttributes.ContentState
    let stale: Bool

    var body: some View {
        if !stale, let action = state.action {
            Link(destination: FocusLink.url(action)) {
                Label(action == .pause ? String(localized: "Pause") : String(localized: "Resume"),
                      systemImage: action == .pause ? "pause.fill" : "play.fill")
                    .font(.subheadline.weight(.semibold))
            }
        }
    }
}

struct FocusLockScreen: View {
    let state: FocusAttributes.ContentState
    let stale: Bool

    var body: some View {
        HStack(alignment: .center, spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text(FocusText.title(state)).font(.headline).lineLimit(2).privacySensitive()
                Text(FocusText.phase(state, stale: stale)).font(.subheadline).foregroundStyle(.secondary)
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 6) {
                FocusClock(state: state, stale: stale).font(.title2.monospacedDigit().weight(.semibold))
                FocusActionLink(state: state, stale: stale)
            }
        }
        .padding()
    }
}
