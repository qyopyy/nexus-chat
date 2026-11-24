# Nexus Pre-save service

Nexus Pre-save adds independent, customizable campaigns to `qyopyy/nexus-chat`. Campaign creation is not tied to a distribution release, subscription plan, or application-level campaign quota. Storage, database capacity, hosting, and Spotify's own access limits still apply.

## User experience

Open **Pre-save links** in the Next.js desktop sidebar, the mobile tools list, or the legacy static workspace. Sign in with an existing Nexus account or create one through the existing Nexus signup function. Same-origin sessions use the standard Supabase session key. TOTP MFA is supported; passkey users can complete authentication in the existing Nexus login screen.

The service includes:

- A paginated, searchable campaign dashboard with published/draft filters.
- Unlimited campaign creation; independent public URLs and private drafts.
- Editing, duplication into a fresh private draft, publication, unpublication, and deletion.
- Custom title, artist, description, release time, slug, cover artwork, theme, layout, accent, button text, and countdown.
- Sixteen preset themes: Midnight, Paper, Aurora, Sunset, Galaxy, Nebula, Starlight, Ocean, Forest, Rose, Ember, Arctic, Lavender, Monochrome, Neon, and Champagne, plus a Custom theme with editable background and text colors.
- Animated star fields and nebula light for Galaxy, Nebula, and Starlight. The creator can disable motion; a visitor's reduced-motion preference also disables the animation.
- JPG, PNG, or WebP artwork and background uploads up to 5 MB, plus external HTTPS image URLs. Background shading ranges from 0–90% to help keep release details readable.
- Modern, editorial, and monospace typography; rounded, pill, and square buttons; centered and split layouts; custom palette contrast feedback; and appearance reset without removing release details or cover artwork.
- A live page preview and an expanded mobile/desktop preview. Saved appearance is carried through editing, duplication, and public-page rendering.
- Up to twelve destination buttons per campaign, with labels up to 60 characters. This is a page-content bound, not a campaign-count limit.
- View and destination-click counts, Spotify authorization counts, and completed-save counts.
- Public pages that visitors can open without a Nexus account.
- Real Spotify authorization and scheduled library saves after configuration.
- A private cancellation capability and a verified status receipt for each fan authorization.

The editor and template previews work before signing in. Only a successful server save creates a persistent campaign. The UI does not create local-only campaigns that appear to have been published.

### Appearance settings

| Field | Allowed value and default | Behavior |
| --- | --- | --- |
| `theme` | Sixteen preset names above, or `custom`; default `midnight` | Chooses the page palette and background treatment. |
| `background_url` | HTTPS image URL up to 2,048 characters after URL normalization; default `null` | Adds a full-page background image. Uploads populate the same field. |
| `background_overlay` | Integer from `0` to `90`; default `55` | Sets the dark shade over a background image, in percent. |
| `background_motion` | Boolean; default `true` | Enables motion for the three animated themes, subject to the visitor's reduced-motion preference. |
| `background_color` | Six-digit hexadecimal color; default `#101019` | Sets the base background for the Custom theme. |
| `text_color` | Six-digit hexadecimal color; default `#f5f5fb` | Sets the text color for the Custom theme. |
| `button_style` | `rounded`, `pill`, or `square`; default `rounded` | Changes the Spotify and destination button shapes. |
| `font_style` | `modern`, `editorial`, or `mono`; default `modern` | Uses built-in font stacks; no external font upload or font service is needed. |

The existing accent color controls the primary button, with light or dark button text chosen for readability. Preset selection sets its suggested accent, which can then be customized. The Custom theme's contrast hint compares its text and solid background colors; image readability still needs a visual check. Failed background images fall back to the selected page theme. Removing an image from a campaign does not delete the uploaded object from storage.

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
| `supabase/migrations/20261123120000_presave_design.sql` | Additional themes, validated appearance fields, and updated public-page projection |
| `supabase/functions/presave/index.ts` | Supabase Edge entry |
| `supabase/functions/presave/handler.mjs` | Request handling and Spotify workflow |
| `supabase/functions/presave/core.mjs` | Validation, PKCE, encryption, retry logic |
| `supabase/presave-schedule.sql` | Optional release-worker schedule |
| `tests/presave*.test.mjs` | Focused frontend, handler, and PostgreSQL checks |

## Deploy or upgrade the basic service

Use the Supabase project that already owns Nexus accounts. `public/presave/config.js` starts with the existing public settings from `.github/workflows/web.yml`. A publishable key is intended for the browser; never put a service-role key or Spotify token in this file.

1. Apply the database migrations through the normal migration process. On an already linked project, inspect pending changes with `supabase db push --dry-run` before applying reviewed pending migrations with `supabase db push`. The SQL files can also be reviewed and executed as complete transactions in the Supabase SQL editor.

   | Installation state | Pre-save migration order |
   | --- | --- |
   | Fresh pre-save installation | Apply `supabase/migrations/20261121180000_presave_service.sql`, then `supabase/migrations/20261123120000_presave_design.sql`. |
   | Original pre-save service already installed | Apply only `supabase/migrations/20261123120000_presave_design.sql` if it has not yet been applied. |

   Do not rerun an already applied migration. The design migration extends the allowed themes, adds appearance columns with defaults for existing campaigns, and updates the published-page projection. It preserves the existing ownership and MFA policies.

2. Redeploy the pre-save Edge Function **after the design migration succeeds**:

   ```sh
   supabase functions deploy presave --no-verify-jwt
   ```

   Public pages and the Spotify callback must be callable without a Nexus JWT. The function itself verifies owner JWTs with Supabase `getUser()` and enforces MFA before any owner operation. Disabling the gateway JWT check does not disable these owner checks.

3. Publish the updated frontend assets **after the migration and Edge Function update**. Host them through the existing Nexus deployment. For static-only hosting, deploy `public/presave/` as its own directory, or use its existing location inside the repository. The entry must be served over HTTPS for public use.
4. Set `PRESAVE_PUBLIC_URL` in Supabase Edge Function secrets to the exact production frontend entry, with no query or fragment. Examples of path structure:

   ```text
   https://YOUR-NEXUS-HOST/presave/index.html
   https://YOUR-STATIC-HOST/public/presave/index.html
   ```

5. Confirm `config.js` points to the same Supabase project as the migration and function. Add the chosen frontend URL to Supabase Auth's redirect allowlist if password-reset email links will return to this page.
6. Verify two Nexus accounts can each create campaigns and cannot read or change one another's records. Save a campaign with a new theme and background, reopen it, duplicate it, and confirm its appearance. Publish a page and open its link in a signed-out browser, including a mobile viewport and reduced-motion mode.

The rollout order matters: the updated function and frontend send fields that do not exist in the original database schema. Deploying them first can cause save failures. Existing campaigns keep their original themes and receive defaults for the added fields. When an older client omits the new appearance fields from an update, the updated handler preserves their stored values. Apply any normal asset-cache invalidation used by the deployment so editors receive the new theme controls.

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

Cover artwork and background images share the existing public `presave-artwork` bucket because they appear on publicly shareable release pages. Only their owner can upload, replace, or delete objects in that owner's path. Draft campaign data is private, but an uploaded image URL itself can be viewed by anyone who knows it. Replaced, removed, or abandoned uploads are not deleted automatically; review unused objects through the normal storage-maintenance process. No additional storage bucket is required for background images.

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

The tests cover isolated ownership, anonymous draft denial, MFA, 125 independent campaign inserts, input validation, PKCE, browser binding, replay rejection, authenticated encryption, cancellation receipts, exact provider targets, successful-save cleanup, failure/retry behavior, storage policies, and job leases. Appearance coverage includes all preset names and defaults, database constraints and public projection, create/edit/list/duplicate behavior, preservation of new fields omitted by older clients, and unsafe URL or style rejection. DOM tests cover save/reopen/duplicate/public-page appearance, background upload validation and error recovery, broken-image fallback, custom contrast feedback, preview sizes, and appearance reset.

The local tests do not establish production deployment or provider readiness. Before launch, check the dashboard, theme gallery, editor, modal keyboard focus, artwork/background uploads, galaxy motion and reduced-motion behavior, public page, and release countdown in desktop and mobile browsers. DOM tests do not verify rendered layout. Local database tests do not replace live Supabase/Spotify smoke checks, and a successful local run does not mean migrations, Edge Functions, or frontend assets have been deployed.

## Custom endings and your own domain

Every campaign has a clean link in addition to the original query-string link:

| Link | Example |
| --- | --- |
| Clean ending (Nexus site) | `https://nexusproject.cc/p/your-release` |
| Original (still works) | `https://nexusproject.cc/presave/index.html?slug=your-release` |

The ending is the campaign's **link name** from the editor. `next.config.ts` rewrites `/p/:slug` to `/presave/index.html`; `index.html` adds a `<base href="/presave/">` so styles and scripts still load, and `app.mjs` reads the slug from the path. Hosts that do not serve `/p/` (for example the legacy static workspace under `/public/presave/`) keep the query-string link automatically.

### Own domain

In the editor of a saved campaign, **Your own domain** lets a creator open the page at an address they own, such as `music.yourname.com`.

1. The creator enters the domain. The service stores a pending claim with a random proof token (`presave_domains`).
2. The creator adds two DNS records at their registrar: a TXT proof (`_nexus-presave.<domain>` = `nexus-presave-verify=<token>`) and a routing record (`CNAME cname.vercel-dns.com` for a subdomain, `A 76.76.21.21` for an apex domain).
3. **Check DNS** (rate limited to 20 checks per 5 minutes) looks the records up through DNS-over-HTTPS. TXT found → *Verified*. TXT found, routing correct and the domain attached to the hosting project → *Live*.
4. `src/proxy.ts` looks up non-Nexus hosts (cached for 60 seconds). A live pre-save host opens the campaign at `/`; any other path redirects to the Nexus site.

Only verified or live claims serve a page. A pending claim never does, so typing someone else's domain gives no access to it. One campaign can hold one domain; a domain can belong to only one campaign or one Nexus profile at a time.

**Optional automatic HTTPS.** Set these Edge Function secrets so the service adds and removes the domain on the Vercel project itself: `VERCEL_TOKEN`, `VERCEL_PROJECT_ID` and, for team projects, `VERCEL_TEAM_ID` (the same secrets the profile `domains` function uses). Without them a verified domain waits at *Verified* until the domain is added to the project by hand in the Vercel dashboard.

**Spotify on a custom domain.** After fans authorize, Spotify returns them to the same domain. The service only accepts a return address that is the configured entry path on a host connected to that campaign. Nothing else is trusted. The Spotify app's redirect URI is still the single Edge Function callback, so no Spotify dashboard change is needed.

### Rollout

1. Apply `supabase/migrations/20261124120000_presave_domains.sql` (after the earlier pre-save migrations).
2. Redeploy the Edge Function: `supabase functions deploy presave --no-verify-jwt`.
3. Deploy the site (new `next.config.ts` rewrite, `src/proxy.ts`, and `public/presave/*`).
4. Optionally add the Vercel secrets above.
