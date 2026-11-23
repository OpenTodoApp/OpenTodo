import Foundation
import QuickLook
import UIKit
import UniformTypeIdentifiers
import WebKit

/// Saving a file (shell-repairs D3, native-shells "Saving files"): WebKit downloads what
/// the web app saves, from its own data (`blob:`) or from the server, and the system's
/// export sheet asks where it goes; an image or a PDF is shown in Quick Look first, whose
/// share button saves it (ios-quick-look). The rules are pure, so the tests need no web view.
enum Downloads {
    /// A file is only ever saved from the configured server: its own addresses, and the
    /// object URLs its pages make (`blob:https://todo.example.com/<uuid>`).
    static func fromServer(_ url: URL, server: URL) -> Bool {
        if (url.scheme ?? "").lowercased() == "blob" {
            guard let inner = URL(string: String(url.absoluteString.dropFirst("blob:".count))) else { return false }
            return Origin.same(inner, server)
        }
        return Origin.same(url, server)
    }

    /// A navigation the page marked as a download (an anchor with `download`).
    static func saves(action url: URL, server: URL, shouldPerformDownload: Bool) -> Bool {
        shouldPerformDownload && fromServer(url, server: server)
    }

    /// An answer of the server that is a file: sent as an attachment, or nothing the web view can show.
    static func saves(response url: URL, server: URL, isAttachment: Bool, canShowMIMEType: Bool) -> Bool {
        (isAttachment || !canShowMIMEType) && fromServer(url, server: server)
    }

    /// Shown in Quick Look rather than the export sheet: an image or a PDF. The server's type
    /// decides when it sends one (a type it serves as `application/octet-stream` stays a plain
    /// save); the name's extension only when there is none. Never SVG, which can carry script.
    static func previews(mimeType: String?, fileName: String) -> Bool {
        let type: UTType?
        if let mime = mimeType, !mime.isEmpty {
            type = UTType(mimeType: mime)
        } else {
            type = UTType(filenameExtension: (fileName as NSString).pathExtension)
        }
        guard let type, !type.conforms(to: .svg) else { return false }
        return type.conforms(to: .image) || type.conforms(to: .pdf)
    }

    /// `Content-Disposition: attachment; filename=…`.
    static func isAttachment(_ response: URLResponse) -> Bool {
        guard let http = response as? HTTPURLResponse,
              let disposition = http.value(forHTTPHeaderField: "Content-Disposition") else { return false }
        return disposition.trimmingCharacters(in: .whitespaces).lowercased().hasPrefix("attachment")
    }

    /// The longest name kept, in UTF-16 units, as on Android (FileSave.name).
    static let maxNameLength = 200

    /// The suggested name reduced to its last path segment, so it cannot leave the
    /// temporary directory, without control characters, trimmed and at most
    /// `maxNameLength` long; `download` when nothing usable is left. The same rule as
    /// Android's, pinned by the shared file-name cases.
    static func fileName(_ suggested: String) -> String {
        let scalars = suggested.unicodeScalars
        let start = scalars.lastIndex(where: { $0 == "/" || $0 == "\\" }).map { scalars.index(after: $0) } ?? scalars.startIndex
        var kept = String.UnicodeScalarView()
        for s in scalars[start...] where !(s.value < 0x20 || (0x7F...0x9F).contains(s.value)) { kept.append(s) }
        let name = String(kept).trimmingCharacters(in: .whitespacesAndNewlines)
        if name.isEmpty || name == "." || name == ".." { return "download" }
        let units = Array(name.utf16)
        if units.count <= maxNameLength { return name }
        // Never half of a surrogate pair at the cut.
        let cut = UTF16.isLeadSurrogate(units[maxNameLength - 1]) ? maxNameLength - 1 : maxNameLength
        return String(decoding: units[..<cut], as: UTF16.self)
    }

    /// Where downloads wait for the export sheet; emptied when the shell starts.
    static var directory: URL {
        FileManager.default.temporaryDirectory.appendingPathComponent("opentodo-downloads", isDirectory: true)
    }
}

/// Receives the web view's downloads: each goes to a directory of its own under
/// `Downloads.directory`, then the export sheet copies it to where the person chooses.
/// The temporary file is removed when the sheet ends and when a download fails.
@MainActor
final class DownloadSaver: NSObject, WKDownloadDelegate, UIDocumentPickerDelegate, QLPreviewControllerDataSource, QLPreviewControllerDelegate {
    /// The view controller the export sheet is presented from.
    private let presenter: () -> UIViewController?
    /// Downloads under way, by identity: the download itself (its delegate is weak), its file,
    /// and whether it is shown in Quick Look.
    private var running: [ObjectIdentifier: (download: WKDownload, file: URL, preview: Bool)] = [:]
    /// Finished files waiting for the sheet or the preview; one at a time.
    private var finished: [(file: URL, preview: Bool)] = []
    private var showing: URL?

    init(presenter: @escaping () -> UIViewController?) {
        self.presenter = presenter
        super.init()
        // What an earlier run left behind (the app was closed with the sheet open).
        try? FileManager.default.removeItem(at: Downloads.directory)
    }

    func take(_ download: WKDownload) {
        download.delegate = self
    }

    func download(_ download: WKDownload, decideDestinationUsing response: URLResponse,
                  suggestedFilename: String, completionHandler: @escaping (URL?) -> Void) {
        let folder = Downloads.directory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        do {
            try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        } catch {
            return completionHandler(nil)
        }
        let file = folder.appendingPathComponent(Downloads.fileName(suggestedFilename), isDirectory: false)
        let preview = Downloads.previews(mimeType: response.mimeType, fileName: file.lastPathComponent)
        running[ObjectIdentifier(download)] = (download, file, preview)
        completionHandler(file)
    }

    func downloadDidFinish(_ download: WKDownload) {
        guard let entry = running.removeValue(forKey: ObjectIdentifier(download)) else { return }
        finished.append((entry.file, entry.preview))
        showNext()
    }

    func download(_ download: WKDownload, didFailWithError error: Error, resumeData: Data?) {
        guard let entry = running.removeValue(forKey: ObjectIdentifier(download)) else { return }
        discard(entry.file)
    }

    private func showNext() {
        guard showing == nil, !finished.isEmpty else { return }
        let (file, preview) = finished.removeFirst()
        guard let top = presenter() else {
            discard(file)
            return showNext()
        }
        showing = file
        if preview && QLPreviewController.canPreview(file as NSURL) {
            let viewer = QLPreviewController()
            viewer.dataSource = self
            viewer.delegate = self
            top.present(viewer, animated: true)
            return
        }
        let picker = UIDocumentPickerViewController(forExporting: [file], asCopy: true)
        picker.delegate = self
        top.present(picker, animated: true)
    }

    // Quick Look: the one file being shown; its share button saves or sends it.
    func numberOfPreviewItems(in controller: QLPreviewController) -> Int { showing == nil ? 0 : 1 }

    func previewController(_ controller: QLPreviewController, previewItemAt index: Int) -> QLPreviewItem {
        (showing ?? Downloads.directory) as NSURL
    }

    /// Viewing only: the preview offers no markup that would change the file.
    func previewController(_ controller: QLPreviewController, editingModeFor previewItem: QLPreviewItem) -> QLPreviewItemEditingMode { .disabled }

    func previewControllerDidDismiss(_ controller: QLPreviewController) {
        sheetEnded()
    }

    func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
        sheetEnded()
    }

    func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
        sheetEnded()
    }

    private func sheetEnded() {
        if let file = showing { discard(file) }
        showing = nil
        showNext()
    }

    /// Removes a download's file with the directory made for it.
    private func discard(_ file: URL) {
        try? FileManager.default.removeItem(at: file.deletingLastPathComponent())
    }
}
