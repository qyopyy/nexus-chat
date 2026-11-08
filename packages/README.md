# Nexus open-source packages

Small, dependency-free pieces of Nexus published to **GitHub Packages** (npm registry `npm.pkg.github.com`).

| Package | What it does |
|---|---|
| [`@qyopyy/net-guard`](net-guard) | SSRF-safe fetching of user-supplied URLs |
| [`@qyopyy/md5`](md5) | Incremental MD5 for Blobs / big files |
| [`@qyopyy/geo-utils`](geo-utils) | Haversine, formatting, map links |

## Publishing

Bump `version` in the package's `package.json`, then GitHub → **Actions → Publish packages → Run workflow** (or push a tag `pkg-v*`).
The workflow builds every package and publishes versions that aren't on the registry yet, using the repo's built-in `GITHUB_TOKEN`
(no extra secrets). Packages appear under the repo's **Packages** sidebar.
