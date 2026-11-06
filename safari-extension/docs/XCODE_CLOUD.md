# Xcode Cloud — Nexus Safari Manager

Wire the macOS Safari Web Extension Manager to App Store Connect so every push
builds a signed archive ready for TestFlight / Mac App Store.

## One-time App Store Connect setup

1. **Create the Mac app** (if it does not exist yet)
   - Bundle ID: `hu.qyopy.nexus.safari`
   - Name: `Nexus Safari Manager`
2. **Register the Safari extension App ID**
   - Bundle ID: `hu.qyopy.nexus.safari.extension`
   - Enable **App Groups** → `group.hu.qyopy.nexus.safari`
3. Enable the same App Group on the container app ID.
4. In App Store Connect → the Mac app → **Xcode Cloud** → **Create Workflow**
   - Repository: this GitHub repo (`qyopyy/nexus-chat`)
   - Branch start: `main` (or a release branch)
   - Product / scheme: **NexusSafariManager**
   - Platform: macOS
   - Archive action: Archive - macOS → App Store Connect (or TestFlight Internal)
5. Under **Environment**, leave defaults. The `ci_scripts/` hooks install
   [XcodeGen](https://github.com/yonaskolb/XcodeGen) and generate
   `safari-extension/NexusSafariManager.xcodeproj` before `xcodebuild`.

## How Xcode Cloud finds `ci_scripts`

Xcode Cloud looks for `ci_scripts/` next to the Xcode project **or** at the
repository root. This repo keeps hooks in `safari-extension/ci_scripts/` so
they travel with the product. When creating the workflow:

- Set the **Xcode Project** path to  
  `safari-extension/NexusSafariManager.xcodeproj`  
  (generated in `ci_post_clone.sh`), **or**
- Point **Custom Scripts** / start directory at `safari-extension/`.

If your workflow’s working directory is the repo root, symlink or copy:

```bash
# optional: only if ASC workflow cannot use the nested folder
ln -s safari-extension/ci_scripts ci_scripts
```

Prefer configuring the workflow’s project path under `safari-extension/` so the
nested `ci_scripts/` are discovered automatically.

## Workflow actions (recommended)

| Action | Purpose |
|--------|---------|
| Start Condition | Branch changes on `main` + manual start |
| Environment | macOS 14+, Xcode 16+ |
| Build | Archive `NexusSafariManager` (Release) |
| Post-action | Distribute to App Store Connect / TestFlight |

## Local dry-run of CI scripts

```bash
cd safari-extension
chmod +x ci_scripts/*.sh
./ci_scripts/ci_post_clone.sh
./ci_scripts/ci_pre_xcodebuild.sh
# then on a Mac:
# xcodebuild -project NexusSafariManager.xcodeproj \
#   -scheme NexusSafariManager -configuration Release archive
```

## Signing notes

- Team ID used in `project.yml`: `B44X8B76QR`
- Automatic signing is enabled; Xcode Cloud will manage profiles for both the
  app and the `.appex` Safari Web Extension.
- Hardened Runtime is on for both targets.

## After first green build

1. Install the Mac build from TestFlight (or direct archive).
2. Open **Nexus Safari Manager** → **Open Safari Extension Settings**.
3. Enable the extension, then reload a `nexusproject.cc` tab.
