# Pre-save verification

For the new device sharing protocol, room/DOM tests, and existing cloud-inbox security tests, see [Nexus Drop verification](../docs/nexus-drop.md#verification). `npm test` includes its dependency-free protocol tests; `npm run test:drop:integration` includes the optional DOM and PostgreSQL suites.

The pre-save tests are independent of the repository's existing Next.js build configuration.

The root `npm test` command runs the existing app tests in `src/lib/*.test.mts` and the dependency-free pre-save tests below. Use Node.js 22.18 or newer for the app's native TypeScript tests. `npm run typecheck` checks the full Next.js application, and `npm run build` creates its production build.

Run the dependency-free security and cryptography checks:

```sh
node --test tests/presave-core.test.mjs tests/presave-browser-core.test.mjs tests/presave-handler.test.mjs
```

Run the database tests against an isolated, in-memory PostgreSQL engine:

```sh
npm install --prefix /tmp/nexus-presave-qa --no-audit --no-fund @electric-sql/pglite@0.5.17
PRESAVE_PGLITE_MODULE=/tmp/nexus-presave-qa/node_modules/@electric-sql/pglite/dist/index.cjs \
  node --test tests/presave-database.test.mjs
```

The database test loads the real original pre-save migration followed by the additive `20261123120000_presave_design.sql` migration. It stubs only the Supabase platform primitives: auth users, JWT identity functions, MFA factors, and storage metadata tables. It verifies actual PostgreSQL grants, row-level security, constraints, triggers, pagination, rate limits, job leases, all preset/custom themes, appearance defaults and bounds, and the published-page projection. It never connects to the configured Supabase project or modifies production data.

Database tests explicitly report a skip if PGlite is unavailable. Set `PRESAVE_PGLITE_MODULE` when using an isolated dependency installation; an invalid explicit path fails rather than silently skipping.

The HTTP handler tests run the real request handler with an in-memory PostgREST transport double and mocked Spotify responses. They cover authentication, ownership, MFA, request limits, scheduler authorization, the PKCE/cookie/state exchange, and success versus rate-limit handling. They also verify appearance persistence through create, edit, list, and duplication, plus preservation of new appearance fields when older clients omit them from updates. They send no real provider requests and do not prove live Spotify app access.

Optional DOM integration checks run the real `app.mjs` and HTML in jsdom, with only authentication/API modules replaced by deterministic test doubles. They check dashboard/editor wiring, live preview escaping, template selection, unsaved-change confirmation, signed-out saves, receipt-verified public confirmation, and the customization workflow:

- Theme, background, overlay, motion, color, typography, and button settings reach the save payload and survive reopening and duplication.
- Public pages render the same saved appearance, with sanitized HTML and style values.
- Background uploads reject unsupported types, empty images, and files larger than 5 MB; failures preserve the previous image and allow retry.
- Broken background images fall back to the selected theme.
- Custom palette contrast feedback, mobile/desktop preview controls, and appearance reset work without removing release details.

Use Node 24 LTS version 24.15.0 or newer for these optional checks (verified here with Node 24.22.3).

```sh
npm install --prefix /tmp/nexus-presave-qa --no-audit --no-fund jsdom@31.0.1 esbuild@0.28.2
PRESAVE_QA_PACKAGE=/tmp/nexus-presave-qa/package.json \
  node --test tests/presave-dom.test.mjs
```

These are DOM/runtime tests, not browser automation or visual verification. External resources and real network calls are disabled. The DOM tests explicitly skip when their optional dependencies are unavailable; an invalid explicit `PRESAVE_QA_PACKAGE` fails.

PGlite serializes queries on one connection. The lease tests verify that active claims cannot be re-claimed, and that expired claims receive fresh tokens. They are not a multi-connection contention stress test. Supabase HTTP behavior, OAuth provider acceptance, Storage's upload MIME/size enforcement, deployment secrets, and scheduling still need configured-environment smoke checks. Storage row-level policies and bucket configuration are tested locally.
