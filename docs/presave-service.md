# Nexus Pre-save service

Nexus Pre-save adds independent, customizable campaigns to `qyopyy/nexus-chat`. Campaign creation is not tied to a distribution release, subscription plan, or application-level campaign quota. Storage, database capacity, hosting, and Spotify's own access limits still apply.

## User experience

Open **Pre-save links** in the Next.js desktop sidebar, the mobile tools list, or the legacy static workspace. Sign in with an existing Nexus account or create one through the existing Nexus signup function. Same-origin sessions use the standard Supabase session key. TOTP MFA is supported; passkey users can complete authentication in the existing Nexus login screen.

The service includes:

- A paginated, searchable campaign dashboard with published/draft filters.
- Unlimited campaign creation; independent public URLs and private drafts.
- Editing, duplication into a fresh private draft, publication, unpublication, and deletion.
- Custom title, artist, description, release time, slug, cover artwork, theme, layout, accent, button text, and countdown.
- Four starter looks: Midnight, Paper, Aurora, and Sunset.
- JPG, PNG, or WebP artwork uploads up to 5 MB, plus external HTTPS image URLs.
- Up to twelve destination buttons per campaign. This is a page-content bound, not a campaign-count limit.
- View and destination-click counts, Spotify authorization counts, and completed-save counts.
- Public pages that visitors can open without a Nexus account.
- Real Spotify authorization and scheduled library saves after configuration.
- A private cancellation capability and a verified status receipt for each fan authorization.

The editor and template previews work before signing in. Only a successful server save creates a persistent campaign. The UI does not create local-only campaigns that appear to have been published.

## Existing repository compatibility

The repository currently contains two application entry points. This implementation uses one set of static files to work with either:

| Host | Entry URL |
| --- | --- |
| Next.js (`npm run dev`, or `npm run build` then `npm start`) | `/presave/index.html` |
| Legacy static workspace (`npm run start:static`) | `/public/presave/index.html` |

The assets are relative to `index.html`, and public links use `?slug=your-release`, so no rewrite rule is required. Choose one canonical HTTPS entry URL for production and set `PRESAVE_PUBLIC_URL` to it.

The root manifest and lockfile run the Next.js application in `src/`. The web workflow installs the locked dependencies, type-checks the app, runs the existing app tests and dependency-free pre-save tests, and creates a production build. A separate `Pre-save checks` workflow also exercises the database and DOM integration tests.

The existing distribution-based `/l/[slug]` smart-link system is unchanged.

## Files and architecture

| Location | Role |
| --- | --- |
| `public/presave/` | Standalone dashboard, editor, auth UI, and public pages |
| `public/presave/config.js` | Public Supabase URL and publishable key |
| `public/presave/vendor/` | Locally served, pinned Supabase SDK; no CDN script dependency |
| `supabase/migrations/20261121180000_presave_service.sql` | Tables, RLS, validation, RPCs, artwork bucket, worker leases |
| `supabase/functions/presave/index.ts` | Supabase Edge entry |
| `supabase/functions/presave/handler.mjs` | Request handling and Spotify workflow |
| `supabase/functions/presave/core.mjs` | Validation, PKCE, encryption, retry logic |
| `supabase/presave-schedule.sql` | Optional release-worker schedule |
| `tests/presave*.test.mjs` | Focused frontend, handler, and PostgreSQL checks |

## Deploy the basic service

Use the Supabase project that already owns Nexus accounts. `public/presave/config.js` starts with the existing public settings from `.github/workflows/web.yml`. A publishable key is intended for the browser; never put a service-role key or Spotify token in this file.

1. Apply `supabase/migrations/20261121180000_presave_service.sql` through the normal migration process. On an already linked project, inspect pending changes with `supabase db push --dry-run` before applying them with `supabase db push`. The migration can also be reviewed and executed as a complete transaction in the Supabase SQL editor. Do not rerun an already applied migration.
2. Deploy the new function:

   ```sh
   supabase functions deploy presave --no-verify-jwt
   ```

   Public pages and the Spotify callback must be callable without a Nexus JWT. The function itself verifies owner JWTs with Supabase `getUser()` and enforces MFA before any owner operation. Disabling the gateway JWT check does not disable these owner checks.

3. Host the static assets through the existing Nexus deployment. For static-only hosting, deploy `public/presave/` as its own directory, or use its existing location inside the repository. The entry must be served over HTTPS for public use.
4. Set `PRESAVE_PUBLIC_URL` in Supabase Edge Function secrets to the exact production frontend entry, with no query or fragment. Examples of path structure:

   ```text
   https://YOUR-NEXUS-HOST/presave/index.html
   https://YOUR-STATIC-HOST/public/presave/index.html
   ```

5. Confirm `config.js` points to the same Supabase project as the migration and function. Add the chosen frontend URL to Supabase Auth's redirect allowlist if password-reset email links will return to this page.
6. Verify two Nexus accounts can each create campaigns and cannot read or change one another's records. Publish a page and open its link in a signed-out browser.

No Spotify settings are needed for campaign CRUD, customization, public pages, and ordinary destination links. The Spotify button stays unavailable until all required integration settings are present.

## Connect actual Spotify pre-saves

Create or use an authorized application in the Spotify Developer Dashboard. Its provider access mode must support the intended audience; unlimited Nexus campaigns do not bypass Spotify's developer-account or quota restrictions.

Register this exact redirect URI for the existing Nexus Supabase project:

```text
https://fcnabeudhdlugruqzezn.supabase.co/functions/v1/presave?action=callback
```

If deploying to another project, replace the project origin consistently in the frontend configuration and Spotify allowlist.

Set these secrets in **Supabase → Edge Functions → Secrets**:

| Name | Value |
| --- | --- |
| `SPOTIFY_CLIENT_ID` | Spotify application's client ID |
| `PRESAVE_TOKEN_KEY` | Base64 encoding of 32 cryptographically random bytes |
| `PRESAVE_PUBLIC_URL` | Exact canonical HTTPS frontend entry URL |
| `PRESAVE_CRON_SECRET` | A separate cryptographically random secret, at least 32 characters |
| `PRESAVE_SCHEDULER_ENABLED` | Set to `true` only after the scheduler is installed and checked |
| `PRESAVE_BATCH_SIZE` | Optional, 1–50; default 10 authorizations per invocation |

The authorization flow uses PKCE and does not need a Spotify client secret. Supabase supplies `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` inside the Edge runtime.

Generate secret values in a trusted local shell or password manager. Do not commit them, put them in browser configuration, or include them in screenshots. Keep the encryption key stable: replacing it without re-encrypting existing tokens prevents pending authorizations from being fulfilled.

### Install the release worker

Create these two **Supabase Vault** secrets in the dashboard:

- `nexus_presave_url`: the full `https://<project-ref>.supabase.co/functions/v1/presave` endpoint.
- `nexus_presave_cron_secret`: exactly the same value as the Edge Function's `PRESAVE_CRON_SECRET`.

Run the reviewed `supabase/presave-schedule.sql` file in the SQL editor. It requires Supabase's supported `pg_cron`, `pg_net`, and Vault facilities and creates the named `nexus-presave-release-worker` job. The job runs every minute and reads its credentials from Vault.

Verify that the job is enabled and its HTTP calls reach the function, then set `PRESAVE_SCHEDULER_ENABLED=true`. Inspect `cron.job_run_details` and `net._http_response` for actual job and HTTP outcomes. Provider authorizations remain disabled while this flag is absent.

The flag is an operator assertion, not a live health probe. Monitor the schedule after launch. A run claims a bounded batch, so larger release audiences need a suitable batch size and capacity. This bound does not limit campaigns per creator.

### Verify one real release

Use an account authorized for your Spotify application's access mode:

1. Create a campaign with an actual Spotify track or album URL and a near-term release time.
2. Publish it, open the public link in a separate browser session, and complete Spotify authorization.
3. Confirm that the returned receipt reports a pending authorization. A `presave=success` query string by itself is not accepted as proof.
4. After the release is due and available, confirm the scheduled worker receives a successful Spotify library response, the dashboard's completed-save count increases, and the release appears in the authorized account's library.
5. Verify cancellation with a second authorization, and verify that unpublishing pauses future claims.

These are live deployment checks. The repository's local tests simulate provider responses and do not establish that an external Spotify application is approved or correctly configured.

## Spotify behavior and limitations

Fans authorize the exact track or album URI configured on the campaign. The first consent locks that recording. Duplicate the campaign if a different recording is needed. Changing the campaign release time affects new authorizations; existing authorizations keep the release time they consented to.

The current Spotify implementation requests `user-library-modify` and `user-read-private`, uses Authorization Code with PKCE, refreshes the authorization server-side, and saves the exact URI with `PUT /v1/me/library`. Provider `2xx` responses mark a save complete. Temporary failures, missing releases, and rate limits retry with bounded backoff; access errors or exhausted retries are recorded as failures.

Spotify documents a six-month refresh-token lifetime that is not extended by refreshes. New fan authorizations therefore open within 179 days of release. Creators can still create and customize campaigns earlier. Reauthorization is required after expiry or revoked access.

Apple Music, YouTube, SoundCloud, Bandcamp, and other configured buttons are outbound destination links. They are not automated library saves.

Official provider references, checked on November 21, 2026:

- [Authorization Code with PKCE](https://developer.spotify.com/documentation/web-api/tutorials/code-pkce-flow)
- [Save items to a Spotify library](https://developer.spotify.com/documentation/web-api/reference/save-library-items)
- [Refresh tokens and their lifetime](https://developer.spotify.com/documentation/web-api/tutorials/refreshing-tokens)
- [Spotify quota modes](https://developer.spotify.com/documentation/web-api/concepts/quota-modes)

## Data and access behavior

Owner operations require a valid Nexus session. Accounts with a verified MFA factor must use AAL2. Database policies enforce the same condition for direct campaign and artwork access.

The public campaign projection includes only published page content. It does not expose owner IDs, fan identifiers, OAuth state, cancellation hashes, or provider credentials. Unpublishing immediately removes the public page and pauses pending claims. Deleting a campaign cascades its authorizations, analytics, and OAuth states.

Spotify refresh tokens are encrypted with AES-GCM with per-record context. The service stores a hash of the Spotify account identifier for deduplication and does not retain fan email addresses. It removes refresh tokens after successful fulfillment, cancellation, terminal failure, or expiry.

The cancellation token is a private capability. It arrives in the URL fragment, is removed from the address bar, and is kept only in session storage for the current browser session. Fans can copy their cancellation link before closing the session. Anyone with that link can inspect and cancel that one authorization. Cancellation cannot undo an already completed or in-flight Spotify API write; the fan can remove the music in Spotify and revoke app access in [Spotify's account app settings](https://www.spotify.com/account/apps/).

Artwork uses a public bucket because it appears on publicly shareable release pages. Only its owner can upload, replace, or delete objects in that owner's path. Draft campaign data is private, but an uploaded artwork URL itself can be viewed by anyone who knows it. Replaced or abandoned uploads are not deleted automatically; review unused objects through the normal storage-maintenance process.

View and click counts are rate-limited activity counts, not unique-visitor analytics. Public authorization and cancellation endpoints also have abuse limits; campaign creation has no count cap. Rate-limit keys hash the proxy-provided IP address with a server secret rather than retaining raw addresses.

## API overview

All JSON actions use `POST /functions/v1/presave`.

| Action | Access | Result |
| --- | --- | --- |
| `config` | Public | Canonical page URL and Spotify readiness |
| `list` | Owner JWT + MFA if enrolled | Paginated campaigns, per-page statistics, summary |
| `save` | Owner JWT + MFA if enrolled | Create/update validated owner campaign |
| `duplicate` | Owner JWT + MFA if enrolled | New private campaign with a unique slug |
| `delete` | Owner JWT + MFA if enrolled | Owner campaign removed |
| `page` | Public | Published page by slug |
| `track` | Public, rate limited | View or destination-click recorded |
| `authorize` | Public, rate limited | One-time Spotify connection URL |
| `receipt` | Matching cancellation capability and slug | Narrow authorization status |
| `cancel` | Cancellation capability | Neutral cancellation response |
| `run` | Dedicated cron-secret header | Process due authorization batch |

`GET ?action=connect` establishes the browser-bound OAuth cookie. `GET ?action=callback` consumes the single-use state and completes authorization. Both use expiring state, strict redirect validation, and no-store responses.

## Verification and current limits

Run `npm run test:presave` for dependency-free core and handler checks. Follow [tests/README.md](../tests/README.md) to run the actual PostgreSQL migration tests with PGlite. The dedicated CI workflow installs its test engine outside the project dependencies.

The tests cover isolated ownership, anonymous draft denial, MFA, 125 independent campaign inserts, input validation, PKCE, browser binding, replay rejection, authenticated encryption, cancellation receipts, exact provider targets, successful-save cleanup, failure/retry behavior, storage policies, and job leases.

The creation environment could not provide its browser preview relay, so rendered desktop/mobile layouts have not been visually verified there. Before launch, check the dashboard, editor, modal keyboard focus, artwork uploads, public page, and release countdown in desktop and mobile browsers. Local database tests do not replace live Supabase/Spotify smoke checks.
