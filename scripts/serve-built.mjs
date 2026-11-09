// Runs the built Worker the way it will actually run, minus the custom domain.
//
//   node scripts/serve-built.mjs [port] [--lan]
//
// --lan binds to every interface so a phone on the same network can reach it.
// Note that a plain http address is not a secure context in Safari, so
// passkeys, the camera and working offline are all switched off there.
//
// The Vite dev server is not a fair test: its host check and its absent
// bindings produce both failures and passes that mean nothing. This serves
// dist/ instead. The one thing stripped is the route, because a custom domain
// makes wrangler present the site as trako.net and nothing local can reach it.

import { spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const args = process.argv.slice(2);
const lan = args.includes("--lan");
const port = args.find((a) => /^\d+$/.test(a)) ?? "8810";
const built = "dist/trako/wrangler.json";
const local = "dist/trako/wrangler-dev.json";

const config = JSON.parse(readFileSync(built, "utf8"));
delete config.routes;
delete config.route;
writeFileSync(local, JSON.stringify(config, null, 2));

spawn(
  "npx",
  [
    "wrangler",
    "dev",
    "-c",
    local,
    "--port",
    port,
    ...(lan ? ["--ip", "0.0.0.0"] : []),
    "--persist-to",
    ".wrangler/state",
  ],
  { stdio: "inherit" },
);
