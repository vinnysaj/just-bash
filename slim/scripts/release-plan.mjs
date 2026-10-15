// Decides what a run of slim-release.yml does, and writes it to
// $GITHUB_OUTPUT (action, version, tag, reason):
//
//   bootstrap  the first release: publish <version>-rc.0 with a token
//   release    npm lacks slim's version: test it and publish it
//   sync       upstream has a newer release old enough to take: merge it,
//              test it, and publish it with the upstream version
//   none       nothing to do
//
//   node scripts/release-plan.mjs
//
// Reads GITHUB_EVENT_NAME, BOOTSTRAP ("true" to bootstrap), BLOCKED ("true"
// while a release issue is open, which holds back scheduled runs), and
// MIN_AGE_DAYS (how long an upstream release must have been on npm before
// it is taken).

import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { CORE_NAME, upstreamBase, VERSION } from "../config.mjs";
import { compareVersions, UPSTREAM_URL } from "./sync-upstream.mjs";

const RELEASE_TAG = /^refs\/tags\/just-bash@(\d+\.\d+\.\d+)$/;
const DAY_MS = 24 * 60 * 60 * 1000;

const event = process.env.GITHUB_EVENT_NAME ?? "workflow_dispatch";
const minAgeDays = Number(process.env.MIN_AGE_DAYS ?? "3");

function decide(plan) {
  console.log(`${plan.action}: ${plan.reason}`);
  for (const [name, value] of Object.entries(plan)) {
    if (process.env.GITHUB_OUTPUT) {
      appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
    }
  }
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `**${plan.action}**: ${plan.reason}\n`,
    );
  }
  process.exit(0);
}

/** Whether npm has `spec`; any registry error other than "not found" throws. */
function onNpm(spec) {
  try {
    execFileSync("npm", ["view", spec, "version"], { stdio: "pipe" });
    return true;
  } catch (error) {
    if (String(error.stderr).includes("E404")) return false;
    throw new Error(`npm view ${spec} failed:\n${error.stderr}`);
  }
}

/** Upstream's stable release versions, oldest first. */
function upstreamReleases() {
  return execFileSync(
    "git",
    ["ls-remote", "--tags", UPSTREAM_URL, "refs/tags/just-bash@*"],
    { encoding: "utf8" },
  )
    .split("\n")
    .map((line) => RELEASE_TAG.exec(line.split("\t")[1] ?? "")?.[1])
    .filter(Boolean)
    .sort(compareVersions);
}

/** When npm received each upstream version. */
function upstreamPublishTimes() {
  return JSON.parse(
    execFileSync("npm", ["view", "just-bash", "time", "--json"], {
      encoding: "utf8",
    }),
  );
}

const base = upstreamBase().version;

if (process.env.BOOTSTRAP === "true") {
  decide({
    action: "bootstrap",
    version: `${VERSION}-rc.0`,
    tag: "",
    reason: `publish ${VERSION}-rc.0 with NPM_TOKEN so the packages exist for trusted publishing`,
  });
}

if (process.env.BLOCKED === "true" && event === "schedule") {
  decide({
    action: "none",
    version: VERSION,
    tag: "",
    reason:
      "an open slim-release issue is waiting for a person; run by hand to retry",
  });
}

if (!onNpm(CORE_NAME)) {
  decide({
    action: "none",
    version: VERSION,
    tag: "",
    reason: `${CORE_NAME} is not on npm yet; run this workflow with bootstrap first`,
  });
}

if (!onNpm(`${CORE_NAME}@${VERSION}`)) {
  decide({
    action: "release",
    version: VERSION,
    tag: "",
    reason: `npm does not have ${VERSION} yet`,
  });
}

if (event === "push") {
  decide({
    action: "none",
    version: VERSION,
    tag: "",
    reason: `${VERSION} is already published`,
  });
}

const next = upstreamReleases().find(
  (version) => compareVersions(version, base) > 0,
);
if (next === undefined) {
  decide({
    action: "none",
    version: VERSION,
    tag: "",
    reason: `up to date with just-bash@${base}`,
  });
}

const published = upstreamPublishTimes()[next];
if (published === undefined) {
  decide({
    action: "none",
    version: VERSION,
    tag: "",
    reason: `just-bash@${next} is tagged but not on npm yet`,
  });
}
const ageDays = (Date.now() - new Date(published).getTime()) / DAY_MS;
if (ageDays < minAgeDays) {
  decide({
    action: "none",
    version: VERSION,
    tag: "",
    reason: `just-bash@${next} is ${ageDays.toFixed(1)} days old; it is taken once it is ${minAgeDays} days old`,
  });
}

decide({
  action: "sync",
  version: next,
  tag: `just-bash@${next}`,
  reason: `merge just-bash@${next} (from just-bash@${base}) and publish ${next}`,
});
