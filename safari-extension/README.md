# Nexus Safari Extension Manager

macOS Safari Web Extension + container app that manages Nexus Browser shields,
allowlists, and quick links — built for **Xcode Cloud**.

## What’s included

| Path | Purpose |
|------|---------|
| `NexusSafariManager/` | SwiftUI container app (enable extension, open settings, manage presets) |
| `NexusSafariExtension/` | Safari Web Extension (MV3-compatible manifest + background/content/popup) |
| `project.yml` | [XcodeGen](https://github.com/yonaskolb/XcodeGen) spec → generates `.xcodeproj` |
| `ci_scripts/` | Xcode Cloud hooks (`ci_post_clone`, `ci_pre_xcodebuild`) |
| `docs/XCODE_CLOUD.md` | Wire this repo to App Store Connect → Xcode Cloud |

## Requirements

- macOS 14+ with Xcode 16+
- XcodeGen (`brew install xcodegen`)
- Safari 17+ (Develop → Allow Unsigned Extensions for local debug)

## Generate & run locally

```bash
cd safari-extension
brew install xcodegen   # once
xcodegen generate
open NexusSafariManager.xcodeproj
```

In Xcode:

1. Select scheme **NexusSafariManager**
2. Signing & Capabilities → your Team
3. Run (⌘R)
4. In the app, click **Open Safari Extension Settings** and enable **Nexus Safari Manager**

## Xcode Cloud

See [`docs/XCODE_CLOUD.md`](docs/XCODE_CLOUD.md). Summary:

1. Push this folder on `main` (or the branch you connect)
2. App Store Connect → your Mac app → Xcode Cloud → Create Workflow
3. Product: `NexusSafariManager`
4. Xcode Cloud runs `ci_scripts/ci_post_clone.sh` (installs XcodeGen + generates the project)

## Extension capabilities

- Popup: toggle shields presets, open Nexus Browser / Wump / Nexus
- Content script: optional lightweight page-title probe on `nexusproject.cc`
- Background: stores settings in `browser.storage.sync` / `local`
- Native messaging bridge via App Groups-ready settings mirror in the container app

Bundle IDs (change Team suffix if needed):

- App: `hu.qyopy.nexus.safari`
- Extension: `hu.qyopy.nexus.safari.extension`
