# @vinnysaj/just-bash-js

Adds the `js-exec` and `node` commands to [@vinnysaj/just-bash](https://github.com/vinnysaj/just-bash#readme): a sandboxed JavaScript and TypeScript runtime built on QuickJS, through [run](https://www.npmjs.com/package/run).

```sh
npm install @vinnysaj/just-bash @vinnysaj/just-bash-js
```

```ts
import { Bash } from "@vinnysaj/just-bash";

const bash = new Bash({ javascript: true });
```

Install the same version as `@vinnysaj/just-bash`. See the [main README](https://github.com/vinnysaj/just-bash#readme) for sizes and differences from upstream just-bash.
