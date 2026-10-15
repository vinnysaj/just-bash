import { mergeConfig } from "vitest/config";
import upstream from "../../packages/just-bash/vitest.comparison.config.ts";
import { slimConfig } from "./slim-config.ts";

export default mergeConfig(upstream, slimConfig("core"));
