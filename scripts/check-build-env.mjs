// Runs before every build. Two checks, each naming the actual problem, because
// both otherwise surface as something unrelated.
//
// 1. In CI, HEROUI_AUTH_TOKEN must be set. @heroui-pro/react ships as a public
//    npm package whose install script fetches the real artifacts using this
//    token; locally the heroui-pro CLI session does the same job. On Cloudflare
//    Workers Builds it must be a BUILD variable, not a runtime one.
//
// 2. Always, the Pro artifacts must be on disk.
import { existsSync } from "node:fs";

const inCI = !!process.env.CI;
if (inCI && !process.env.HEROUI_AUTH_TOKEN) {
  console.error(
    "\nHEROUI_AUTH_TOKEN is not set in this build environment.\n" +
      "@heroui-pro/react needs it at install time. On Workers Builds it goes under\n" +
      "Settings > Build > Build variables and secrets, not the runtime panel.\n",
  );
  process.exit(1);
}

const proEntry = "node_modules/@heroui-pro/react/dist/index.js";
if (!existsSync(proEntry)) {
  console.error(
    `\n${proEntry} is missing.\n` +
      "The Pro install script did not fetch the artifacts. Locally: run\n" +
      "`npx heroui-pro login` then `npx heroui-pro install react`. In CI: check\n" +
      "HEROUI_AUTH_TOKEN is present and valid.\n",
  );
  process.exit(1);
}
