import Foundation

/// An origin as the bridge and the navigation rules compare it: scheme, host and port.
/// `https://todo.example.com`, `https://todo.example.com/` and
/// `https://todo.example.com:443/today` are one origin.
enum Origin {
    static func signature(_ url: URL) -> String {
        let scheme = (url.scheme ?? "").lowercased()
        return signature(scheme: scheme, host: url.host ?? "", port: url.port ?? (scheme == "https" ? 443 : 80))
    }

    /// The same string from the parts WebKit reports for a frame or a security origin.
    static func signature(scheme: String, host: String, port: Int) -> String {
        "\(scheme.lowercased())://\(host.lowercased()):\(port)"
    }

    static func same(_ a: URL, _ b: URL) -> Bool {
        !(a.host ?? "").isEmpty && signature(a) == signature(b)
    }

    /// `scheme://host[:port]` with a default port left out, which is what `location.origin` prints.
    static func pageOrigin(_ url: URL) -> String {
        guard var c = URLComponents(url: url, resolvingAgainstBaseURL: false), let host = c.host else { return "" }
        c.host = host.lowercased()
        if c.port == 443 || c.port == 80 { c.port = nil }
        c.path = ""
        c.query = nil
        c.fragment = nil
        c.user = nil
        c.password = nil
        return c.string ?? ""
    }
}
