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
        let url: String?
        let files: [File]
    }

    static func read() -> Entry? {
        guard let data = Store.read(fileName) else { return nil }
        return try? JSONDecoder().decode(Entry.self, from: data)
    }

    /// Only `share/<one file name>` is read back: the index lives in a shared container, so
    /// a path that climbs out of the inbox (`share/../…`) or names another folder is refused
    /// rather than handing a file of the app's own storage to the page.
    static func isInboxPath(_ path: String) -> Bool {
        let parts = path.split(separator: "/", omittingEmptySubsequences: false)
        guard parts.count == 2, parts[0] == Substring(directory) else { return false }
        let name = parts[1]
        return !name.isEmpty && name != "." && name != ".." && !name.unicodeScalars.contains("\\")
    }

    /// The file name the extension stores a share under: no separators or control
    /// characters, and short enough that the UUID prefix plus the name stay well under the
    /// file system's 255-byte limit, so a long suggested name cannot make the copy fail.
    static func storedName(_ suggested: String) -> String {
        let cleaned = String(suggested.unicodeScalars.map { scalar -> Character in
            if scalar == "/" || scalar == "\\" || scalar == ":" || scalar.value < 0x20 || scalar.value == 0x7f { return "-" }
            return Character(scalar)
        })
        let trimmed = cleaned.trimmingCharacters(in: CharacterSet(charactersIn: ". ").union(.whitespacesAndNewlines))
        var name = trimmed.isEmpty ? "file" : trimmed
        while name.utf8.count > 120 { name.removeFirst() }
        return name
    }

    /// The message the capture screen accepts, or nil when there is nothing to hand over.
    static func message(_ entry: Entry) -> String? {
        let acceptable = ShareMap.accept(entry.files.map { file in
            guard isInboxPath(file.path) else { return -1 }
            let url = Store.url(file.path)
            let size = (try? FileManager.default.attributesOfItem(atPath: url.path)[.size]) as? NSNumber
            return size?.int64Value ?? -1
        })
        var files: [(name: String, type: String, dataUrl: String)] = []
        for index in acceptable {
            let file = entry.files[index]
            guard isInboxPath(file.path),
                  let data = try? Data(contentsOf: Store.url(file.path)), data.count <= ShareMap.maxFileBytes else { continue }
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
