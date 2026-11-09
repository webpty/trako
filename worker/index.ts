// The way in: a browser asking for the page or the API, the relay handing
// over records, the sign-in link in a message, and the timer.

import { build } from "./app";
import { refreshDays } from "./domain/figures";
import { handleApi } from "./http/router";
import { handleSignInLink } from "./http/sign-in-link";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/")) {
      try {
        const answer = await handleApi(request, env);
        const stamped = new Response(answer.body, answer);
        stamped.headers.set("x-trako-version", __VERSION__);
        return stamped;
      } catch (error) {
        // Nothing fails silently. The page shows what this says.
        console.error("api", error);
        return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Something broke." }), {
          status: 500,
          headers: { "content-type": "application/json; charset=utf-8" },
        });
      }
    }

    if (url.pathname.startsWith("/in/")) return handleSignInLink(request, env);

    return env.ASSETS.fetch(request);
  },

  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      refreshDays(build(env), 200).catch((error: unknown) => {
        console.error("days", error instanceof Error ? error.message : "unknown");
      }),
    );
  },
};
