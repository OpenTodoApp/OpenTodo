import Foundation

/// What the share extension leaves in the App Group for the app to hand to the capture
/// screen (ios-shell design D5). The extension writes files and a small index; the app
/// builds the `opentodo-files` message and empties the container after the hand-over.
enum ShareInbox {
    static let fileName = "share.json"
    static let directory = "share"

    struct File: Codable, Equatable {
        let name: String
        let type: String
        let path: String
    }

    struct Entry: Codable, Equatable {
        let title: String?
        let text: String?
        let files: [File]
    }

    static func read() -> Entry? {
        guard let data = Store.read(fileName) else { return nil }
        return try? JSONDecoder().decode(Entry.self, from: data)
    }

    /// The message the capture screen accepts, or nil when there is nothing to hand over.
    static func message(_ entry: Entry) -> String? {
        let acceptable = ShareMap.accept(entry.files.map { file in
            let url = Store.url(file.path)
            let size = (try? FileManager.default.attributesOfItem(atPath: url.path)[.size]) as? NSNumber
            return size?.int64Value ?? -1
        })
        var files: [(name: String, type: String, dataUrl: String)] = []
        for index in acceptable {
            let file = entry.files[index]
            guard let data = try? Data(contentsOf: Store.url(file.path)), data.count <= ShareMap.maxFileBytes else { continue }
            let type = file.type.isEmpty ? "application/octet-stream" : file.type
            files.append((file.name, type, "data:\(type);base64,\(data.base64EncodedString())"))
        }
        guard !files.isEmpty else { return nil }
        return ShareMap.filesMessage(files)
    }

    /// Empties the container once the capture screen has the files.
    static func clear() {
        Store.remove(fileName)
        try? FileManager.default.removeItem(at: Store.url(directory))
    }
}
