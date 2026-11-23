# Nexus Drop

Nexus Drop adds an AirDrop-style browser sharing screen to Nexus. Open **Nexus Drop** in the desktop sidebar, the mobile tools list, or the legacy workspace navigation.

| Host | Entry |
| --- | --- |
| Next.js | `/drop/index.html` |
| Legacy static workspace | `/public/drop/index.html` |

## Sharing experience

Create a room, copy or share its invitation, and open that invitation on another device. The room lists connected devices with their chosen names and a short device identifier. Select a device, choose files or a text note, and send. The recipient must accept before a peer connection is negotiated or any file content is transmitted.

- Up to 20 files and 100 MB in one transfer, including empty files.
- Notes and links up to 8,000 characters, with a copy button after receipt.
- File chooser and drag-and-drop selection, removable files, and aggregate size checks.
- Waiting, acceptance, connection, progress, confirmed-delivery, failure, and cancellation states.
- Explicit file downloads; received content is never automatically opened or executed.
- One active transfer per device. Completed or failed transfers can be dismissed before sending again.
- Received items remain in the tab until cleared or closed. Download files before clearing them. The UI bounds retained downloads to 100 MB and 40 items and revokes object URLs when clearing the tab's received items.
- Reduced-motion styling and keyboard controls.

This pairs browsers through an invitation. It does not implement Apple's proprietary AirDrop protocol, Bluetooth discovery, or automatic physical-proximity discovery. Both pages must stay open and awake. Device names are self-selected and are not authenticated account identities.

## Transport and configuration

The files are static, with no new package or CDN dependency. They reuse the repository's pinned Supabase browser SDK and the public project settings from `public/presave/config.js`. Optional `window.NEXUS_DROP_CONFIG` can provide a separate public `supabaseUrl` and `supabaseKey` before the app module loads. Never use a service-role key in browser configuration.

Supabase Realtime Broadcast carries pairing and connection signaling. The deployment must allow public Realtime channels and the publishable key must belong to that project. No new table or Edge Function is required for this browser-to-browser path. If the connection service is unavailable, the interface reports that state; local same-origin tabs can still discover each other through `BroadcastChannel`.

Each room has a cryptographically random 256-bit invitation capability. It stays in the URL fragment, which is not sent in HTTP page requests. Signaling uses AES-GCM with that capability; the provider sees a hashed room topic and encrypted messages. Replay IDs, timestamp bounds, peer/transfer binding, and bounded message/participant sizes limit accidental duplicate and invalid messages. Anyone given the invitation can join and participate; create a fresh room when the audience changes. Invitations are not expiring server-managed accounts or access lists.

After acceptance, the browser establishes a reliable, ordered WebRTC data channel. File bytes travel through that connection rather than Supabase Storage or Broadcast. The transfer protocol uses 16 KB chunks and buffered-amount backpressure, validates file order and exact byte counts, and only reports sender success after the receiver acknowledges complete content. It does not persist partial files or resume interrupted transfers. The receiver buffers accepted content in memory; transient memory usage can exceed the 100 MB payload bound while building downloadable blobs.

`public/drop/config.js` supplies the public Cloudflare STUN service. STUN helps find a direct network route; it cannot relay through every firewall. This release works best on the same Wi-Fi. Restrictive NATs, corporate networks, mobile background suspension, or embedded webview restrictions can prevent delivery. The connection timeout explains the failure and points to the existing Phone Link cloud inbox. No file is silently uploaded as a fallback.

For broad cross-network delivery, integrate a backend-issued **short-lived TURN credential** provider and supply its `RTCIceServer` entries to the RTC configuration. Do not commit long-lived TURN passwords or provider API keys. A TURN relay is not provisioned by this change.

Official references used for the implementation:

- [Supabase Realtime Broadcast](https://supabase.com/docs/guides/realtime/broadcast)
- [WebRTC data channels, buffering, and transport encryption](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Using_data_channels)
- [Cloudflare STUN service and network connection patterns](https://developers.cloudflare.com/realtime/sfu/get-started/connection-patterns/)

## Existing cloud inbox fixes

The separate Phone Link cloud inbox continues to use the existing `nexus_drops` table and private `nexus-drops` bucket, with a 100 MB file limit and at most 24-hour access. This change repairs its popup handling and reports inbox errors with a Retry action. A download tab is reserved synchronously on the click, detached from its opener, navigated after signing, and only then acknowledged. A failed acknowledgement reports that distinction without closing a working download.

Apply `supabase/migrations/20261123130000_nexus_drop_hardening.sql` after the existing `20261110230000_nexus_drop_cloud.sql` migration. It validates that a transfer refers to a real sender-owned object of the claimed size, enforces bounded expiry and immutable file metadata, and grants recipients write access only to the acknowledgement column. The storage read policy also checks legacy row ownership and size. Existing cloud files remain private. This migration does not automatically delete expired stored files; storage cleanup remains an operator task.

The new pre-save appearance migration is independent; see [the pre-save deployment guide](presave-service.md) for migration → Edge Function → frontend rollout order.

## Verification

Run the dependency-free protocol and cryptography tests with:

```sh
npm run test:drop
```

The protocol tests exercise production transfer code with paired deterministic RTC channel adapters. They cover consent, exact multi-file/empty-file/note delivery, acknowledgement, backpressure, forged/oversized/truncated content, cancellation, disconnects, deadlines, stale asynchronous failures, and encrypted/replayed signaling.

The integration suite also runs actual application DOM code and the cloud-inbox PostgreSQL migration. Install its optional test dependencies in an isolated directory and point the tests at them:

```sh
npm install --prefix /tmp/nexus-drop-qa --no-audit --no-fund \
  @electric-sql/pglite@0.5.17 jsdom@31.0.1 esbuild@0.28.2
NEXUS_DROP_PGLITE_MODULE=/tmp/nexus-drop-qa/node_modules/@electric-sql/pglite/dist/index.cjs \
NEXUS_DROP_QA_PACKAGE=/tmp/nexus-drop-qa/package.json \
  npm run test:drop:integration
```

Use Node 24.15 or newer for the optional DOM suite. Missing optional dependencies produce explicit skips; an incorrect explicit dependency path fails. The `Nexus Drop checks` GitHub workflow installs these dependencies and runs all Drop tests.

The authoring environment's preview relay was unavailable. Rendered desktop/mobile layouts and native browser WebRTC across real devices are therefore unverified. Before release, open two physical devices, accept and decline transfers, download and compare a multi-file batch, cancel mid-transfer, test a disconnected peer, and confirm the failure message on a network that blocks direct connections. Run the cloud-inbox ownership/download checks against the configured staging Supabase project after applying its migration.
