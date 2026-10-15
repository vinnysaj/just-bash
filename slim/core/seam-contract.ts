// Type-checked only: fails when slim/core/addons.ts and upstream's
// packages/just-bash/src/addons.ts stop exporting the same functions with the
// same signatures, since the build swaps one for the other.

declare const slim: typeof import("./addons.js");
declare const upstream: typeof import("../../packages/just-bash/src/addons.js");

export const slimProvidesUpstreamSeam: typeof upstream = slim;
export const upstreamProvidesSlimSeam: typeof slim = upstream;
