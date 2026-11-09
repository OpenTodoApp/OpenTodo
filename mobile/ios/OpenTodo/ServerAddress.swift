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
        // No scheme typed: the address is reached over https (the first-run screen shows it).
        if !text.contains("://") { text = "https://" + text }
        guard let ascii = asciiHost(text), let url = URL(string: ascii),
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

    /// The address with a host typed in Unicode (`bücher.example`) in the ASCII form the network
    /// uses (`xn--bcher-kva.example`), whatever this iOS version's own URL parsing does with it;
    /// `nil` when a label cannot be encoded. Anything else is left for `URL` to judge.
    static func asciiHost(_ text: String) -> String? {
        guard let schemeEnd = text.range(of: "://") else { return text }
        let rest = text[schemeEnd.upperBound...]
        let end = rest.firstIndex(where: { "/?#".contains($0) }) ?? rest.endIndex
        let authority = rest[..<end]
        if authority.allSatisfy(\.isASCII) || authority.contains("@") || authority.contains("[") { return text }
        var host = authority, port: Substring = ""
        if let colon = authority.lastIndex(of: ":") { host = authority[..<colon]; port = authority[colon...] }
        var labels: [String] = []
        for label in host.split(separator: ".", omittingEmptySubsequences: false) {
            let folded = String(label).precomposedStringWithCanonicalMapping.lowercased()
            if folded.allSatisfy(\.isASCII) { labels.append(folded); continue }
            guard let encoded = punycode(folded), encoded.count <= 59 else { return nil }
            labels.append("xn--" + encoded)
        }
        return String(text[..<schemeEnd.upperBound]) + labels.joined(separator: ".") + port + rest[end...]
    }

    /// RFC 3492 Punycode of one label, without the `xn--` prefix.
    static func punycode(_ label: String) -> String? {
        let base = 36, tMin = 1, tMax = 26, skew = 38, damp = 700
        let input = label.unicodeScalars.map { Int($0.value) }
        if input.isEmpty || input.count > 63 { return nil }
        var output = label.unicodeScalars.filter(\.isASCII).map { Character($0) }
        let basic = output.count
        if basic > 0 { output.append("-") }
        func digit(_ d: Int) -> Character { Character(UnicodeScalar(UInt8(d < 26 ? d + 97 : d + 22))) }
        func adapt(_ delta: Int, _ points: Int, _ first: Bool) -> Int {
            var d = first ? delta / damp : delta / 2
            d += d / points
            var k = 0
            while d > ((base - tMin) * tMax) / 2 { d /= base - tMin; k += base }
            return k + (base - tMin + 1) * d / (d + skew)
        }
        var n = 0x80, delta = 0, bias = 72, handled = basic
        while handled < input.count {
            guard let next = input.filter({ $0 >= n }).min() else { return nil }
            delta += (next - n) * (handled + 1)
            n = next
            for c in input {
                if c < n { delta += 1 }
                if c == n {
                    var q = delta, k = base
                    while true {
                        let t = k <= bias ? tMin : (k >= bias + tMax ? tMax : k - bias)
                        if q < t { break }
                        output.append(digit(t + (q - t) % (base - t)))
                        q = (q - t) / (base - t)
                        k += base
                    }
                    output.append(digit(q))
                    bias = adapt(delta, handled + 1, handled == basic)
                    delta = 0
                    handled += 1
                }
            }
            delta += 1
            n += 1
        }
        return String(output)
    }

    /// Lowercase, no trailing dot, no IPv6 brackets.
    private static func normaliseHost(_ rawHost: String) -> String {
        var host = rawHost.lowercased()
        if host.hasPrefix("[") && host.hasSuffix("]") { host = String(host.dropFirst().dropLast()) }
        if host.hasSuffix(".") { host = String(host.dropLast()) }
        return host
    }
}
