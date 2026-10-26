import Foundation

/// The shell's version: the release version (`OPENTODO_VERSION`, set by CI from the tag,
/// `0.0.0-dev` locally), the same rules as the Android app (native-shells D9).
enum Version {
    static var app: String {
        let raw = ProcessInfo.processInfo.environment["OPENTODO_VERSION"] ?? "0.0.0-dev"
        return raw.hasPrefix("v") ? String(raw.dropFirst()) : raw
    }

    /// `major * 10000 + minor * 100 + patch`, as `CFBundleVersion`.
    static func code(_ version: String) -> Int {
        let parts = version.split(separator: ".", maxSplits: 2).map { Int($0.prefix { $0.isNumber }) ?? 0 }
        let padded = parts + Array(repeating: 0, count: max(0, 3 - parts.count))
        return padded[0] * 10000 + padded[1] * 100 + padded[2]
    }
}
