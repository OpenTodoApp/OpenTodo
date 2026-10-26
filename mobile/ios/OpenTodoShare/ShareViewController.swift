import UIKit
import UniformTypeIdentifiers

/// The share extension (ios-shell design D5): text, links and files go into the App Group,
/// then the app opens on the capture screen. A share extension cannot open its app
/// directly, so this uses the responder chain's `openURL:` — the one technique here that
/// a store review would question (the app is distributed as source, so nothing is).
final class ShareViewController: UIViewController {
    private var title_: String?
    private var text: String?
    private var url: String?
    private var files: [ShareInbox.File] = []
    private var pending = 0

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .clear
        collect()
    }

    private func collect() {
        let items = (extensionContext?.inputItems as? [NSExtensionItem]) ?? []
        let providers = items.flatMap { $0.attachments ?? [] }
        title_ = items.compactMap { $0.attributedTitle?.string }.first
        text = items.compactMap { $0.attributedContentText?.string }.first
        pending = providers.count
        if pending == 0 { return finish() }
        for provider in providers { load(provider) }
    }

    private func load(_ provider: NSItemProvider) {
        if provider.hasItemConformingToTypeIdentifier(UTType.url.identifier) {
            provider.loadItem(forTypeIdentifier: UTType.url.identifier, options: nil) { item, _ in
                let value = (item as? URL)?.absoluteString ?? (item as? String)
                self.done { if let value, self.url == nil { self.url = value } }
            }
        } else if provider.hasItemConformingToTypeIdentifier(UTType.plainText.identifier) {
            provider.loadItem(forTypeIdentifier: UTType.plainText.identifier, options: nil) { item, _ in
                let value = item as? String
                self.done { if let value, self.text == nil { self.text = value } }
            }
        } else {
            let type = provider.registeredTypeIdentifiers.first(where: { UTType($0)?.conforms(to: .item) == true }) ?? UTType.data.identifier
            provider.loadFileRepresentation(forTypeIdentifier: type) { temp, _ in
                self.done { if let saved = self.save(temp, provider: provider, type: type) { self.files.append(saved) } }
            }
        }
    }

    private func save(_ temp: URL?, provider: NSItemProvider, type: String) -> ShareInbox.File? {
        guard let temp else { return nil }
        let name = provider.suggestedName ?? temp.lastPathComponent
        let path = "\(ShareInbox.directory)/\(UUID().uuidString)-\(name.replacingOccurrences(of: "/", with: "-"))"
        let target = Store.url(path)
        try? FileManager.default.createDirectory(at: target.deletingLastPathComponent(), withIntermediateDirectories: true)
        guard (try? FileManager.default.copyItem(at: temp, to: target)) != nil else { return nil }
        return ShareInbox.File(name: name, type: UTType(type)?.preferredMIMEType ?? "application/octet-stream", path: path)
    }

    private func done(_ work: @escaping () -> Void) {
        DispatchQueue.main.async {
            work()
            self.pending -= 1
            if self.pending <= 0 { self.finish() }
        }
    }

    private func finish() {
        let entry = ShareInbox.Entry(title: title_, text: text, files: files)
        if let data = try? JSONEncoder().encode(entry) { Store.write(data, ShareInbox.fileName) }
        // A link alone is the URL; everything else goes as text, as the web share target does.
        if url == nil, let text, text.range(of: "^https?://\\S+$", options: .regularExpression) != nil {
            url = text
            self.text = nil
        }
        open(URL(string: "opentodo://share")!) { [weak self] in
            self?.extensionContext?.completeRequest(returningItems: nil)
        }
    }

    private func open(_ url: URL, done: @escaping () -> Void) {
        var responder: UIResponder? = self
        let selector = sel_registerName("openURL:")
        while let current = responder {
            if current.responds(to: selector) {
                current.perform(selector, with: url)
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.3, execute: done)
                return
            }
            responder = current.next
        }
        done()
    }
}
