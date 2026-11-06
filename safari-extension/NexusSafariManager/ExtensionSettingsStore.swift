import Foundation
import Combine

final class ExtensionSettingsStore: ObservableObject {
    @Published var blockTrackers: Bool
    @Published var httpsUpgrade: Bool
    @Published var stripNoiseParams: Bool
    @Published var showHud: Bool
    @Published var dnsHint: String
    @Published var allowlistText: String
    @Published var status: String = "Ready"

    private let defaults: UserDefaults

    init() {
        let suite = UserDefaults(suiteName: ExtensionIds.appGroupId) ?? .standard
        self.defaults = suite
        self.blockTrackers = suite.object(forKey: Keys.blockTrackers) as? Bool ?? true
        self.httpsUpgrade = suite.object(forKey: Keys.httpsUpgrade) as? Bool ?? true
        self.stripNoiseParams = suite.object(forKey: Keys.stripNoiseParams) as? Bool ?? true
        self.showHud = suite.object(forKey: Keys.showHud) as? Bool ?? false
        self.dnsHint = suite.string(forKey: Keys.dnsHint) ?? "system"
        self.allowlistText = suite.string(forKey: Keys.allowlist) ?? "nexusproject.cc\nlocalhost"
    }

    func save() {
        defaults.set(blockTrackers, forKey: Keys.blockTrackers)
        defaults.set(httpsUpgrade, forKey: Keys.httpsUpgrade)
        defaults.set(stripNoiseParams, forKey: Keys.stripNoiseParams)
        defaults.set(showHud, forKey: Keys.showHud)
        defaults.set(dnsHint, forKey: Keys.dnsHint)
        defaults.set(allowlistText, forKey: Keys.allowlist)
        defaults.synchronize()
        // Mirror into extension resource snapshot for Safari Web Extension messaging.
        writeSharedSnapshot()
        status = "Saved \(Self.timestamp())"
    }

    func reset() {
        blockTrackers = true
        httpsUpgrade = true
        stripNoiseParams = true
        showHud = false
        dnsHint = "system"
        allowlistText = "nexusproject.cc\nlocalhost"
        save()
        status = "Defaults restored \(Self.timestamp())"
    }

    private func writeSharedSnapshot() {
        let hosts = allowlistText
            .split(whereSeparator: \.isNewline)
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty }
        let payload: [String: Any] = [
            "blockTrackers": blockTrackers,
            "httpsUpgrade": httpsUpgrade,
            "stripNoiseParams": stripNoiseParams,
            "showHud": showHud,
            "dnsHint": dnsHint,
            "allowlist": hosts,
            "updatedAt": ISO8601DateFormatter().string(from: Date()),
        ]
        guard
            let data = try? JSONSerialization.data(withJSONObject: payload, options: [.prettyPrinted]),
            let container = FileManager.default.containerURL(
                forSecurityApplicationGroupIdentifier: ExtensionIds.appGroupId
            )
        else {
            return
        }
        try? data.write(to: container.appendingPathComponent("safari-presets.json"), options: .atomic)
    }

    private static func timestamp() -> String {
        let f = DateFormatter()
        f.dateStyle = .none
        f.timeStyle = .medium
        return f.string(from: Date())
    }

    private enum Keys {
        static let blockTrackers = "blockTrackers"
        static let httpsUpgrade = "httpsUpgrade"
        static let stripNoiseParams = "stripNoiseParams"
        static let showHud = "showHud"
        static let dnsHint = "dnsHint"
        static let allowlist = "allowlist"
    }
}
