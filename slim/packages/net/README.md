# @vinnysaj/just-bash-net

Provides the network transport behind the `network` option of [@vinnysaj/just-bash](https://github.com/vinnysaj/just-bash#readme): [guarded-fetch](https://www.npmjs.com/package/guarded-fetch), which blocks private addresses and pins DNS.

```sh
npm install @vinnysaj/just-bash @vinnysaj/just-bash-net
```

```ts
import { Bash } from "@vinnysaj/just-bash";

const bash = new Bash({
  network: { allowedUrlPrefixes: ["https://api.example.com/"] },
});
```

`curl` itself is part of core, and a custom `fetch` option works without this package. Install the same version as `@vinnysaj/just-bash`. See the [main README](https://github.com/vinnysaj/just-bash#readme) for sizes and differences from upstream just-bash.
