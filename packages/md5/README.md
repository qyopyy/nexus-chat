# @qyopyy/md5

Incremental MD5 (RFC 1321) with zero dependencies — Web Crypto has no MD5, but DDEX deliveries and some APIs still require it.

```ts
import { Md5, md5Blob } from "@qyopyy/md5";

const hex = await md5Blob(file, (done) => console.log(done));   // chunked, works on big files
const h = new Md5(); h.update(new TextEncoder().encode("abc")); h.hex();
```

## Install (GitHub Packages)

```sh
echo "@qyopyy:registry=https://npm.pkg.github.com" >> .npmrc
npm install @qyopyy/md5
```

MIT © qyopy · part of [Nexus](https://nexusproject.cc)
