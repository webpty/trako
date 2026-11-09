import { readFileSync } from "node:fs";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { cloudflare } from "@cloudflare/vite-plugin";

// The number in the corner of the site. Kept in package.json and raised with
// the commit that goes out: what builds the site clones it shallow.
const VERSION = (
  JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as {
    version: string;
  }
).version;

// The Cloudflare plugin goes last: it reads wrangler.toml, bundles the Worker
// from `main`, and writes the generated config under dist/.
export default defineConfig({
  plugins: [react(), tailwindcss(), cloudflare()],
  define: { __VERSION__: JSON.stringify(VERSION) },
  // Its own port, never another site's, so the browser keeps the right icon.
  server: { port: 8810, strictPort: true, host: true, allowedHosts: true },
});
