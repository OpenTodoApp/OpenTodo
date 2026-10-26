import Foundation

/// The address rules of the first-run screen (native-shells, "Secure addresses only"):
/// https anywhere; plain http only for this device, the local network and `.local` names,
/// accepted with a warning. Mirrors `mobile/android/app/src/main/java/app/opentodo/ServerAddress.kt`.
enum ServerAddress: Equatable {
    /// A usable origin such as `https://todo.example.com` or `http://192.168.1.4:8080`.
    case ok(origin: String, insecure: Bool)
    /// Plain http to a public name: refused, with the https address to offer instead.
    case needsHttps(suggestion: String)
    case invalid

    static func parse(_ input: String) -> ServerAddress {
        var text = input.trimmingCharacters(in: .whitespacesAndNewlines)
        if text.isEmpty || text.contains(where: { $0.isWhitespace }) { return .invalid }
        if !text.contains("://") { text = "https://" + text }
        guard let url = URL(string: text),
              let scheme = url.scheme?.lowercased(), scheme == "https" || scheme == "http",
              let rawHost = url.host, !rawHost.isEmpty,
              url.user == nil, url.password == nil, url.query == nil, url.fragment == nil,
              url.path.isEmpty || url.path == "/"
        else { return .invalid }

        let host = normaliseHost(rawHost)
        if host.isEmpty { return .invalid }
        let port = url.port
        if let port, port < 1 || port > 65535 { return .invalid }

        let hostPart = host.contains(":") ? "[\(host)]" : host
        let defaultPort = scheme == "https" ? 443 : 80
        let suffix = port == nil || port == defaultPort ? "" : ":\(port!)"
        let origin = "\(scheme)://\(hostPart)\(suffix)"
        if scheme == "https" { return .ok(origin: origin, insecure: false) }
        if isLocal(host) { return .ok(origin: origin, insecure: true) }
        let httpsPort = port == nil || port == 80 ? "" : ":\(port!)"
        return .needsHttps(suggestion: "https://\(hostPart)\(httpsPort)")
    }

    /// This device, private IPv4 ranges, IPv6 loopback, unique-local and link-local, and `.local` names.
    static func isLocal(_ rawHost: String) -> Bool {
        let host = normaliseHost(rawHost)
        if host == "localhost" || host.hasSuffix(".localhost") || host.hasSuffix(".local") { return true }
        let v4 = host.split(separator: ".", omittingEmptySubsequences: false)
        if v4.count == 4, v4.allSatisfy({ !$0.isEmpty && $0.count <= 3 && $0.allSatisfy(\.isNumber) && Int($0)! <= 255 }) {
            let a = Int(v4[0])!, b = Int(v4[1])!
            return a == 127 || a == 10 || (a == 172 && (16...31).contains(b)) || (a == 192 && b == 168) || (a == 169 && b == 254)
        }
        if host.contains(":") {
            return host == "::1" || host.hasPrefix("fc") || host.hasPrefix("fd") || host.hasPrefix("fe8")
                || host.hasPrefix("fe9") || host.hasPrefix("fea") || host.hasPrefix("feb")
        }
        return false
    }

    /// Lowercase, no trailing dot, no IPv6 brackets.
    private static func normaliseHost(_ rawHost: String) -> String {
        var host = rawHost.lowercased()
        if host.hasPrefix("[") && host.hasSuffix("]") { host = String(host.dropFirst().dropLast()) }
        if host.hasSuffix(".") { host = String(host.dropLast()) }
        return host
    }
}
