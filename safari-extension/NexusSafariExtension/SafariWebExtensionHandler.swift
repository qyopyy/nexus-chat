import SafariServices
import os.log

class SafariWebExtensionHandler: NSObject, NSExtensionRequestHandling {
    private let log = Logger(subsystem: "hu.qyopy.nexus.safari.extension", category: "handler")

    func beginRequest(with context: NSExtensionContext) {
        let item = context.inputItems.first as? NSExtensionItem
        let message = item?.userInfo?[SFExtensionMessageKey]

        var responsePayload: [String: Any] = [
            "ok": true,
            "source": "NexusSafariExtension",
        ]

        if let dict = message as? [String: Any],
           let type = dict["type"] as? String {
            switch type {
            case "getPresets":
                responsePayload["presets"] = loadPresets()
            case "ping":
                responsePayload["pong"] = true
            default:
                responsePayload["ok"] = false
                responsePayload["error"] = "unknown_type"
            }
            log.info("Handled native message type=\(type, privacy: .public)")
        }

        let response = NSExtensionItem()
        response.userInfo = [SFExtensionMessageKey: responsePayload]
        context.completeRequest(returningItems: [response], completionHandler: nil)
    }

    private func loadPresets() -> [String: Any] {
        let defaults = UserDefaults(suiteName: "group.hu.qyopy.nexus.safari") ?? .standard
        let allowlist = (defaults.string(forKey: "allowlist") ?? "nexusproject.cc\nlocalhost")
            .split(whereSeparator: \.isNewline)
            .map { String($0).trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty }

        if let container = FileManager.default.containerURL(
            forSecurityApplicationGroupIdentifier: "group.hu.qyopy.nexus.safari"
        ) {
            let file = container.appendingPathComponent("safari-presets.json")
            if let data = try? Data(contentsOf: file),
               let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
                return json
            }
        }

        return [
            "blockTrackers": defaults.object(forKey: "blockTrackers") as? Bool ?? true,
            "httpsUpgrade": defaults.object(forKey: "httpsUpgrade") as? Bool ?? true,
            "stripNoiseParams": defaults.object(forKey: "stripNoiseParams") as? Bool ?? true,
            "showHud": defaults.object(forKey: "showHud") as? Bool ?? false,
            "dnsHint": defaults.string(forKey: "dnsHint") ?? "system",
            "allowlist": allowlist,
        ]
    }
}
