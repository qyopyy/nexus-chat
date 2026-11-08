# @qyopyy/geo-utils

Tiny geo helpers from Wump: `metersBetween` (haversine), `parseLatLng`, `fmtDistance`, `fmtDuration`, `compass`, `directionsUrl` (Apple / Google Maps) and `fuzz` (privacy rounding).

```ts
import { metersBetween, fmtDistance, directionsUrl } from "@qyopyy/geo-utils";
fmtDistance(metersBetween([47.4979, 19.0402], [47.5, 19.05])); // "800 m"
```

## Install (GitHub Packages)

```sh
echo "@qyopyy:registry=https://npm.pkg.github.com" >> .npmrc
npm install @qyopyy/geo-utils
```

MIT © qyopy · part of [Nexus](https://nexusproject.cc)
