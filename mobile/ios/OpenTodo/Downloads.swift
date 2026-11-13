import Foundation
import UIKit
import WebKit

/// Saving a file (shell-repairs D3, native-shells "Saving files"): WebKit downloads what
/// the web app saves, from its own data (`blob:`) or from the server, and the system's
/// export sheet asks where it goes. The rules are pure, so the tests need no web view.
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

    /// `Content-Disposition: attachment; filename=…`.
    static func isAttachment(_ response: URLResponse) -> Bool {
        guard let http = response as? HTTPURLResponse,
              let disposition = http.value(forHTTPHeaderField: "Content-Disposition") else { return false }
        return disposition.trimmingCharacters(in: .whitespaces).lowercased().hasPrefix("attachment")
    }

    /// The suggested name reduced to its last path component, so it cannot leave the
    /// temporary directory; `download` when nothing usable is left.
    static func fileName(_ suggested: String) -> String {
        let parts = suggested.split(whereSeparator: { $0 == "/" || $0 == "\\" })
        let name = (parts.last.map(String.init) ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        if name.isEmpty || name == "." || name == ".." { return "download" }
        return name
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
final class DownloadSaver: NSObject, WKDownloadDelegate, UIDocumentPickerDelegate {
    /// The view controller the export sheet is presented from.
    private let presenter: () -> UIViewController?
    /// Downloads under way, by identity: the download itself (its delegate is weak) and its file.
    private var running: [ObjectIdentifier: (download: WKDownload, file: URL)] = [:]
    /// Finished files waiting for the sheet; one sheet at a time.
    private var finished: [URL] = []
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
        running[ObjectIdentifier(download)] = (download, file)
        completionHandler(file)
    }

    func downloadDidFinish(_ download: WKDownload) {
        guard let entry = running.removeValue(forKey: ObjectIdentifier(download)) else { return }
        finished.append(entry.file)
        showNext()
    }

    func download(_ download: WKDownload, didFailWithError error: Error, resumeData: Data?) {
        guard let entry = running.removeValue(forKey: ObjectIdentifier(download)) else { return }
        discard(entry.file)
    }

    private func showNext() {
        guard showing == nil, !finished.isEmpty else { return }
        let file = finished.removeFirst()
        guard let top = presenter() else {
            discard(file)
            return showNext()
        }
        showing = file
        let picker = UIDocumentPickerViewController(forExporting: [file], asCopy: true)
        picker.delegate = self
        top.present(picker, animated: true)
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
