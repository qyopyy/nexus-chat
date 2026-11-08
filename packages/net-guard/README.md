# @qyopyy/net-guard

SSRF guard for Node / Next.js route handlers that fetch user-supplied URLs (link previews, image proxies, readers).

- Rejects non-http(s), credentials in URLs and unusual ports
- Blocks private, loopback, link-local, CGNAT, cloud-metadata and multicast addresses — including hostnames that **resolve** to them
- `fetchPublic` follows redirects manually and re-validates every hop

```ts
import { safePublicUrl, fetchPublic, SANDBOX_HEADERS } from "@qyopyy/net-guard";

const url = await safePublicUrl(req.nextUrl.searchParams.get("u") ?? "");
if (!url) return new Response("Blocked", { status: 400 });
const { res } = await fetchPublic(url, { maxHops: 4 });
```

## Install (GitHub Packages)

```sh
echo "@qyopyy:registry=https://npm.pkg.github.com" >> .npmrc
npm install @qyopyy/net-guard
```

MIT © qyopy · part of [Nexus](https://nexusproject.cc)
