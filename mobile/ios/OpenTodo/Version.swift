import Foundation

/// The shell's version: the release version (`OPENTODO_VERSION`, set by CI from the tag,
/// `0.0.0-dev` locally), the same rules as the Android app (native-shells D9).
enum Version {
    /// What the build baked in: `OPENTODO_VERSION` is a build setting, not a run-time
    /// variable, so on a device only the bundle knows it.
    static var app: String {
        normalize(Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String)
    }

    /// The bundle's version string as the bridge reports it: no leading `v`, and
    /// `0.0.0-dev` when the bundle carries none.
    static func normalize(_ raw: String?) -> String {
        let value = (raw ?? "").trimmingCharacters(in: .whitespaces)
        guard !value.isEmpty else { return "0.0.0-dev" }
        return value.hasPrefix("v") ? String(value.dropFirst()) : value
    }

    /// `major * 10000 + minor * 100 + patch`, as `CFBundleVersion`.
    static func code(_ version: String) -> Int {
        let parts = version.split(separator: ".", maxSplits: 2).map { Int($0.prefix { $0.isNumber }) ?? 0 }
        let padded = parts + Array(repeating: 0, count: max(0, 3 - parts.count))
        return padded[0] * 10000 + padded[1] * 100 + padded[2]
    }
}
