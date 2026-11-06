import SwiftUI
import SafariServices

@main
struct NexusSafariManagerApp: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
                .frame(minWidth: 720, minHeight: 520)
        }
        .windowResizability(.contentSize)
    }
}

struct ContentView: View {
    @StateObject private var store = ExtensionSettingsStore()
    @State private var extensionState: String = "Checking…"

    var body: some View {
        HStack(spacing: 0) {
            sidebar
            Divider()
            mainPane
        }
        .background(Color(nsColor: .windowBackgroundColor))
        .onAppear(refreshExtensionState)
    }

    private var sidebar: some View {
        VStack(alignment: .leading, spacing: 16) {
            Label("Nexus Safari", systemImage: "safari")
                .font(.title2.bold())
            Text("Extension Manager")
                .foregroundStyle(.secondary)

            GroupBox("Extension") {
                VStack(alignment: .leading, spacing: 10) {
                    Text(extensionState)
                        .font(.callout)
                    Button("Open Safari Extension Settings") {
                        openSafariPreferences()
                    }
                    .buttonStyle(.borderedProminent)
                    Button("Refresh status") { refreshExtensionState() }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(4)
            }

            GroupBox("Quick links") {
                VStack(alignment: .leading, spacing: 8) {
                    linkButton("Nexus", "https://nexusproject.cc")
                    linkButton("Nexus Browser", "https://nexusproject.cc/browser/app")
                    linkButton("Wump", "https://nexusproject.cc/wump/app")
                    linkButton("Privacy", "https://nexusproject.cc/privacy")
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(4)
            }

            Spacer()
            Text("Xcode Cloud · hu.qyopy.nexus.safari")
                .font(.caption2)
                .foregroundStyle(.tertiary)
        }
        .padding(20)
        .frame(width: 280)
    }

    private var mainPane: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                Text("Shields & presets")
                    .font(.title3.bold())
                Text("These presets sync into the Safari extension via shared App Group storage when available, and into `browser.storage` when the popup runs.")
                    .foregroundStyle(.secondary)

                Toggle("Block trackers (default shields)", isOn: $store.blockTrackers)
                Toggle("Upgrade connections to HTTPS when possible", isOn: $store.httpsUpgrade)
                Toggle("Hide referral query noise on nexusproject.cc", isOn: $store.stripNoiseParams)
                Toggle("Show page HUD on Nexus domains", isOn: $store.showHud)

                Picker("DNS hint shown in popup", selection: $store.dnsHint) {
                    Text("System").tag("system")
                    Text("Cloudflare 1.1.1.1").tag("cloudflare")
                    Text("NextDNS").tag("nextdns")
                    Text("Quad9").tag("quad9")
                }

                Divider()

                Text("Allowlist hosts (one per line)")
                    .font(.headline)
                TextEditor(text: $store.allowlistText)
                    .font(.system(.body, design: .monospaced))
                    .frame(minHeight: 120)
                    .border(Color.secondary.opacity(0.3))

                HStack {
                    Button("Save presets") { store.save() }
                        .buttonStyle(.borderedProminent)
                    Button("Reset defaults") { store.reset() }
                    Spacer()
                    Text(store.status)
                        .foregroundStyle(.secondary)
                }
            }
            .padding(28)
        }
    }

    private func linkButton(_ title: String, _ url: String) -> some View {
        Button(title) {
            if let u = URL(string: url) { NSWorkspace.shared.open(u) }
        }
        .buttonStyle(.link)
    }

    private func openSafariPreferences() {
        SFSafariApplication.showPreferencesForExtension(
            withIdentifier: ExtensionIds.extensionBundleId
        ) { error in
            DispatchQueue.main.async {
                if let error {
                    extensionState = "Could not open Safari settings: \(error.localizedDescription)"
                } else {
                    extensionState = "Safari Extension Settings opened — enable “Nexus Safari Manager”."
                }
            }
        }
    }

    private func refreshExtensionState() {
        SFSafariExtensionManager.getStateOfSafariExtension(
            withIdentifier: ExtensionIds.extensionBundleId
        ) { state, error in
            DispatchQueue.main.async {
                if let error {
                    extensionState = "Status unavailable: \(error.localizedDescription)"
                    return
                }
                guard let state else {
                    extensionState = "Extension not found. Build & run from Xcode, then enable in Safari."
                    return
                }
                extensionState = state.isEnabled
                    ? "Enabled in Safari"
                    : "Installed but disabled — open Safari settings to enable."
            }
        }
    }
}

enum ExtensionIds {
    static let extensionBundleId = "hu.qyopy.nexus.safari.extension"
    static let appGroupId = "group.hu.qyopy.nexus.safari"
}
