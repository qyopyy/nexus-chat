# Pre-save verification

The pre-save tests are independent of the repository's existing Next.js build configuration.

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

The database test loads the real pre-save migration. It stubs only the Supabase platform primitives: auth users, JWT identity functions, MFA factors, and storage metadata tables. It verifies actual PostgreSQL grants, row-level security, constraints, triggers, pagination, rate limits, and job leases. It never connects to the configured Supabase project or modifies production data.

Database tests explicitly report a skip if PGlite is unavailable. Set `PRESAVE_PGLITE_MODULE` when using an isolated dependency installation; an invalid explicit path fails rather than silently skipping.

The HTTP handler tests run the real request handler with an in-memory PostgREST transport double and mocked Spotify responses. They cover authentication, ownership, MFA, request limits, scheduler authorization, the PKCE/cookie/state exchange, and success versus rate-limit handling. They send no real provider requests and do not prove live Spotify app access.

Optional DOM integration checks run the real `app.mjs` and HTML in jsdom, with only authentication/API modules replaced by deterministic test doubles. They check dashboard/editor wiring, live preview escaping, template selection, unsaved-change confirmation, signed-out saves, and receipt-verified public confirmation:

Use Node 24 LTS version 24.15.0 or newer for these optional checks (verified here with Node 24.22.3).

```sh
npm install --prefix /tmp/nexus-presave-qa --no-audit --no-fund jsdom@31.0.1 esbuild@0.28.2
PRESAVE_QA_PACKAGE=/tmp/nexus-presave-qa/package.json \
  node --test tests/presave-dom.test.mjs
```

These are DOM/runtime tests, not browser automation or visual verification. External resources and real network calls are disabled. The DOM tests explicitly skip when their optional dependencies are unavailable; an invalid explicit `PRESAVE_QA_PACKAGE` fails.

PGlite serializes queries on one connection. The lease tests verify that active claims cannot be re-claimed, and that expired claims receive fresh tokens. They are not a multi-connection contention stress test. Supabase HTTP behavior, OAuth provider acceptance, Storage's upload MIME/size enforcement, deployment secrets, and scheduling still need configured-environment smoke checks. Storage row-level policies and bucket configuration are tested locally.
