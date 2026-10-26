import Foundation

/// Maps a share to the capture screen's address, the same parameters as the web share
/// target and as the Android `ShareMapper`. Pure, so the limits are testable.
enum ShareMap {
    static let maxFiles = 10
    static let maxFileBytes = 20 * 1024 * 1024
    static let maxTotalBytes = 25 * 1024 * 1024
    static let maxText = 10_000
    static let maxTitle = 500

    /// `/share?title=…&text=…&url=…`, with `files=1` when files follow as the `opentodo-files` message.
    /// A lone link in the text is treated as the link when `url` is not given separately.
    static func path(title: String?, text: String?, url: String? = nil, withFiles: Bool) -> String {
        var params: [String] = []
        let trimmedText = (text ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let trimmedTitle = (title ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let trimmedUrl = (url ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        var link = trimmedUrl.isEmpty ? nil : trimmedUrl
        if !trimmedTitle.isEmpty { params.append("title=" + enc(String(trimmedTitle.prefix(maxTitle)))) }
        if !trimmedText.isEmpty {
            let t = String(trimmedText.prefix(maxText))
            // A lone link is a link; otherwise text, whose links the capture screen finds itself.
            if isLoneLink(t) && link == nil { link = t } else { params.append("text=" + enc(t)) }
        }
        if let link { params.append("url=" + enc(link)) }
        if withFiles { params.append("files=1") }
        return "/share" + (params.isEmpty ? "" : "?" + params.joined(separator: "&"))
    }

    /// Which of the offered sizes fit the limits, in order; a file over a limit is left out.
    static func accept(_ sizes: [Int64]) -> [Int] {
        var total: Int64 = 0
        var out: [Int] = []
        for (i, size) in sizes.enumerated() {
            if out.count >= maxFiles { break }
            if size < 0 || size > Int64(maxFileBytes) || total + size > Int64(maxTotalBytes) { continue }
            total += size
            out.append(i)
        }
        return out
    }

    /// The message the capture screen accepts once (`web/src/app/ShareCapture.tsx`).
    static func filesMessage(_ files: [(name: String, type: String, dataUrl: String)]) -> String {
        let list = files.map { ["name": $0.name, "type": $0.type, "data": $0.dataUrl] }
        let payload: [String: Any] = ["type": "opentodo-files", "files": list]
        return JSON.string(payload) ?? "{}"
    }

    /// Posts the message until the capture screen says it took it, like the extension's injected script.
    static func handoverScript(_ message: String) -> String {
        "(function(){var m=\(message),n=0;function post(){"
            + "if(document.documentElement.dataset.opentodoFiles==='received'||n++>80)return;"
            + "window.postMessage(m,location.origin);setTimeout(post,250)}post()})();"
    }

    private static func isLoneLink(_ text: String) -> Bool {
        text.range(of: "^https?://\\S+$", options: .regularExpression) != nil
    }

    private static func enc(_ s: String) -> String {
        var allowed = CharacterSet.alphanumerics
        allowed.insert(charactersIn: "-._~")
        return s.addingPercentEncoding(withAllowedCharacters: allowed) ?? ""
    }
}
