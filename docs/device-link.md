# Nexus linked-device sign-in and Battery Watch

## How to use
1. On a new computer or browser, open `/link-device` from the Nexus sign-in screen.
2. Request a six-digit code (valid for five minutes).
3. On a phone already signed in to **the same Nexus account**, open `/phone` and enter the six digits in **Approve a new device**. Never enter an unexpected code.
4. The new browser polls for approval, exchanges its private 256-bit verifier once, and completes the Supabase magic-link verification automatically.
5. Open Phone Link to view device battery level, charging, last update, and live/offline state. Choose a low-battery threshold and opt into browser notifications. This alert is **not a background push service**.

## Setup / rollout
- Apply `supabase/migrations/20261123143000_nexus_device_link_codes.sql` **after** the earlier Phone Link migrations.
- Deploy `supabase/functions/device-link/index.ts` with `supabase functions deploy device-link --no-verify-jwt`. Anonymous code creation and redemption require it; the Edge Function verifies the JWT **and** account MFA assurance explicitly for approvals.
- Ensure `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` are configured. Optional `DEVICE_LINK_IP_PEPPER` should be a random secret for privacy-preserving per-IP throttling.
- Deploy the Next.js app. Test sign-in from an incognito browser paired with an authenticated phone; check code expiry, incorrect codes, re-use, cancellation, MFA challenges, and multiple devices.
- Keep Supabase Auth email magic links enabled. The admin API **generates**, but does not email, the one-time magic link. No service-role key or OTP is persisted in browser storage.

## Security model
- Six digits are a *display/approval code*, not a credential. Only the new browser holds the separate random verifier saved in its tab's session storage.
- Codes expire after five minutes and are single-use. Creation is capped to eight requests per IP per ten minutes; approval guesses are capped to eight per signed-in account and forty per IP per ten minutes, enforced in the database.
- Approval requires a validated signed-in phone session at the account's required MFA assurance level. The device screen redeems approval once and uses a one-time Supabase Auth token. Future sign-ins still obey Nexus account MFA checks.
- Database tables contain only hashes of codes/verifiers/IP fingerprints and have no public access. Cleanup of expired entries can run daily.

## Battery and browser limitations
- Supported browsers may use `navigator.getBattery()`. **iPhone/iPad Safari does not expose battery percentage.**
- Installed Capacitor apps can report battery through the Device plugin. Native battery is re-read every 20 seconds while Nexus is active.
- Closed mobile tabs, suspended background apps, or unavailable APIs do not report live percentages; the UI displays last-update status rather than claiming it is fresh.
- Browser notifications require permission and only fire while the Battery Watch page is open; this is not OS-level background monitoring.

## Verification
Run `npm run typecheck` and `npm run build`. Manual: create/approve/redeem, deny by not approving, wait for expiry, attempt code reuse, revoke auth session, verify MFA and user isolation, confirm battery percentages/charging and offline stale indicators on iOS/Android. No live Supabase Auth operation was performed in the authoring environment.
