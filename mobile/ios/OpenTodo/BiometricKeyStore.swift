import Foundation
import LocalAuthentication
import Security

/// The account key behind Face ID or Touch ID (ios-shell design D6): a Keychain item that
/// only a successful biometric prompt unlocks and that an enrolment change invalidates —
/// the iOS equivalent of Android's `setInvalidatedByBiometricEnrollment`.
enum BiometricKeyStore {
    private static let service = "app.opentodo.biometric"
    private static let account = "account-key"

    static var available: Bool {
        let context = LAContext()
        return context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: nil)
    }

    /// A raw 32-byte account key; anything else is refused before it reaches the Keychain.
    static func decode(_ base64: String) -> Data? {
        guard let data = Data(base64Encoded: base64, options: [.ignoreUnknownCharacters]), data.count == 32 else { return nil }
        return data
    }

    static func store(_ key: Data) -> Bool {
        guard key.count == 32 else { return false }
        forget()
        var error: Unmanaged<CFError>?
        guard let access = SecAccessControlCreateWithFlags(nil, kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
                                                          .biometryCurrentSet, &error) else { return false }
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecValueData as String: key,
            kSecAttrAccessControl as String: access,
        ]
        return SecItemAdd(query as CFDictionary, nil) == errSecSuccess
    }

    static func read() -> String? {
        let context = LAContext()
        context.localizedReason = String(localized: "Unlock your OpenTodo account")
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
            kSecUseAuthenticationContext as String: context,
            kSecUseOperationPrompt as String: String(localized: "Unlock your OpenTodo account"),
        ]
        var item: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess,
              let data = item as? Data, data.count == 32 else { return nil }
        return data.base64EncodedString()
    }

    static func forget() {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
        SecItemDelete(query as CFDictionary)
    }
}
