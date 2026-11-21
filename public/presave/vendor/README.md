# Locally served Supabase SDK

`supabase.mjs` bundles **@supabase/supabase-js 2.119.0** and its browser dependencies using **esbuild 0.28.2**. This matches Nexus's existing locked SDK version. It provides account session sharing, MFA, and authenticated artwork uploads without loading a remote CDN script.

Copyright and license notices are in `THIRD_PARTY_LICENSES.txt`.

To reproduce from the repository root:

```sh
npm install --prefix /tmp/nexus-presave-vendor --no-audit --no-fund \
  @supabase/supabase-js@2.119.0 esbuild@0.28.2
/tmp/nexus-presave-vendor/node_modules/.bin/esbuild \
  /tmp/nexus-presave-vendor/node_modules/@supabase/supabase-js/dist/index.mjs \
  --bundle --format=esm --platform=browser --target=es2022 \
  --minify --legal-comments=eof \
  --outfile=public/presave/vendor/supabase.mjs
```

Review and update the third-party license notices whenever changing bundled dependencies. No runtime secret is included in this bundle.
