import Foundation

/// Where the shell keeps what its extensions and its widget must see: the App Group
/// container, or the app's own Documents folder when the group is unavailable (a
/// simulator build without a signed entitlement).
enum Store {
    static let appGroup = "group.app.opentodo"

    static var container: URL {
        if let url = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroup) { return url }
        return FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
    }

    static func url(_ name: String) -> URL { container.appendingPathComponent(name) }

    static func read(_ name: String) -> Data? { try? Data(contentsOf: url(name)) }

    static func write(_ data: Data, _ name: String) {
        try? FileManager.default.createDirectory(at: container, withIntermediateDirectories: true)
        try? data.write(to: url(name), options: .atomic)
    }

    static func remove(_ name: String) { try? FileManager.default.removeItem(at: url(name)) }
}
